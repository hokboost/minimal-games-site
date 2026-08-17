'use strict';

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
        memberRole: row.member_role,
        memberStatus: row.member_status
    };
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
        const result = await client.query(`
            SELECT u.id, u.username, u.is_admin, p.live_interaction_opt_in,
                   p.timezone, p.profile_visibility, p.communication_style
            FROM users u
            LEFT JOIN creator_profiles p ON p.user_id = u.id
            WHERE u.username = ANY($1::TEXT[])
              AND u.authorized = TRUE AND u.deactivated = FALSE
            ORDER BY u.id
            FOR UPDATE OF u
        `, [
            [creatorUsername, ownerUsername]
        ]);
        const byName = new Map(result.rows.map((row) => [row.username, row]));
        return {
            creator: byName.get(creatorUsername) || null,
            owner: byName.get(ownerUsername) || null
        };
    }

    async readAccount(username) {
        const result = await this.pool.query(`
            SELECT u.id, u.username, u.is_admin, p.live_interaction_opt_in,
                   p.timezone, p.profile_visibility, p.communication_style
            FROM users u LEFT JOIN creator_profiles p ON p.user_id = u.id
            WHERE u.username=$1 AND u.authorized=TRUE AND u.deactivated=FALSE
        `, [username]);
        return result.rows[0] || null;
    }

    async creatorBoundaries(queryable, userId) {
        const [preferences, quietHours, windows] = await Promise.all([
            queryable.query(`SELECT preference_key,preference_value FROM creator_preferences
                WHERE user_id=$1 AND preference_type='communication'`, [userId]),
            queryable.query(`SELECT weekday,start_minute,end_minute,enabled FROM creator_quiet_hours
                WHERE user_id=$1 ORDER BY weekday`, [userId]),
            queryable.query(`SELECT weekday,start_minute,end_minute,interaction_mode,enabled
                FROM creator_interaction_windows WHERE user_id=$1 ORDER BY weekday`, [userId])
        ]);
        return {
            preferences: Object.fromEntries(preferences.rows.map((row) => [row.preference_key, row
                .preference_value])),
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
            }))
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
            JOIN users creator ON creator.id=room.creator_user_id
            JOIN users owner ON owner.id=room.owner_user_id
            WHERE room.id=$1
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
        const counter = await client.query(`UPDATE live_interactions SET next_sequence=next_sequence+1
            WHERE id=$1 RETURNING next_sequence-1 AS sequence`, [event.interactionId]);
        const sequence = Number(counter.rows[0].sequence);
        const result = await client.query(`
            INSERT INTO live_interaction_events(event_id,interaction_id,sequence,protocol_version,event_type,
                actor_type,actor_user_id,subject_user_id,correlation_id,state_revision,payload)
            VALUES($1,$2,$3,1,$4,$5,$6,$7,$8,$9,$10::JSONB) RETURNING *
        `, [event.eventId, event.interactionId, sequence, event.eventType, event.actorType,
            event.actorUserId, event.subjectUserId, event.correlationId, event.stateRevision,
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
        const result = await client.query(`UPDATE live_interactions SET status=$3,revision=$4,
            creator_availability=$5,creator_muted_until=$6,
            closed_at=CASE WHEN $3 IN ('left','closed') THEN COALESCE(closed_at,NOW()) ELSE closed_at END
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
        const maximum = room.nextSequence - 1;
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
                AND schedule.lifecycle IN('active','scheduled') AND schedule.starts_at<=NOW() AND schedule.ends_at>NOW()
            WHERE definition.slug=$2 AND version.lifecycle='active'
              AND NOT EXISTS(SELECT 1 FROM creator_preferences preference WHERE preference.user_id=$1
                AND preference.preference_type='quest_category' AND preference.preference_key=definition.category
                AND preference.preference_value='block')
            ORDER BY version.version DESC LIMIT 1`, [userId, slug]);
        return result.rows[0] || null;
    }

    async validateStoryTarget(client, userId, nodeId) {
        const result = await client.query(`SELECT run.id,run.current_node_id,run.revision
            FROM story_runs run JOIN story_content_versions version ON version.id=run.content_version_id
            WHERE run.user_id=$1 AND run.status='active' AND run.current_node_id=$2
              AND EXISTS(SELECT 1 FROM jsonb_array_elements(version.content_snapshot->'nodes') node
                WHERE node->>'id'=$2 AND node->>'type'='owner_intervention')
            ORDER BY run.updated_at DESC LIMIT 1`, [userId, nodeId]);
        const row = result.rows[0];
        return row && row.current_node_id === nodeId ? {
            runId: Number(row.id),
            nodeId: row.current_node_id,
            revision: Number(row.revision)
        } : null;
    }

    async insertAudit(client, audit) {
        await client.query(`INSERT INTO live_interaction_audit_log(interaction_id,actor_user_id,actor_type,
            action,request_id,details) VALUES($1,$2,$3,$4,$5,$6::JSONB)`, [audit.interactionId,
            audit.actorUserId, audit.actorType, audit.action, audit.requestId || null, JSON.stringify(audit
                .details || {})
        ]);
    }

    async catchUp(interactionId, username, afterSequence, limit) {
        const room = await this.readMemberRoom(interactionId, username);
        if (!room) return null;
        const result = await this.pool.query(`SELECT * FROM live_interaction_events
            WHERE interaction_id=$1 AND sequence>$2 ORDER BY sequence LIMIT $3`,
            [interactionId, afterSequence, limit + 1]);
        const rows = result.rows.slice(0, limit).map(envelope);
        return {
            room,
            events: rows,
            hasMore: result.rows.length > limit,
            nextAfter: rows.length ? rows.at(-1).sequence : afterSequence
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
        return {
            room,
            items: await this.listItems(this.pool, interactionId),
            report: report ? {
                id: Number(report.id),
                status: report.status,
                reconsented: report.creator_reconsented_at !== null
            } : null,
            recent: (await this.pool.query(`SELECT * FROM live_interaction_events WHERE interaction_id=$1
                ORDER BY sequence DESC LIMIT 30`, [interactionId])).rows.reverse().map(envelope)
        };
    }

    async listCreatorRooms(username) {
        const result = await this.pool.query(`SELECT room.*,creator.username AS creator_username,owner.username AS owner_username,
            member.member_role,member.member_status,member.highest_ack_sequence
            FROM live_interactions room JOIN users creator ON creator.id=room.creator_user_id
            JOIN users owner ON owner.id=room.owner_user_id
            JOIN users actor ON actor.username=$1 AND actor.authorized=TRUE AND actor.deactivated=FALSE
            JOIN live_interaction_members member ON member.interaction_id=room.id AND member.user_id=actor.id
            ORDER BY (room.status='active') DESC,room.updated_at DESC LIMIT 20`, [username]);
        return result.rows.map(roomRow);
    }

    async directorSummary(page = 1) {
        const safePage = Math.max(1, Math.min(1000, Number(page) || 1));
        const limit = 25;
        const offset = (safePage - 1) * limit;
        const result = await this.pool.query(`SELECT creator.id AS user_id,creator.username,
            CASE WHEN profile.profile_visibility='owner' THEN profile.display_name END display_name,
            profile.live_interaction_opt_in,profile.timezone,profile.communication_style,
            room.id interaction_id,room.status interaction_status,room.revision,room.creator_availability,
            room.creator_muted_until,room.next_sequence,
            quest.id current_quest_id,quest.status current_quest_status,
            story.id story_run_id,story.current_episode,story.current_node_id,
            pending.pending_count,pending.items AS current_items,recent.last_event_at,recent.history AS recent_history
            FROM users creator JOIN creator_profiles profile ON profile.user_id=creator.id
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
                COALESCE(jsonb_agg(jsonb_build_object('sequence',history.sequence,'eventType',history.event_type,
                    'createdAt',history.created_at) ORDER BY history.sequence),'[]'::JSONB) history
                FROM (SELECT sequence,event_type,created_at FROM live_interaction_events lie
                    WHERE lie.interaction_id=room.id ORDER BY lie.sequence DESC LIMIT 12) history) recent ON TRUE
            WHERE creator.authorized=TRUE AND creator.deactivated=FALSE
            ORDER BY profile.updated_at DESC,creator.username LIMIT $1 OFFSET $2`, [limit, offset]);
        return {
            page: safePage,
            pageSize: limit,
            creators: result.rows.map(row => ({
                userId: Number(row.user_id),
                username: row.username,
                displayName: row.display_name,
                liveInteractionOptIn: row.live_interaction_opt_in === true,
                timezone: row.timezone,
                communicationStyle: row.communication_style,
                interaction: row.interaction_id ? {
                    id: Number(row.interaction_id),
                    status: row.interaction_status,
                    revision: Number(row.revision),
                    availability: row.creator_availability,
                    mutedUntil: row.creator_muted_until,
                    lastSequence: Number(row.next_sequence) - 1,
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

    async listReports(limit = 50) {
        const result = await this.pool.query(`SELECT report.id,report.reason_code,report.detail,report.status,report.created_at,
            creator.username reporter_username,room.id interaction_id,item.item_type
            FROM live_interaction_reports report JOIN users creator ON creator.id=report.reporter_user_id
            JOIN live_interactions room ON room.id=report.interaction_id
            LEFT JOIN live_interaction_items item ON item.id=report.item_id
            ORDER BY (report.status='open') DESC,report.created_at DESC LIMIT $1`, [limit]);
        return result.rows.map(row => ({
            id: Number(row.id),
            reasonCode: row.reason_code,
            detail: row.detail,
            status: row.status,
            createdAt: row.created_at,
            reporterUsername: row.reporter_username,
            interactionId: Number(row.interaction_id),
            itemType: row.item_type
        }));
    }
}

module.exports = {
    LiveInteractionRepository,
    itemRow,
    roomRow
};