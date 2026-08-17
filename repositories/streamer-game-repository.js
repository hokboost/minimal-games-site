'use strict';

const crypto = require('node:crypto');

function stableJson(value) {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
    return JSON.stringify(value);
}

function runRow(row) {
    if (!row) return null;
    return {
        id: row.id,
        gameId: row.game_id,
        configVersion: row.config_version,
        contentHash: row.content_hash,
        contentSnapshot: row.content_snapshot,
        versionId: Number(row.version_id),
        creatorUserId: Number(row.creator_user_id),
        creatorUsername: row.creator_username,
        ownerUserId: row.owner_user_id === null ? null : Number(row.owner_user_id),
        ownerUsername: row.owner_username || null,
        liveInteractionId: row.live_interaction_id === null ? null : Number(row.live_interaction_id),
        mode: row.mode,
        difficulty: row.difficulty,
        status: row.status,
        revision: Number(row.revision),
        nextSequence: Number(row.next_sequence),
        score: Number(row.score),
        state: row.state,
        consentRevokedReason: row.consent_revoked_reason || null,
        consentRevokedAt: row.consent_revoked_at || null,
        dailyKey: row.daily_key || null,
        dailyTimezone: row.daily_timezone || null,
        dailyWindowStart: row.daily_window_start || null,
        dailyWindowEnd: row.daily_window_end || null,
        resumed: row.resumed === true,
        startedAt: row.started_at,
        updatedAt: row.updated_at
    };
}

class StreamerGameRepository {
    constructor({ pool }) {
        if (!pool?.connect || !pool?.query) throw new TypeError('StreamerGameRepository requires a pool');
        this.pool = pool;
    }

    async withTransaction(work) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const value = await work(client);
            await client.query('COMMIT');
            return value;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async seedVersion(client, pack, contentHash) {
        await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`,
            [`streamer-game-catalog:${pack.gameId}`]);
        let row = (await client.query(`
            SELECT * FROM streamer_game_versions WHERE game_id=$1 AND config_version=$2
        `, [pack.gameId, pack.version])).rows[0];
        if (!row) {
            await client.query(`UPDATE streamer_game_versions SET lifecycle='retired',retired_at=NOW()
                WHERE game_id=$1 AND lifecycle='active'`, [pack.gameId]);
            row = (await client.query(`
                INSERT INTO streamer_game_versions(game_id,config_version,content_hash,content_snapshot,challenge_count)
                VALUES($1,$2,$3,$4::JSONB,$5) RETURNING *
            `, [pack.gameId, pack.version, contentHash, JSON.stringify(pack), pack.challenges.length])).rows[0];
        }
        if (!row || row.content_hash !== contentHash || Number(row.challenge_count) !== pack.challenges.length
            || stableJson(row.content_snapshot) !== stableJson(pack) || row.lifecycle !== 'active') {
            throw new Error('Streamer game catalog identity conflict');
        }
        return Number(row.id);
    }

    async lockAccounts(client, usernames) {
        const unique = [...new Set(usernames.filter(Boolean))];
        const result = await client.query(`
            SELECT account.id,account.username,account.is_admin,account.authorized,account.deactivated,
                   account.account_locked
            FROM users account
            WHERE account.username=ANY($1::TEXT[])
            ORDER BY account.id
            FOR NO KEY UPDATE OF account
        `, [unique]);
        const userIds = result.rows.map(row => Number(row.id));
        const profileRows = userIds.length ? (await client.query(`
            SELECT user_id,live_interaction_opt_in,timezone
            FROM creator_profiles
            WHERE user_id=ANY($1::INTEGER[])
            ORDER BY user_id
        `, [userIds])).rows : [];
        const profiles = new Map(profileRows.map(row => {
            const { user_id: userId, ...profile } = row;
            return [Number(userId), profile];
        }));
        return new Map(result.rows.map(row => [row.username, {
            ...row,
            live_interaction_opt_in: null,
            timezone: null,
            ...(profiles.get(Number(row.id)) || {})
        }]));
    }

    async findActiveLiveRoom(client, creatorUserId, ownerUserId) {
        const result = await client.query(`
            SELECT room.id FROM live_interactions room
            JOIN live_interaction_members creator_member ON creator_member.interaction_id=room.id
                AND creator_member.user_id=room.creator_user_id AND creator_member.member_status='active'
            JOIN live_interaction_members owner_member ON owner_member.interaction_id=room.id
                AND owner_member.user_id=room.owner_user_id AND owner_member.member_status='active'
            WHERE room.creator_user_id=$1 AND room.owner_user_id=$2 AND room.status='active'
            ORDER BY room.updated_at DESC LIMIT 1 FOR UPDATE OF room
        `, [creatorUserId, ownerUserId]);
        return result.rows[0] ? Number(result.rows[0].id) : null;
    }

    async findStartCommand(client, actorUserId, gameId, commandId) {
        return (await client.query(`SELECT semantic_hash,response_status,response_body,run_id
            FROM streamer_game_start_commands WHERE actor_user_id=$1 AND game_id=$2 AND command_id=$3`,
        [actorUserId, gameId, commandId])).rows[0] || null;
    }

    async findActiveCreatorRun(client, creatorUserId, gameId, { lock = true } = {}) {
        const result = await client.query(`SELECT id,revision FROM streamer_game_runs
            WHERE creator_user_id=$1 AND game_id=$2 AND status='active' ${lock ? 'FOR UPDATE' : ''}`,
        [creatorUserId, gameId]);
        return result.rows[0] || null;
    }

    async findDailyMazeRun(client, creatorUserId, dailyKey) {
        const result = await client.query(`SELECT id,status FROM streamer_game_runs
            WHERE creator_user_id=$1 AND game_id='dream-maze' AND daily_key=$2 LIMIT 1 FOR UPDATE`,
        [creatorUserId, dailyKey]);
        return result.rows[0] || null;
    }

    async findOverlappingDailyMazeRun(client, creatorUserId, windowStart, windowEnd) {
        const result = await client.query(`SELECT id,status,daily_key,daily_timezone,
                daily_window_start,daily_window_end
            FROM streamer_game_runs
            WHERE creator_user_id=$1 AND game_id='dream-maze'
              AND daily_window_start < $3::TIMESTAMPTZ
              AND daily_window_end > $2::TIMESTAMPTZ
            ORDER BY daily_window_start,id LIMIT 1 FOR UPDATE`,
        [creatorUserId, windowStart, windowEnd]);
        return result.rows[0] || null;
    }

    async findTrustedGameEvent(client, sourceType, sourceEventId) {
        return (await client.query(`SELECT semantic_hash,run_id,response_status,response_body FROM streamer_game_trusted_events
            WHERE source_type=$1 AND source_event_id=$2`, [sourceType, sourceEventId])).rows[0] || null;
    }

    async insertTrustedGameEvent(client, values) {
        await client.query(`INSERT INTO streamer_game_trusted_events(creator_user_id,source_type,source_event_id,
            event_key,semantic_hash,payload,run_id,response_status,response_body)
            VALUES($1,$2,$3,$4,$5,$6::JSONB,$7,$8,$9::JSONB)`,
        [values.creatorUserId, values.sourceType, values.sourceEventId, values.eventKey,
            values.semanticHash, JSON.stringify(values.payload), values.runId, values.status,
            JSON.stringify(values.body)]);
    }

    async readRunIdentity(client, runId) {
        return (await client.query(`SELECT run.id,run.game_id,run.mode,run.status,run.creator_user_id,
            run.owner_user_id,run.live_interaction_id,creator.username creator_username,owner.username owner_username
            FROM streamer_game_runs run JOIN users creator ON creator.id=run.creator_user_id
            LEFT JOIN users owner ON owner.id=run.owner_user_id WHERE run.id=$1`, [runId])).rows[0] || null;
    }

    async createRun(client, values) {
        const result = await client.query(`
            INSERT INTO streamer_game_runs(id,game_id,version_id,creator_user_id,owner_user_id,live_interaction_id,
                mode,difficulty,status,state,score,daily_key,daily_timezone,daily_window_start,daily_window_end)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,'active',$9::JSONB,0,$10,$11,$12,$13) RETURNING *
        `, [values.id, values.gameId, values.versionId, values.creatorUserId, values.ownerUserId,
            values.liveInteractionId, values.mode, values.difficulty, JSON.stringify(values.state),
            values.dailyKey, values.dailyTimezone, values.dailyWindowStart, values.dailyWindowEnd]);
        return runRow({ ...result.rows[0], config_version: values.configVersion,
            creator_username: values.creatorUsername, owner_username: values.ownerUsername });
    }

    async saveStartCommand(client, values) {
        await client.query(`INSERT INTO streamer_game_start_commands(actor_user_id,game_id,command_id,semantic_hash,
            run_id,response_status,response_body) VALUES($1,$2,$3,$4,$5,$6,$7::JSONB)`,
        [values.actorUserId, values.gameId, values.commandId, values.semanticHash, values.runId,
            values.status, JSON.stringify(values.body)]);
    }

    async readRun(runId, username) {
        const result = await this.pool.query(`
            SELECT run.*,version.config_version,version.content_hash,version.content_snapshot,
              creator.username creator_username,owner.username owner_username,
              EXISTS(SELECT 1 FROM streamer_game_events resume_event
                WHERE resume_event.run_id=run.id AND resume_event.event_type='game.run.resumed') resumed,
              CASE WHEN actor.id=run.creator_user_id THEN 'creator' WHEN actor.id=run.owner_user_id THEN 'owner' END actor_role
            FROM streamer_game_runs run JOIN streamer_game_versions version ON version.id=run.version_id
            JOIN users creator ON creator.id=run.creator_user_id
            LEFT JOIN users owner ON owner.id=run.owner_user_id
            JOIN users actor ON actor.username=$2 AND actor.authorized=TRUE AND actor.deactivated=FALSE
              AND COALESCE(actor.account_locked,FALSE)=FALSE
            WHERE run.id=$1 AND actor.id IN(run.creator_user_id,run.owner_user_id)
        `, [runId, username]);
        const row = result.rows[0];
        return row ? { run: runRow(row), actorRole: row.actor_role } : null;
    }

    async lockRun(client, runId, username) {
        const result = await client.query(`
            SELECT run.*,version.config_version,version.content_hash,version.content_snapshot,
              creator.username creator_username,owner.username owner_username,
              EXISTS(SELECT 1 FROM streamer_game_events resume_event
                WHERE resume_event.run_id=run.id AND resume_event.event_type='game.run.resumed') resumed,
              CASE WHEN actor.id=run.creator_user_id THEN 'creator' WHEN actor.id=run.owner_user_id THEN 'owner' END actor_role,
              actor.id actor_user_id
            FROM streamer_game_runs run JOIN streamer_game_versions version ON version.id=run.version_id
            JOIN users creator ON creator.id=run.creator_user_id
            LEFT JOIN users owner ON owner.id=run.owner_user_id
            JOIN users actor ON actor.username=$2 AND actor.authorized=TRUE AND actor.deactivated=FALSE
              AND COALESCE(actor.account_locked,FALSE)=FALSE
            WHERE run.id=$1 AND actor.id IN(run.creator_user_id,run.owner_user_id) FOR UPDATE OF run
        `, [runId, username]);
        const row = result.rows[0];
        return row ? { run: runRow(row), actorRole: row.actor_role, actorUserId: Number(row.actor_user_id) } : null;
    }

    async findCommand(client, runId, actorUserId, commandId) {
        return (await client.query(`SELECT semantic_hash,response_status,response_body,event_id
            FROM streamer_game_commands WHERE run_id=$1 AND actor_user_id=$2 AND command_id=$3`,
        [runId, actorUserId, commandId])).rows[0] || null;
    }

    async updateRun(client, run, nextState) {
        const result = await client.query(`
            UPDATE streamer_game_runs SET state=$3::JSONB,status=$4::VARCHAR(16),score=$5,
                revision=revision+1,updated_at=NOW(),
                completed_at=CASE WHEN $4::VARCHAR(16)='completed' THEN NOW() ELSE NULL END
            WHERE id=$1 AND revision=$2 RETURNING *
        `, [run.id, run.revision, JSON.stringify(nextState), nextState.status, nextState.score]);
        return result.rows[0] ? runRow({ ...result.rows[0], config_version: run.configVersion,
            content_hash: run.contentHash, content_snapshot: run.contentSnapshot,
            creator_username: run.creatorUsername, owner_username: run.ownerUsername }) : null;
    }

    async abandonRunForConsent(client, run, nextState, reason, revokedAt) {
        const result = await client.query(`UPDATE streamer_game_runs
            SET state=$3::JSONB,status='abandoned',score=$4,revision=revision+1,updated_at=NOW(),
                completed_at=NULL,consent_revoked_reason=$5,consent_revoked_at=$6
            WHERE id=$1 AND revision=$2 AND mode='coop' AND status='active' RETURNING *`,
        [run.id, run.revision, JSON.stringify(nextState), Number(nextState.score || 0), reason, revokedAt]);
        return result.rows[0] ? runRow({ ...result.rows[0], config_version: run.configVersion,
            content_hash: run.contentHash, content_snapshot: run.contentSnapshot,
            creator_username: run.creatorUsername, owner_username: run.ownerUsername }) : null;
    }

    async lockActiveCoopRunsForInteraction(client, interactionId) {
        const result = await client.query(`SELECT run.*,version.config_version,version.content_hash,
            version.content_snapshot,creator.username creator_username,owner.username owner_username
            FROM streamer_game_runs run JOIN streamer_game_versions version ON version.id=run.version_id
            JOIN users creator ON creator.id=run.creator_user_id
            JOIN users owner ON owner.id=run.owner_user_id
            WHERE run.live_interaction_id=$1 AND run.mode='coop' AND run.status='active'
            ORDER BY run.id FOR UPDATE OF run`, [interactionId]);
        return result.rows.map(runRow);
    }

    async lockActiveCoopRunsForCreator(client, creatorUserId) {
        const result = await client.query(`SELECT run.*,version.config_version,version.content_hash,
            version.content_snapshot,creator.username creator_username,owner.username owner_username
            FROM streamer_game_runs run JOIN streamer_game_versions version ON version.id=run.version_id
            JOIN users creator ON creator.id=run.creator_user_id
            JOIN users owner ON owner.id=run.owner_user_id
            WHERE run.creator_user_id=$1 AND run.mode='coop' AND run.status='active'
            ORDER BY run.id FOR UPDATE OF run`, [creatorUserId]);
        return result.rows.map(runRow);
    }

    async lockBlockedActiveCoopRunsForCreator(client, creatorUserId) {
        const result = await client.query(`SELECT run.*,version.config_version,version.content_hash,
            version.content_snapshot,creator.username creator_username,owner.username owner_username,
            EXISTS(SELECT 1 FROM creator_preferences preference WHERE preference.user_id=$1
              AND preference.preference_type='communication' AND preference.preference_key='all_messages'
              AND preference.preference_value='block') blocked_by_all_messages
            FROM streamer_game_runs run JOIN streamer_game_versions version ON version.id=run.version_id
            JOIN users creator ON creator.id=run.creator_user_id
            JOIN users owner ON owner.id=run.owner_user_id
            WHERE run.creator_user_id=$1 AND run.mode='coop' AND run.status='active'
              AND (EXISTS(SELECT 1 FROM creator_preferences preference WHERE preference.user_id=$1
                    AND preference.preference_type='communication' AND preference.preference_key='all_messages'
                    AND preference.preference_value='block')
                OR EXISTS(SELECT 1 FROM creator_preferences preference WHERE preference.user_id=$1
                    AND preference.preference_type='game' AND preference.preference_key=run.game_id
                    AND preference.preference_value='block'))
            ORDER BY run.id FOR UPDATE OF run`, [creatorUserId]);
        return result.rows.map(row => ({ ...runRow(row), blockedByAllMessages: row.blocked_by_all_messages === true }));
    }

    async appendEvent(client, values) {
        const sequence = Number((await client.query(`UPDATE streamer_game_runs SET next_sequence=next_sequence+1
            WHERE id=$1 RETURNING next_sequence-1 sequence`, [values.runId])).rows[0].sequence);
        const row = (await client.query(`
            INSERT INTO streamer_game_events(event_id,run_id,sequence,event_type,actor_user_id,state_revision,
                action_summary,state_hash) VALUES($1,$2,$3,$4,$5,$6,$7::JSONB,$8) RETURNING *
        `, [values.eventId, values.runId, sequence, values.eventType, values.actorUserId,
            values.stateRevision, JSON.stringify(values.actionSummary), values.stateHash])).rows[0];
        return { eventId: row.event_id, runId: row.run_id, sequence: Number(row.sequence),
            eventType: row.event_type, stateRevision: Number(row.state_revision), actionSummary: row.action_summary,
            createdAt: row.created_at };
    }

    async markRunResumed(client, run, actorUserId, stateHash) {
        if (run.status !== 'active' || run.resumed === true) return false;
        const existing = await client.query(`SELECT 1 FROM streamer_game_events
            WHERE run_id=$1 AND event_type='game.run.resumed' LIMIT 1`, [run.id]);
        if (existing.rowCount > 0) return false;
        await this.appendEvent(client, {
            eventId: crypto.randomUUID(),
            runId: run.id,
            eventType: 'game.run.resumed',
            actorUserId,
            stateRevision: Number(run.revision),
            actionSummary: { reason: 'creator_state_recovery' },
            stateHash
        });
        await this.insertAudit(client, {
            runId: run.id,
            actorUserId,
            action: 'streamer_game.resumed',
            details: { revision: Number(run.revision), reason: 'creator_state_recovery' }
        });
        return true;
    }

    async saveCommand(client, values) {
        await client.query(`INSERT INTO streamer_game_commands(run_id,actor_user_id,command_id,command_type,
            semantic_hash,expected_revision,event_id,response_status,response_body)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::JSONB)`, [values.runId, values.actorUserId,
            values.commandId, values.commandType, values.semanticHash, values.expectedRevision,
            values.eventId, values.status, JSON.stringify(values.body)]);
    }

    async insertHookIntent(client, values) {
        const inserted = await client.query(`INSERT INTO streamer_game_hook_intents(run_id,intent_type,intent_key,payload)
            VALUES($1,$2,$3,$4::JSONB) ON CONFLICT(run_id,intent_type,intent_key) DO NOTHING RETURNING payload`,
        [values.runId, values.intentType, values.intentKey, JSON.stringify(values.payload)]);
        if (inserted.rowCount === 1) return;
        const existing = (await client.query(`SELECT payload FROM streamer_game_hook_intents
            WHERE run_id=$1 AND intent_type=$2 AND intent_key=$3`,
        [values.runId, values.intentType, values.intentKey])).rows[0];
        if (!existing || stableJson(existing.payload) !== stableJson(values.payload)) {
            throw new Error('Streamer game hook intent identity conflict');
        }
    }

    async settleCraftingCollection(client, run, itemKey, slotIndex) {
        await client.query(`INSERT INTO streamer_game_collection_items(user_id,item_key,source_run_id)
            VALUES($1,$2,$3) ON CONFLICT(user_id,item_key) DO NOTHING`, [run.creatorUserId, itemKey, run.id]);
        const owned = await client.query(`SELECT source_run_id FROM streamer_game_collection_items
            WHERE user_id=$1 AND item_key=$2`, [run.creatorUserId, itemKey]);
        if (owned.rowCount !== 1) throw new Error('Crafted collection item was not persisted');
        await client.query(`INSERT INTO streamer_game_room_slots(user_id,slot_index,item_key,source_run_id)
            VALUES($1,$2,$3,$4) ON CONFLICT(user_id,slot_index) DO UPDATE SET item_key=EXCLUDED.item_key,
              source_run_id=EXCLUDED.source_run_id,revision=streamer_game_room_slots.revision+1,updated_at=NOW()`,
        [run.creatorUserId, slotIndex, itemKey, run.id]);
    }

    async collectionState(username) {
        const items = await this.pool.query(`SELECT item.item_key,item.acquired_at FROM streamer_game_collection_items item
            JOIN users account ON account.id=item.user_id AND account.authorized=TRUE
              AND account.deactivated=FALSE AND COALESCE(account.account_locked,FALSE)=FALSE
            WHERE account.username=$1 ORDER BY item.acquired_at,item.item_key`, [username]);
        const slots = await this.pool.query(`SELECT slot.slot_index,slot.item_key,slot.revision FROM streamer_game_room_slots slot
            JOIN users account ON account.id=slot.user_id AND account.authorized=TRUE
              AND account.deactivated=FALSE AND COALESCE(account.account_locked,FALSE)=FALSE
            WHERE account.username=$1 ORDER BY slot.slot_index`, [username]);
        return { items: items.rows.map(row => ({ itemKey: row.item_key, acquiredAt: row.acquired_at })),
            slots: slots.rows.map(row => ({ slot: Number(row.slot_index), itemKey: row.item_key, revision: Number(row.revision) })) };
    }

    async insertAudit(client, values) {
        await client.query(`INSERT INTO streamer_game_audit_log(run_id,actor_user_id,action,request_id,details)
            VALUES($1,$2,$3,$4,$5::JSONB)`, [values.runId, values.actorUserId, values.action,
            values.requestId || null, JSON.stringify(values.details || {})]);
    }

    async listHistory(username, gameId, limit = 20) {
        const result = await this.pool.query(`SELECT run.id,run.game_id,run.mode,run.difficulty,run.status,run.revision,
            run.score,run.started_at,run.updated_at FROM streamer_game_runs run
            JOIN users actor ON actor.username=$1 AND actor.authorized=TRUE AND actor.deactivated=FALSE
              AND COALESCE(actor.account_locked,FALSE)=FALSE
            WHERE actor.id IN(run.creator_user_id,run.owner_user_id) AND run.game_id=$2
            ORDER BY run.updated_at DESC LIMIT $3`, [username, gameId, limit]);
        return result.rows.map(row => ({ id: row.id, gameId: row.game_id, mode: row.mode,
            difficulty: row.difficulty, status: row.status, revision: Number(row.revision), score: Number(row.score),
            startedAt: row.started_at, updatedAt: row.updated_at }));
    }
}

module.exports = { StreamerGameRepository, runRow, stableJson };
