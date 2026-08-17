'use strict';

const crypto = require('node:crypto');

const {
    envelope,
    stableJson
} = require('../domain/live-interactions/protocol');

function roomRow(row) {
    if (!row) return null;
    return {
        id: Number(row.id),
        key: row.interaction_key,
        creatorUserId: Number(row.creator_user_id),
        creatorUsername: row.creator_username,
        ownerUserId: Number(row.owner_user_id),
        ownerUsername: row.owner_username,
        status: row.status,
        revision: Number(row.revision),
        nextSequence: Number(row.next_sequence),
        availability: row.creator_availability,
        mutedUntil: row.creator_muted_until,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        highestAckSequence: row.highest_ack_sequence === undefined ? 0 : Number(row.highest_ack_sequence),
        visibleLastSequence: row.visible_last_sequence === undefined
            ? undefined : Number(row.visible_last_sequence),
        memberRole: row.member_role,
        memberStatus: row.member_status
    };
}

function sameActiveMembership(left, right) {
    return Boolean(left && right &&
        left.memberStatus === 'active' && right.memberStatus === 'active' &&
        left.memberRole === right.memberRole &&
        left.id === right.id &&
        left.creatorUserId === right.creatorUserId &&
        left.ownerUserId === right.ownerUserId);
}

function itemRow(row) {
    if (!row) return null;
    return {
        id: Number(row.id),
        itemKey: row.item_key,
        interactionId: Number(row.interaction_id),
        itemType: row.item_type,
        templateKey: row.template_key,
        status: row.status,
        revision: Number(row.revision),
        payload: row.payload,
        targetStoryNode: row.target_story_node,
        createdAt: row.created_at,
        deliverAt: row.deliver_at,
        expiresAt: row.expires_at,
        respondedAt: row.responded_at,
        updatedAt: row.updated_at
    };
}

class LiveInteractionRepository {
    constructor({
        pool
    }) {
        if (!pool?.query || !pool?.connect) throw new TypeError(
            'LiveInteractionRepository requires a database pool');
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
            await client.query('ROLLBACK').catch(() => {});
            throw error;
        } finally {
            client.release();
        }
    }

    async lockAccounts(client, creatorUsername, ownerUsername) {
        const usernames = [...new Set([creatorUsername, ownerUsername].filter(Boolean))];
        const result = await client.query(`
            SELECT u.id, u.username, u.is_admin, u.authorized, u.deactivated,
                   COALESCE(u.account_locked,FALSE) account_locked
            FROM users u
            WHERE u.username = ANY($1::TEXT[])
              AND u.authorized = TRUE AND u.deactivated = FALSE
              AND COALESCE(u.account_locked, FALSE) = FALSE
            ORDER BY u.id
            FOR NO KEY UPDATE OF u
        `, [usernames]);
        const profiles = await this.readLockedAccountProfiles(client, result.rows.map(row => Number(row.id)));
        const byName = new Map(result.rows.map((row) => [row.username, {
            ...row,
            live_interaction_opt_in: null,
            timezone: null,
            profile_visibility: null,
            communication_style: null,
            ...(profiles.get(Number(row.id)) || {})
        }]));
        return {
            creator: byName.get(creatorUsername) || null,
            owner: byName.get(ownerUsername) || null
        };
    }

    async readLockedAccountProfiles(queryable, userIds) {
        if (!userIds.length) return new Map();
        const result = await queryable.query(`
            SELECT user_id,live_interaction_opt_in,timezone,profile_visibility,communication_style
            FROM creator_profiles
            WHERE user_id=ANY($1::INTEGER[])
            ORDER BY user_id
        `, [userIds]);
        return new Map(result.rows.map(row => {
            const { user_id: userId, ...profile } = row;
            return [Number(userId), profile];
        }));
    }

    async readAccount(username, queryable = this.pool, { lock = false } = {}) {
        if (lock) {
            const locked = await queryable.query(`
                SELECT u.id,u.username,u.is_admin,u.authorized,u.deactivated,
                       COALESCE(u.account_locked,FALSE) account_locked
                FROM users u
                WHERE u.username=$1 AND u.authorized=TRUE AND u.deactivated=FALSE
                  AND COALESCE(u.account_locked,FALSE)=FALSE
                ORDER BY u.id
                FOR NO KEY UPDATE OF u
            `, [username]);
            const account = locked.rows[0];
            if (!account) return null;
            const profiles = await this.readLockedAccountProfiles(queryable, [Number(account.id)]);
            return {
                ...account,
                live_interaction_opt_in: null,
                timezone: null,
                profile_visibility: null,
                communication_style: null,
                ...(profiles.get(Number(account.id)) || {})
            };
        }
        const result = await queryable.query(`
            SELECT u.id, u.username, u.is_admin, u.authorized, u.deactivated,
                   COALESCE(u.account_locked,FALSE) account_locked, p.live_interaction_opt_in,
                   p.timezone, p.profile_visibility, p.communication_style
            FROM users u LEFT JOIN creator_profiles p ON p.user_id = u.id
            WHERE u.username=$1 AND u.authorized=TRUE AND u.deactivated=FALSE
              AND COALESCE(u.account_locked, FALSE)=FALSE
        `, [username]);
        return result.rows[0] || null;
    }

    async readAccountsByIds(userIds) {
        const ids = [...new Set((userIds || []).map(Number).filter(Number.isSafeInteger))];
        if (!ids.length) return new Map();
        const result = await this.pool.query(`
            SELECT u.id,u.username,u.is_admin,u.authorized,u.deactivated,
                   COALESCE(u.account_locked,FALSE) account_locked,p.live_interaction_opt_in,
                   p.timezone,p.profile_visibility,p.communication_style
            FROM users u LEFT JOIN creator_profiles p ON p.user_id=u.id
            WHERE u.id=ANY($1::INTEGER[])
        `, [ids]);
        return new Map(result.rows.map(row => [Number(row.id), row]));
    }

    async creatorBoundaries(queryable, userId, interactionId = null) {
        const [preferences, quietHours, windows, report] = await Promise.all([
            queryable.query(`SELECT preference_type,preference_key,preference_value
                FROM creator_preferences WHERE user_id=$1`, [userId]),
            queryable.query(`SELECT weekday,start_minute,end_minute,enabled FROM creator_quiet_hours
                WHERE user_id=$1 ORDER BY weekday`, [userId]),
            queryable.query(`SELECT weekday,start_minute,end_minute,interaction_mode,enabled
                FROM creator_interaction_windows WHERE user_id=$1 ORDER BY weekday`, [userId]),
            interactionId ? queryable.query(`SELECT status,creator_reconsented_at
                FROM live_interaction_reports WHERE interaction_id=$1
                ORDER BY created_at DESC,id DESC LIMIT 1`, [interactionId])
                : Promise.resolve({ rows: [] })
        ]);
        const preferenceMap = {};
        for (const row of preferences.rows) {
            preferenceMap[`${row.preference_type}:${row.preference_key}`] = row.preference_value;
            if (row.preference_type === 'communication') {
                preferenceMap[row.preference_key] = row.preference_value;
            }
        }
        return {
            preferences: preferenceMap,
            quietHours: quietHours.rows.map((row) => ({
                weekday: Number(row.weekday),
                startMinute: Number(row.start_minute),
                endMinute: Number(row.end_minute),
                enabled: row.enabled
            })),
            interactionWindows: windows.rows.map((row) => ({
                weekday: Number(row.weekday),
                startMinute: Number(row.start_minute),
                endMinute: Number(row.end_minute),
                mode: row.interaction_mode,
                enabled: row.enabled
            })),
            report: report.rows[0] ? {
                status: report.rows[0].status,
                creatorReconsentedAt: report.rows[0].creator_reconsented_at
            } : null
        };
    }

    async findActivePair(client, creatorUserId, ownerUserId, {
        lock = false
    } = {}) {
        const result = await client.query(`
            SELECT room.*, creator.username AS creator_username, owner.username AS owner_username
            FROM live_interactions room
            JOIN users creator ON creator.id=room.creator_user_id
            JOIN users owner ON owner.id=room.owner_user_id
            WHERE room.creator_user_id=$1 AND room.owner_user_id=$2 AND room.status='active'
            ORDER BY room.id DESC LIMIT 1 ${lock ? 'FOR UPDATE OF room' : ''}
        `, [creatorUserId, ownerUserId]);
        return roomRow(result.rows[0]);
    }

    async createRoom(client, {
        interactionKey,
        creatorUserId,
        ownerUserId
    }) {
        const result = await client.query(`
            INSERT INTO live_interactions(interaction_key,creator_user_id,owner_user_id,revision,next_sequence)
            VALUES($1,$2,$3,0,1) RETURNING *
        `, [interactionKey, creatorUserId, ownerUserId]);
        await client.query(`INSERT INTO live_interaction_members(interaction_id,user_id,member_role)
            VALUES($1,$2,'creator'),($1,$3,'owner')`, [result.rows[0].id, creatorUserId, ownerUserId]);
        return roomRow(result.rows[0]);
    }

    async latestPairReport(client, creatorUserId, ownerUserId, {
        lock = false
    } = {}) {
        const result = await client.query(`SELECT report.* FROM live_interaction_reports report
            JOIN live_interactions room ON room.id=report.interaction_id
            WHERE room.creator_user_id=$1 AND room.owner_user_id=$2
            ORDER BY report.created_at DESC,report.id DESC LIMIT 1 ${lock?'FOR UPDATE OF report':''}`,
            [creatorUserId, ownerUserId]);
        return result.rows[0] || null;
    }

    async lockModerationContext(client, {
        interactionId,
        reportId,
        moderatorUsername
    }) {
        const identity = (await client.query(`SELECT creator.username creator_username,
            owner.username owner_username FROM live_interaction_reports report
            JOIN live_interactions room ON room.id=report.interaction_id
            JOIN users creator ON creator.id=room.creator_user_id
            JOIN users owner ON owner.id=room.owner_user_id
            WHERE report.id=$1 AND room.id=$2`, [reportId, interactionId])).rows[0];
        if (!identity) return null;
        const accounts = await client.query(`SELECT id,username,is_admin,authorized,deactivated,
            COALESCE(account_locked,FALSE) account_locked FROM users
            WHERE username=ANY($1::TEXT[])
            ORDER BY id FOR NO KEY UPDATE`, [[
            identity.creator_username, identity.owner_username, moderatorUsername
        ]]);
        const byName = new Map(accounts.rows.map(row => [row.username, row]));
        const locked = await client.query(`SELECT room.*,creator.username creator_username,
            owner.username owner_username,report.id report_id,report.interaction_id,
            report.reporter_user_id,report.reason_code,report.detail,report.status report_status,
            report.created_at,report.reviewed_at,report.reviewer_user_id,
            report.creator_reconsented_at
            FROM live_interaction_reports report
            JOIN live_interactions room ON room.id=report.interaction_id
            JOIN users creator ON creator.id=room.creator_user_id
            JOIN users owner ON owner.id=room.owner_user_id
            WHERE report.id=$1 AND room.id=$2 FOR UPDATE OF room,report`, [reportId, interactionId]);
        const row = locked.rows[0];
        return row ? {
            room: roomRow(row),
            report: {
                id: Number(row.report_id),
                interaction_id: Number(row.interaction_id),
                reporter_user_id: Number(row.reporter_user_id),
                reason_code: row.reason_code,
                detail: row.detail,
                status: row.report_status,
                creator_reconsented_at: row.creator_reconsented_at
            },
            creator: byName.get(identity.creator_username) || null,
            owner: byName.get(identity.owner_username) || null,
            moderator: byName.get(moderatorUsername) || null
        } : null;
    }

    async resolveReport(client, reportId, reviewerUserId, status) {
        const result = await client.query(`UPDATE live_interaction_reports SET status=$3,reviewer_user_id=$2,
            reviewed_at=NOW() WHERE id=$1 AND status IN('open','reviewing') RETURNING *`,
            [reportId, reviewerUserId, status]);
        if (!result.rows[0]) return null;
        const room = await client.query(`UPDATE live_interactions SET status='closed',closed_at=NOW(),
            revision=revision+1 WHERE id=$1 AND status='reported' RETURNING *`, [result.rows[0].interaction_id]);
        return {
            report: result.rows[0],
            room: roomRow(room.rows[0])
        };
    }

    async reconsentReport(client, reportId, creatorUserId) {
        const result = await client.query(`UPDATE live_interaction_reports report SET creator_reconsented_at=NOW()
            FROM live_interactions room WHERE report.id=$1 AND report.interaction_id=room.id
              AND room.creator_user_id=$2 AND report.status IN('resolved','dismissed')
              AND report.creator_reconsented_at IS NULL RETURNING report.*`, [reportId, creatorUserId]);
        return result.rows[0] || null;
    }

    async bumpRoomRevision(client, room) {
        const result = await client.query(
            `UPDATE live_interactions SET revision=revision+1 WHERE id=$1 AND revision=$2 RETURNING *`, [room
                .id, room.revision
            ]);
        return result.rows[0] ? {
            ...room,
            ...roomRow(result.rows[0]),
            creatorUsername: room.creatorUsername,
            ownerUsername: room.ownerUsername,
            memberRole: room.memberRole,
            memberStatus: room.memberStatus,
            highestAckSequence: room.highestAckSequence
        } : null;
    }

    async lockMemberRoom(client, interactionId, username) {
        const result = await client.query(`
            SELECT room.*, creator.username AS creator_username, owner.username AS owner_username,
                   member.member_role,member.member_status,member.highest_ack_sequence
            FROM live_interactions room
            JOIN live_interaction_members member ON member.interaction_id=room.id
            JOIN users actor ON actor.id=member.user_id AND actor.username=$2
                AND actor.authorized=TRUE AND actor.deactivated=FALSE
                AND COALESCE(actor.account_locked,FALSE)=FALSE
            JOIN users creator ON creator.id=room.creator_user_id
            JOIN users owner ON owner.id=room.owner_user_id
            WHERE room.id=$1 FOR UPDATE OF room,member
        `, [interactionId, username]);
        return roomRow(result.rows[0]);
    }

    async readRoomIdentity(client, interactionId, username) {
        const result = await client.query(`SELECT creator.username creator_username,owner.username owner_username,
            member.member_role FROM live_interactions room JOIN users creator ON creator.id=room.creator_user_id
            JOIN users owner ON owner.id=room.owner_user_id JOIN users actor ON actor.username=$2
            JOIN live_interaction_members member ON member.interaction_id=room.id AND member.user_id=actor.id
            WHERE room.id=$1`, [interactionId, username]);
        return result.rows[0] || null;
    }

    async readMemberRoom(interactionId, username) {
        const result = await this.pool.query(`
            SELECT room.*, creator.username AS creator_username, owner.username AS owner_username,
                   member.member_role,member.member_status,member.highest_ack_sequence
            FROM live_interactions room
            JOIN live_interaction_members member ON member.interaction_id=room.id
            JOIN users actor ON actor.id=member.user_id AND actor.username=$2
                AND actor.authorized=TRUE AND actor.deactivated=FALSE
                AND COALESCE(actor.account_locked,FALSE)=FALSE
            JOIN users creator ON creator.id=room.creator_user_id
            JOIN users owner ON owner.id=room.owner_user_id
            JOIN creator_profiles profile ON profile.user_id=room.creator_user_id
                AND profile.live_interaction_opt_in=TRUE
            WHERE room.id=$1 AND room.status='active' AND member.member_status='active'
              AND NOT (member.member_role='owner'
                AND COALESCE(room.creator_muted_until>NOW(),FALSE))
              AND NOT EXISTS (
                  SELECT 1 FROM creator_preferences preference
                  WHERE preference.user_id=room.creator_user_id
                    AND preference.preference_type='communication'
                    AND preference.preference_key='all_messages'
                    AND preference.preference_value='block'
              )
              AND NOT EXISTS (
                  SELECT 1 FROM live_interaction_reports report
                  WHERE report.interaction_id=room.id
                    AND (report.status IN('open','reviewing')
                      OR (report.status IN('resolved','dismissed')
                        AND report.creator_reconsented_at IS NULL))
              )
        `, [interactionId, username]);
        return roomRow(result.rows[0]);
    }

    async findCommand(client, roomId, actorUserId, commandId) {
        const result = await client.query(`SELECT command_type,semantic_hash,expected_revision,response_status,response_body,event_id
            FROM live_interaction_commands WHERE interaction_id=$1 AND actor_user_id=$2 AND command_id=$3`,
            [roomId, actorUserId, commandId]);
        return result.rows[0] || null;
    }

    async appendEvent(client, event) {
        if (!['owner', 'creator', 'both', 'system'].includes(event.audience)) {
            throw new TypeError('Live event requires an explicit durable audience');
        }
        const counter = await client.query(`UPDATE live_interactions SET next_sequence=next_sequence+1
            WHERE id=$1 RETURNING next_sequence-1 AS sequence`, [event.interactionId]);
        const sequence = Number(counter.rows[0].sequence);
        const result = await client.query(`
            INSERT INTO live_interaction_events(event_id,interaction_id,sequence,protocol_version,event_type,
                audience,actor_type,actor_user_id,subject_user_id,correlation_id,state_revision,payload)
            VALUES($1,$2,$3,1,$4,$5,$6,$7,$8,$9,$10,$11::JSONB) RETURNING *
        `, [event.eventId, event.interactionId, sequence, event.eventType, event.audience,
            event.actorType, event.actorUserId, event.subjectUserId, event.correlationId, event.stateRevision,
            JSON.stringify(event.payload)
        ]);
        return envelope(result.rows[0]);
    }

    async saveCommand(client, command) {
        await client.query(`INSERT INTO live_interaction_commands(interaction_id,actor_user_id,command_id,
            command_type,semantic_hash,expected_revision,event_id,response_status,response_body)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::JSONB)`, [command.interactionId,
            command.actorUserId, command.commandId, command.commandType, command.semanticHash,
            command.expectedRevision, command.eventId, command.status, JSON.stringify(command.body)
        ]);
    }

    async advanceRoom(client, room, next) {
        const result = await client.query(`UPDATE live_interactions SET status=$3::VARCHAR(20),revision=$4,
            creator_availability=$5,creator_muted_until=$6,
            closed_at=CASE WHEN $3::VARCHAR(20) IN ('left','closed')
                THEN COALESCE(closed_at,NOW()) ELSE closed_at END
            WHERE id=$1 AND revision=$2 RETURNING *`, [room.id, room.revision, next.status,
            next.revision, next.availability, next.mutedUntil
        ]);
        return {
            ...room,
            ...roomRow(result.rows[0]),
            creatorUsername: room.creatorUsername,
            ownerUsername: room.ownerUsername,
            memberRole: room.memberRole,
            memberStatus: room.memberStatus,
            highestAckSequence: room.highestAckSequence
        };
    }

    async createItem(client, item) {
        const result = await client.query(`INSERT INTO live_interaction_items(item_key,interaction_id,item_type,
            template_key,status,payload,semantic_hash,target_story_node,created_by_user_id,deliver_at,expires_at)
            VALUES($1,$2,$3,$4,$5,$6::JSONB,$7,$8,$9,$10,$11) RETURNING *`, [item.itemKey,
            item.interactionId, item.itemType, item.templateKey, item.status, JSON.stringify(item.payload),
            item.semanticHash, item.targetStoryNode, item.createdByUserId, item.deliverAt, item.expiresAt
        ]);
        return itemRow(result.rows[0]);
    }

    async lockItem(client, roomId, itemId) {
        const result = await client.query(`SELECT * FROM live_interaction_items
            WHERE id=$1 AND interaction_id=$2 FOR UPDATE`, [itemId, roomId]);
        return itemRow(result.rows[0]);
    }

    async transitionItem(client, item, transition) {
        const result = await client.query(`UPDATE live_interaction_items SET status=$3,revision=$4,
            responded_at=NOW() WHERE id=$1 AND revision=$2 RETURNING *`,
            [item.id, item.revision, transition.status, transition.nextItemRevision]);
        return itemRow(result.rows[0]);
    }

    async appendInbox(client, item, creatorUserId, ownerUsername) {
        const kinds = {
            nudge: 'owner_note',
            clue: 'owner_note',
            celebration: 'achievement_celebration',
            story_letter: 'story_letter',
            quest_invite: 'quest_invitation',
            poll: 'event_reminder',
            game_invite: 'game_invitation',
            story_intervention: 'owner_note'
        };
        const key = `live:${item.itemKey}`;
        const payload = item.payload;
        const inserted = await client.query(`INSERT INTO creator_inbox_messages(user_id,sender_type,sender_username,
            message_type,dedupe_key,title_zh,title_en,body_zh,body_en,action_path,metadata,expires_at)
            VALUES($1,'owner',$2,$3,$4,$5,$6,$7,$8,'/live-room',$9::JSONB,$10)
            ON CONFLICT(user_id,dedupe_key) DO NOTHING RETURNING id`, [creatorUserId, ownerUsername,
            kinds[item.itemType], key, payload.titleZh, payload.titleEn, payload.bodyZh, payload.bodyEn,
            JSON.stringify({
                interactionId: item.interactionId,
                itemId: item.id,
                itemType: item.itemType
            }), item.expiresAt
        ]);
        if (inserted.rowCount === 1) return Number(inserted.rows[0].id);
        const existing = (await client.query(`SELECT sender_username,message_type,title_zh,title_en,body_zh,body_en,
            action_path,metadata FROM creator_inbox_messages WHERE user_id=$1 AND dedupe_key=$2`, [creatorUserId,
            key])).rows[0];
        const expected = {
            sender_username: ownerUsername,
            message_type: kinds[item.itemType],
            title_zh: payload.titleZh,
            title_en: payload.titleEn,
            body_zh: payload.bodyZh,
            body_en: payload.bodyEn,
            action_path: '/live-room',
            metadata: {
                interactionId: item.interactionId,
                itemId: item.id,
                itemType: item.itemType
            }
        };
        if (!existing || stableJson(existing) !== stableJson(expected)) {
            const error = new Error('Live inbox identity collision');
            error.code = 'LIVE_INBOX_IDENTITY_CONFLICT';
            throw error;
        }
        return null;
    }

    async updateAck(client, room, actorUserId, sequence) {
        const maximumResult = await client.query(`SELECT COALESCE(MAX(sequence),0) AS maximum
            FROM live_interaction_events WHERE interaction_id=$1
              AND (audience='both' OR audience=$2)
              AND NOT (event_type='interaction.game_state_changed' AND EXISTS(
                SELECT 1 FROM creator_preferences game_preference
                WHERE game_preference.user_id=$3
                  AND game_preference.preference_type='game'
                  AND game_preference.preference_key=live_interaction_events.payload->>'gameId'
                  AND game_preference.preference_value='block'))`,
        [room.id, room.memberRole, room.creatorUserId]);
        const maximum = Number(maximumResult.rows[0]?.maximum || 0);
        if (sequence > maximum) return {
            invalid: true,
            highest: room.highestAckSequence,
            maximum
        };
        const result = await client.query(`UPDATE live_interaction_members
            SET highest_ack_sequence=GREATEST(highest_ack_sequence,$3),last_seen_at=NOW()
            WHERE interaction_id=$1 AND user_id=$2 RETURNING highest_ack_sequence`,
            [room.id, actorUserId, sequence]);
        return {
            invalid: false,
            highest: Number(result.rows[0].highest_ack_sequence),
            maximum
        };
    }

    async markMemberLeft(client, roomId, actorUserId) {
        await client.query(`UPDATE live_interaction_members SET member_status='left',left_at=NOW(),last_seen_at=NOW()
            WHERE interaction_id=$1 AND user_id=$2 AND member_status='active'`, [roomId, actorUserId]);
    }

    async markRoomMembersInactive(client, roomId) {
        await client.query(`UPDATE live_interaction_members
            SET member_status='left',left_at=COALESCE(left_at,NOW()),last_seen_at=NOW()
            WHERE interaction_id=$1 AND member_status='active'`, [roomId]);
    }

    async lockCoopConsent(client, { interactionId, creatorUserId, ownerUserId, gameId }) {
        const result = await client.query(`SELECT room.id,room.creator_user_id,room.owner_user_id,
            room.status,room.creator_muted_until,creator_member.member_status creator_member_status,
            owner_member.member_status owner_member_status,profile.live_interaction_opt_in,
            game_preference.preference_value game_preference,
            communication_preference.preference_value all_messages_preference,
            report.status report_status,report.creator_reconsented_at
            FROM live_interactions room
            JOIN live_interaction_members creator_member ON creator_member.interaction_id=room.id
              AND creator_member.user_id=room.creator_user_id AND creator_member.member_role='creator'
            JOIN live_interaction_members owner_member ON owner_member.interaction_id=room.id
              AND owner_member.user_id=room.owner_user_id AND owner_member.member_role='owner'
            LEFT JOIN creator_profiles profile ON profile.user_id=room.creator_user_id
            LEFT JOIN creator_preferences game_preference ON game_preference.user_id=room.creator_user_id
              AND game_preference.preference_type='game' AND game_preference.preference_key=$4
            LEFT JOIN creator_preferences communication_preference
              ON communication_preference.user_id=room.creator_user_id
              AND communication_preference.preference_type='communication'
              AND communication_preference.preference_key='all_messages'
            LEFT JOIN LATERAL(SELECT status,creator_reconsented_at
              FROM live_interaction_reports latest WHERE latest.interaction_id=room.id
              ORDER BY latest.created_at DESC,latest.id DESC LIMIT 1) report ON TRUE
            WHERE room.id=$1 AND room.creator_user_id=$2 AND room.owner_user_id=$3
            FOR UPDATE OF room,creator_member,owner_member`,
        [interactionId, creatorUserId, ownerUserId, gameId]);
        const row = result.rows[0];
        return row ? {
            id: Number(row.id),
            creatorUserId: Number(row.creator_user_id),
            ownerUserId: Number(row.owner_user_id),
            status: row.status,
            mutedUntil: row.creator_muted_until,
            creatorMemberStatus: row.creator_member_status,
            ownerMemberStatus: row.owner_member_status,
            liveInteractionOptIn: row.live_interaction_opt_in === true,
            gamePreference: row.game_preference || 'neutral',
            allMessagesPreference: row.all_messages_preference || 'neutral',
            reportStatus: row.report_status || null,
            creatorReconsentedAt: row.creator_reconsented_at || null
        } : null;
    }

    async revokeCreatorRooms(client, creatorUserId, reason, context = {}) {
        const rooms = (await client.query(`SELECT room.*,creator.username creator_username,
            owner.username owner_username FROM live_interactions room
            JOIN users creator ON creator.id=room.creator_user_id
            JOIN users owner ON owner.id=room.owner_user_id
            WHERE room.creator_user_id=$1 AND room.status='active'
            ORDER BY room.id FOR UPDATE OF room`, [creatorUserId])).rows.map(roomRow);
        for (const room of rooms) {
            const closed = await client.query(`UPDATE live_interactions SET status='closed',closed_at=NOW(),
                creator_availability='offline',revision=revision+1
                WHERE id=$1 AND revision=$2 AND status='active' RETURNING *`, [room.id, room.revision]);
            if (closed.rowCount !== 1) throw new Error('Live room consent revocation changed concurrently');
            await this.markRoomMembersInactive(client, room.id);
            const saved = { ...room, ...roomRow(closed.rows[0]), creatorUsername: room.creatorUsername,
                ownerUsername: room.ownerUsername };
            const event = await this.appendEvent(client, {
                eventId: crypto.randomUUID(),
                interactionId: room.id,
                eventType: 'interaction.closed',
                audience: 'system',
                actorType: 'system',
                actorUserId: context.actorUserId || null,
                subjectUserId: room.creatorUserId,
                correlationId: crypto.randomUUID(),
                stateRevision: saved.revision,
                payload: { reason }
            });
            await this.insertAudit(client, {
                interactionId: room.id,
                actorUserId: context.actorUserId || null,
                actorType: 'system',
                action: 'live.interaction.consent_revoked',
                requestId: context.requestId || null,
                details: { reason, actorUsername: context.actorUsername || null,
                    immutableEventId: event.eventId }
            });
        }
        return rooms.length;
    }

    async insertReport(client, report) {
        await client.query(`INSERT INTO live_interaction_reports(report_key,interaction_id,item_id,reporter_user_id,
            reason_code,detail) VALUES($1,$2,$3,$4,$5,$6)`, [report.reportKey, report.interactionId,
            report.itemId, report.reporterUserId, report.reasonCode, report.detail
        ]);
    }

    async validateQuestReference(client, userId, slug) {
        const result = await client.query(`SELECT definition.slug,version.id AS version_id,version.category
            FROM quest_v2_definitions definition JOIN quest_v2_versions version ON version.definition_id=definition.id
            JOIN quest_v2_board_slots slot ON slot.version_id=version.id
            JOIN quest_v2_boards board ON board.id=slot.board_id AND board.lifecycle='active'
            JOIN quest_v2_schedules schedule ON schedule.board_id=board.id
                AND schedule.lifecycle='active' AND schedule.starts_at<=NOW() AND schedule.ends_at>NOW()
            WHERE definition.slug=$2 AND version.lifecycle='active'
              AND NOT EXISTS(SELECT 1 FROM creator_preferences preference WHERE preference.user_id=$1
                AND preference.preference_type='quest_category' AND preference.preference_key=version.category
                AND preference.preference_value='block')
            ORDER BY version.version DESC LIMIT 1`, [userId, slug]);
        return result.rows[0] || null;
    }

    async validateStoryTarget(client, userId, nodeId) {
        const result = await client.query(`SELECT run.id,run.current_node_id,run.revision,
                   campaign.slug AS season_slug,version.version AS content_version
            FROM story_runs run JOIN story_content_versions version ON version.id=run.content_version_id
            JOIN story_campaigns campaign ON campaign.id=version.campaign_id
            WHERE run.user_id=$1 AND run.status='active' AND run.current_node_id=$2
              AND EXISTS(SELECT 1 FROM jsonb_array_elements(version.content_snapshot->'nodes') node
                WHERE node->>'id'=$2 AND node->>'type'='owner_intervention')
            ORDER BY run.updated_at DESC LIMIT 1`, [userId, nodeId]);
        const row = result.rows[0];
        return row && row.current_node_id === nodeId ? {
            runId: Number(row.id),
            nodeId: row.current_node_id,
            revision: Number(row.revision),
            seasonSlug: row.season_slug,
            contentVersion: Number(row.content_version)
        } : null;
    }

    async insertAudit(client, audit) {
        await client.query(`INSERT INTO live_interaction_audit_log(interaction_id,actor_user_id,actor_type,
            action,request_id,details) VALUES($1,$2,$3,$4,$5,$6::JSONB)`, [audit.interactionId,
            audit.actorUserId, audit.actorType, audit.action, audit.requestId || null, JSON.stringify(audit
                .details || {})
        ]);
    }

    async appendSensitiveReadAudit(client, value) {
        await client.query(`INSERT INTO creator_sensitive_read_audit(
            actor_user_id,actor_username,target_user_id,interaction_id,report_id,
            access_kind,decision,fields,request_id,metadata
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8::TEXT[],$9,$10::JSONB)`, [
            value.actorUserId, value.actorUsername, value.targetUserId || null,
            value.interactionId || null, value.reportId || null, value.accessKind,
            value.decision, value.fields || [], value.requestId || null,
            JSON.stringify(value.metadata || {})
        ]);
    }

    async catchUp(interactionId, username, afterSequence, limit) {
        const room = await this.readMemberRoom(interactionId, username);
        if (!room) return null;
        const [result, highWater] = await Promise.all([
            this.pool.query(`SELECT * FROM live_interaction_events
                WHERE interaction_id=$1 AND sequence>$2
                  AND (audience='both' OR audience=$4)
                  AND NOT (event_type='interaction.game_state_changed' AND EXISTS(
                    SELECT 1 FROM creator_preferences game_preference
                    WHERE game_preference.user_id=$5
                      AND game_preference.preference_type='game'
                      AND game_preference.preference_key=live_interaction_events.payload->>'gameId'
                      AND game_preference.preference_value='block'))
                ORDER BY sequence LIMIT $3`,
            [interactionId, afterSequence, limit + 1, room.memberRole, room.creatorUserId]),
            this.pool.query(`SELECT COALESCE(MAX(sequence),0) AS maximum
                FROM live_interaction_events WHERE interaction_id=$1
                  AND (audience='both' OR audience=$2)
                  AND NOT (event_type='interaction.game_state_changed' AND EXISTS(
                    SELECT 1 FROM creator_preferences game_preference
                    WHERE game_preference.user_id=$3
                      AND game_preference.preference_type='game'
                      AND game_preference.preference_key=live_interaction_events.payload->>'gameId'
                      AND game_preference.preference_value='block'))`,
            [interactionId, room.memberRole, room.creatorUserId])
        ]);
        const confirmedRoom = await this.readMemberRoom(interactionId, username);
        if (!sameActiveMembership(room, confirmedRoom)) return null;
        const rows = result.rows.slice(0, limit).map(envelope);
        return {
            room: confirmedRoom,
            events: rows,
            hasMore: result.rows.length > limit,
            nextAfter: rows.length ? rows.at(-1).sequence : afterSequence,
            lastSequence: Number(highWater.rows[0]?.maximum || 0)
        };
    }

    async listItems(queryable, interactionId, {
        limit = 50
    } = {}) {
        const result = await queryable.query(`SELECT item.*,
            CASE WHEN item.status='delivered' AND item.expires_at<=NOW() THEN 'expired' ELSE item.status END AS status
            FROM live_interaction_items item WHERE interaction_id=$1
            ORDER BY created_at DESC,id DESC LIMIT $2`, [interactionId, limit]);
        return result.rows.map(itemRow);
    }

    async roomState(interactionId, username) {
        const room = await this.readMemberRoom(interactionId, username);
        if (!room) return null;
        const report = room.memberRole === 'creator' ? (await this.pool.query(`SELECT id,status,creator_reconsented_at FROM live_interaction_reports
            WHERE interaction_id=$1 AND reporter_user_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1`, [interactionId,
            room.creatorUserId
        ])).rows[0] : null;
        const [recent, highWater] = await Promise.all([
            this.pool.query(`SELECT * FROM live_interaction_events WHERE interaction_id=$1
                AND (audience='both' OR audience=$2)
                AND NOT (event_type='interaction.game_state_changed' AND EXISTS(
                  SELECT 1 FROM creator_preferences game_preference
                  WHERE game_preference.user_id=$3
                    AND game_preference.preference_type='game'
                    AND game_preference.preference_key=live_interaction_events.payload->>'gameId'
                    AND game_preference.preference_value='block'))
                ORDER BY sequence DESC LIMIT 30`, [interactionId, room.memberRole,
                room.creatorUserId]),
            this.pool.query(`SELECT COALESCE(MAX(sequence),0) maximum
                FROM live_interaction_events WHERE interaction_id=$1
                  AND (audience='both' OR audience=$2)
                  AND NOT (event_type='interaction.game_state_changed' AND EXISTS(
                    SELECT 1 FROM creator_preferences game_preference
                    WHERE game_preference.user_id=$3
                      AND game_preference.preference_type='game'
                      AND game_preference.preference_key=live_interaction_events.payload->>'gameId'
                      AND game_preference.preference_value='block'))`, [interactionId,
                room.memberRole, room.creatorUserId])
        ]);
        const items = await this.listItems(this.pool, interactionId);
        const confirmedRoom = await this.readMemberRoom(interactionId, username);
        if (!sameActiveMembership(room, confirmedRoom)) return null;
        confirmedRoom.visibleLastSequence = Number(highWater.rows[0]?.maximum || 0);
        return {
            room: confirmedRoom,
            items,
            report: report ? {
                id: Number(report.id),
                status: report.status,
                reconsented: report.creator_reconsented_at !== null
            } : null,
            recent: recent.rows.reverse().map(envelope)
        };
    }

    async listCreatorRooms(username) {
        const result = await this.pool.query(`SELECT room.*,creator.username AS creator_username,owner.username AS owner_username,
            member.member_role,member.member_status,member.highest_ack_sequence,
            (SELECT COALESCE(MAX(event.sequence),0) FROM live_interaction_events event
              WHERE event.interaction_id=room.id
                AND (event.audience='both' OR event.audience=member.member_role)
                AND NOT (event.event_type='interaction.game_state_changed' AND EXISTS(
                  SELECT 1 FROM creator_preferences game_preference
                  WHERE game_preference.user_id=room.creator_user_id
                    AND game_preference.preference_type='game'
                    AND game_preference.preference_key=event.payload->>'gameId'
                    AND game_preference.preference_value='block'))) visible_last_sequence
            FROM live_interactions room JOIN users creator ON creator.id=room.creator_user_id
            JOIN users owner ON owner.id=room.owner_user_id
            JOIN users actor ON actor.username=$1 AND actor.authorized=TRUE AND actor.deactivated=FALSE
                AND COALESCE(actor.account_locked,FALSE)=FALSE
            JOIN live_interaction_members member ON member.interaction_id=room.id AND member.user_id=actor.id
                AND member.member_status='active'
            JOIN creator_profiles profile ON profile.user_id=room.creator_user_id
                AND profile.live_interaction_opt_in=TRUE
            WHERE room.status='active'
              AND NOT (member.member_role='owner'
                AND COALESCE(room.creator_muted_until>NOW(),FALSE))
              AND NOT EXISTS(SELECT 1 FROM creator_preferences preference
                WHERE preference.user_id=room.creator_user_id
                  AND preference.preference_type='communication'
                  AND preference.preference_key='all_messages'
                  AND preference.preference_value='block')
              AND NOT EXISTS(SELECT 1 FROM live_interaction_reports report
                WHERE report.interaction_id=room.id
                  AND (report.status IN('open','reviewing') OR
                    (report.status IN('resolved','dismissed') AND report.creator_reconsented_at IS NULL)))
            ORDER BY (room.status='active') DESC,room.updated_at DESC LIMIT 20`, [username]);
        return result.rows.map(roomRow);
    }

    async latestReportRecovery(username) {
        const result = await this.pool.query(`SELECT room.*,creator.username creator_username,
            owner.username owner_username,member.member_role,member.member_status,
            member.highest_ack_sequence,report.id report_id,report.status report_status,
            report.creator_reconsented_at
            FROM users actor
            JOIN live_interaction_members member ON member.user_id=actor.id AND member.member_role='creator'
            JOIN live_interactions room ON room.id=member.interaction_id AND room.creator_user_id=actor.id
            JOIN users creator ON creator.id=room.creator_user_id
            JOIN users owner ON owner.id=room.owner_user_id
            JOIN live_interaction_reports report ON report.interaction_id=room.id
                AND report.reporter_user_id=actor.id
            WHERE actor.username=$1 AND actor.authorized=TRUE AND actor.deactivated=FALSE
              AND COALESCE(actor.account_locked,FALSE)=FALSE
              AND report.creator_reconsented_at IS NULL
            ORDER BY report.created_at DESC,report.id DESC LIMIT 1`, [username]);
        const row = result.rows[0];
        return row ? {
            room: roomRow(row),
            report: { id: Number(row.report_id), status: row.report_status, reconsented: false }
        } : null;
    }

    async readEventForDelivery(value) {
        const eventId = typeof value === 'string' ? value : value?.eventId;
        if (!eventId) return null;
        const result = await this.pool.query(`SELECT * FROM live_interaction_events WHERE event_id=$1`, [eventId]);
        return result.rows[0] ? envelope(result.rows[0]) : null;
    }

    async realtimeRecipientContext(event, subscription, auth, realtimeAudience = 'both') {
        if (!event || !['creator', 'owner', 'both'].includes(event.audience)
            || !['creator', 'owner', 'both'].includes(realtimeAudience)) return null;
        const result = await this.pool.query(`SELECT member.member_role,
            room.id interaction_id,room.creator_user_id,room.owner_user_id,room.status room_status,
            room.creator_muted_until,creator.id creator_id,creator.username creator_username,
            creator.authorized creator_authorized,creator.deactivated creator_deactivated,
            COALESCE(creator.account_locked,FALSE) creator_account_locked,
            profile.live_interaction_opt_in,profile.timezone,
            COALESCE((SELECT jsonb_agg(jsonb_build_object(
                'type',preference.preference_type,'key',preference.preference_key,
                'value',preference.preference_value) ORDER BY preference.preference_type,
                preference.preference_key) FROM creator_preferences preference
                WHERE preference.user_id=room.creator_user_id),'[]'::JSONB) preferences,
            COALESCE((SELECT jsonb_agg(jsonb_build_object(
                'weekday',quiet.weekday,'startMinute',quiet.start_minute,
                'endMinute',quiet.end_minute,'enabled',quiet.enabled) ORDER BY quiet.weekday)
                FROM creator_quiet_hours quiet
                WHERE quiet.user_id=room.creator_user_id),'[]'::JSONB) quiet_hours,
            COALESCE((SELECT jsonb_agg(jsonb_build_object(
                'weekday',preferred_window.weekday,'startMinute',preferred_window.start_minute,
                'endMinute',preferred_window.end_minute,'mode',preferred_window.interaction_mode,
                'enabled',preferred_window.enabled) ORDER BY preferred_window.weekday)
                FROM creator_interaction_windows preferred_window
                WHERE preferred_window.user_id=room.creator_user_id),'[]'::JSONB) interaction_windows,
            report.status report_status,report.creator_reconsented_at
            FROM live_interaction_events stored
            JOIN live_interactions room ON room.id=stored.interaction_id
            JOIN live_interaction_members member ON member.interaction_id=room.id
              AND member.user_id=$3 AND member.member_status='active'
            JOIN users actor ON actor.id=member.user_id AND actor.username=$4
              AND actor.authorized=TRUE AND actor.deactivated=FALSE
              AND COALESCE(actor.account_locked,FALSE)=FALSE
            JOIN users creator ON creator.id=room.creator_user_id
            LEFT JOIN creator_profiles profile ON profile.user_id=room.creator_user_id
            LEFT JOIN LATERAL(SELECT latest.status,latest.creator_reconsented_at
              FROM live_interaction_reports latest WHERE latest.interaction_id=room.id
              ORDER BY latest.created_at DESC,latest.id DESC LIMIT 1) report ON TRUE
            WHERE stored.event_id=$1 AND room.id=$2 AND room.status='active'
              AND member.member_role=$5
              AND (stored.audience='both' OR stored.audience=member.member_role)
              AND ($6::TEXT='both' OR $6::TEXT=member.member_role)`,
        [event.eventId, event.interactionId, Number(auth.userId), auth.username,
            subscription.role, realtimeAudience]);
        const row = result.rows[0];
        return row ? {
            role: row.member_role,
            account: {
                id: Number(row.creator_id),
                username: row.creator_username,
                authorized: row.creator_authorized === true,
                deactivated: row.creator_deactivated === true,
                account_locked: row.creator_account_locked === true,
                live_interaction_opt_in: row.live_interaction_opt_in === true,
                timezone: row.timezone
            },
            room: {
                id: Number(row.interaction_id),
                creatorUserId: Number(row.creator_user_id),
                ownerUserId: Number(row.owner_user_id),
                status: row.room_status,
                mutedUntil: row.creator_muted_until
            },
            preferences: row.preferences || [],
            quietHours: row.quiet_hours || [],
            interactionWindows: row.interaction_windows || [],
            report: row.report_status ? {
                status: row.report_status,
                creatorReconsentedAt: row.creator_reconsented_at
            } : null
        } : null;
    }

    async authorizeRealtimeRecipient(event, subscription, auth, realtimeAudience = 'both') {
        if (!event || !['creator','owner','both'].includes(event.audience)
            || !['creator','owner','both'].includes(realtimeAudience)) return false;
        const result = await this.pool.query(`SELECT member.member_role FROM live_interaction_events event
            JOIN live_interactions room ON room.id=event.interaction_id
            JOIN live_interaction_members member ON member.interaction_id=room.id
              AND member.user_id=$3 AND member.member_status='active'
            JOIN users actor ON actor.id=member.user_id AND actor.username=$4
              AND actor.authorized=TRUE AND actor.deactivated=FALSE
              AND COALESCE(actor.account_locked,FALSE)=FALSE
            JOIN creator_profiles profile ON profile.user_id=room.creator_user_id
              AND profile.live_interaction_opt_in=TRUE
            WHERE event.event_id=$1 AND room.id=$2
              AND member.member_role=$5
              AND (event.audience='both' OR event.audience=member.member_role)
              AND ($6::TEXT='both' OR $6::TEXT=member.member_role)
              AND NOT EXISTS(SELECT 1 FROM creator_preferences preference
                WHERE preference.user_id=room.creator_user_id
                  AND preference.preference_type='communication'
                  AND preference.preference_key='all_messages'
                  AND preference.preference_value='block')
              AND NOT EXISTS(SELECT 1 FROM live_interaction_reports report
                WHERE report.interaction_id=room.id
                  AND (report.status IN('open','reviewing') OR
                    (report.status IN('resolved','dismissed') AND report.creator_reconsented_at IS NULL)))
              AND NOT (member.member_role='owner'
                AND COALESCE(room.creator_muted_until>NOW(),FALSE))
              AND NOT (event.event_type='interaction.game_state_changed' AND EXISTS(
                SELECT 1 FROM creator_preferences game_preference
                WHERE game_preference.user_id=room.creator_user_id
                  AND game_preference.preference_type='game'
                  AND game_preference.preference_key=event.payload->>'gameId'
                  AND game_preference.preference_value='block'))`,
        [event.eventId, event.interactionId, Number(auth.userId), auth.username,
            subscription.role, realtimeAudience]);
        return result.rowCount === 1;
    }

    async directorSummary(queryable = this.pool, page = 1) {
        if (!queryable?.query) {
            page = queryable;
            queryable = this.pool;
        }
        const safePage = Math.max(1, Math.min(1000, Number(page) || 1));
        const limit = 25;
        const offset = (safePage - 1) * limit;
        const result = await queryable.query(`SELECT creator.id AS user_id,creator.username,
            CASE WHEN profile.profile_visibility='owner' THEN profile.display_name END display_name,
            CASE WHEN profile.profile_visibility='owner' THEN creator.bilibili_room_id END bilibili_room_id,
            profile.live_interaction_opt_in,
            profile.profile_visibility,profile.version profile_version,
            CASE WHEN profile.profile_visibility='owner' THEN profile.timezone END timezone,
            profile.timezone boundary_timezone,
            CASE WHEN profile.profile_visibility='owner' THEN profile.communication_style END communication_style,
            CASE WHEN profile.profile_visibility='owner' THEN relationship.total_xp END total_xp,
            CASE WHEN profile.profile_visibility='owner' THEN relationship.level END relationship_level,
            CASE WHEN profile.profile_visibility='owner' THEN relationship.milestone END milestone,
            CASE WHEN profile.profile_visibility='owner' THEN request.id END request_id,
            CASE WHEN profile.profile_visibility='owner' THEN request.requested_room_id END requested_room_id,
            CASE WHEN profile.profile_visibility='owner' THEN request.status END request_status,
            CASE WHEN profile.profile_visibility='owner' THEN request.requested_at END requested_at,
            room.id interaction_id,room.status interaction_status,room.revision,room.creator_availability,
            room.creator_muted_until,room.next_sequence,
            quest.id current_quest_id,quest.status current_quest_status,
            story.id story_run_id,story.current_episode,story.current_node_id,
            pending.pending_count,pending.items AS current_items,recent.last_event_at,
            recent.visible_last_sequence,recent.history AS recent_history
            FROM users creator JOIN creator_profiles profile ON profile.user_id=creator.id
            LEFT JOIN relationship_profiles relationship ON relationship.user_id=creator.id
            LEFT JOIN LATERAL(SELECT binding.id,binding.requested_room_id,binding.status,
                binding.requested_at FROM creator_room_binding_requests binding
                WHERE binding.user_id=creator.id ORDER BY binding.id DESC LIMIT 1) request ON TRUE
            LEFT JOIN LATERAL(SELECT * FROM live_interactions li WHERE li.creator_user_id=creator.id
                ORDER BY (li.status='active') DESC,li.updated_at DESC LIMIT 1) room ON TRUE
            LEFT JOIN LATERAL(SELECT qa.id,qa.status FROM quest_v2_assignments qa WHERE qa.user_id=creator.id
                AND qa.status IN('offered','active','returned','under_review') ORDER BY qa.updated_at DESC LIMIT 1) quest ON TRUE
            LEFT JOIN LATERAL(SELECT sr.id,sr.current_episode,sr.current_node_id FROM story_runs sr WHERE sr.user_id=creator.id
                ORDER BY (sr.status='active') DESC,sr.updated_at DESC LIMIT 1) story ON TRUE
            LEFT JOIN LATERAL(SELECT COUNT(*)::INTEGER pending_count,
                COALESCE(jsonb_agg(jsonb_build_object('id',latest.id,'itemType',latest.item_type,
                    'status',latest.status,'templateKey',latest.template_key,'createdAt',latest.created_at)
                    ORDER BY latest.created_at DESC,latest.id DESC),'[]'::JSONB) items
                FROM (SELECT id,item_type,status,template_key,created_at FROM live_interaction_items lii
                    WHERE lii.interaction_id=room.id AND lii.status IN('scheduled','delivered')
                    ORDER BY lii.created_at DESC,lii.id DESC LIMIT 8) latest) pending ON TRUE
            LEFT JOIN LATERAL(SELECT MAX(history.created_at) last_event_at,
                COALESCE(MAX(history.sequence),0) visible_last_sequence,
                COALESCE(jsonb_agg(jsonb_build_object('sequence',history.sequence,'eventType',history.event_type,
                    'createdAt',history.created_at) ORDER BY history.sequence),'[]'::JSONB) history
                FROM (SELECT sequence,event_type,created_at FROM live_interaction_events lie
                    WHERE lie.interaction_id=room.id AND lie.audience IN ('both','owner')
                    ORDER BY lie.sequence DESC LIMIT 12) history) recent ON TRUE
            WHERE creator.authorized=TRUE AND creator.deactivated=FALSE
              AND COALESCE(creator.account_locked,FALSE)=FALSE
            ORDER BY profile.updated_at DESC,creator.username LIMIT $1 OFFSET $2`, [limit, offset]);
        return {
            page: safePage,
            pageSize: limit,
            creators: result.rows.map(row => ({
                userId: Number(row.user_id),
                username: row.username,
                displayName: row.display_name,
                bilibiliRoomId: row.bilibili_room_id,
                liveInteractionOptIn: row.live_interaction_opt_in === true,
                timezone: row.timezone,
                boundaryTimezone: row.boundary_timezone,
                communicationStyle: row.communication_style,
                profileVisibility: row.profile_visibility,
                profileVersion: Number(row.profile_version),
                totalXp: row.total_xp === null ? null : Number(row.total_xp || 0),
                level: row.relationship_level === null ? null : Number(row.relationship_level || 1),
                milestone: row.milestone || null,
                roomRequest: row.request_id ? {
                    id: Number(row.request_id),
                    requestedRoomId: row.requested_room_id,
                    status: row.request_status,
                    requestedAt: row.requested_at
                } : null,
                interaction: row.interaction_id ? {
                    id: Number(row.interaction_id),
                    status: row.interaction_status,
                    revision: Number(row.revision),
                    availability: row.creator_availability,
                    mutedUntil: row.creator_muted_until,
                    lastSequence: Number(row.visible_last_sequence || 0),
                    pendingCount: Number(row.pending_count || 0),
                    currentItems: row.current_items || [],
                    recentHistory: row.recent_history || []
                } : null,
                currentQuest: row.current_quest_id ? {
                    id: Number(row.current_quest_id),
                    status: row.current_quest_status
                } : null,
                currentStory: row.story_run_id ? {
                    runId: Number(row.story_run_id),
                    episode: row.current_episode,
                    nodeId: row.current_node_id
                } : null,
                lastEventAt: row.last_event_at
            }))
        };
    }

    async listReports(queryable = this.pool, { limit = 50, includeEvidence = false } = {}) {
        const result = await queryable.query(`SELECT report.id,
            CASE WHEN $2::BOOLEAN THEN report.reason_code END reason_code,
            CASE WHEN $2::BOOLEAN THEN report.detail END detail,
            report.status,report.created_at,
            CASE WHEN $2::BOOLEAN THEN creator.username END reporter_username,
            room.id interaction_id,room.revision interaction_revision,
            CASE WHEN $2::BOOLEAN THEN item.item_type END item_type
            FROM live_interaction_reports report JOIN users creator ON creator.id=report.reporter_user_id
            JOIN live_interactions room ON room.id=report.interaction_id
            LEFT JOIN live_interaction_items item ON item.id=report.item_id
            ORDER BY (report.status='open') DESC,report.created_at DESC LIMIT $1`, [limit,
            includeEvidence]);
        return result.rows.map(row => ({
            id: Number(row.id),
            reasonCode: row.reason_code,
            detail: row.detail,
            status: row.status,
            createdAt: row.created_at,
            reporterUsername: row.reporter_username,
            interactionId: Number(row.interaction_id),
            interactionRevision: Number(row.interaction_revision),
            itemType: row.item_type,
            evidenceRedacted: !includeEvidence
        }));
    }
}

module.exports = {
    LiveInteractionRepository,
    itemRow,
    roomRow
};
