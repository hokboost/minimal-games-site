'use strict';

function stableJson(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

function profileRow(row) {
    if (!row) return null;
    return {
        userId: Number(row.user_id),
        displayName: row.display_name,
        bio: row.bio,
        pronouns: row.pronouns,
        timezone: row.timezone,
        interactionTones: row.interaction_tones || [],
        difficulty: row.difficulty,
        storyTone: row.story_tone,
        communicationStyle: row.communication_style,
        liveInteractionOptIn: row.live_interaction_opt_in,
        profileVisibility: row.profile_visibility,
        evidenceRetention: row.evidence_retention,
        version: Number(row.version),
        updatedAt: row.updated_at
    };
}

function relationshipRow(row) {
    return row ? {
        totalXp: Number(row.total_xp),
        level: Number(row.level),
        milestone: row.milestone,
        version: Number(row.version),
        updatedAt: row.updated_at
    } : { totalXp: 0, level: 1, milestone: 'new_signal', version: 0, updatedAt: null };
}

function roomRequestRow(row) {
    return row ? {
        id: Number(row.id),
        requestedRoomId: row.requested_room_id,
        previousRoomId: row.previous_room_id,
        status: row.status,
        requestNote: row.request_note,
        reviewNote: row.review_note,
        requestedAt: row.requested_at,
        reviewedAt: row.reviewed_at,
        cancelledAt: row.cancelled_at
    } : null;
}

class CreatorRepository {
    constructor({ pool }) {
        if (!pool?.query || !pool?.connect) throw new TypeError('CreatorRepository requires a database pool');
        this.pool = pool;
    }

    async withTransaction(work) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await work(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            throw error;
        } finally {
            client.release();
        }
    }

    async lockUser(client, username) {
        const result = await client.query(`
            SELECT id, username, bilibili_room_id
            FROM users
            WHERE username = $1 AND authorized = TRUE AND deactivated = FALSE
            FOR UPDATE
        `, [username]);
        return result.rows[0] || null;
    }

    async getProfile(queryable, userId) {
        const result = await queryable.query('SELECT * FROM creator_profiles WHERE user_id = $1', [userId]);
        return profileRow(result.rows[0]);
    }

    async saveProfile(client, userId, profile) {
        const result = await client.query(`
            INSERT INTO creator_profiles (
                user_id, display_name, bio, pronouns, timezone, interaction_tones,
                difficulty, story_tone, communication_style, live_interaction_opt_in,
                profile_visibility, evidence_retention, version
            ) VALUES ($1, $2, $3, $4, $5, $6::TEXT[], $7, $8, $9, $10, $11, $12, 1)
            ON CONFLICT (user_id) DO UPDATE SET
                display_name = EXCLUDED.display_name,
                bio = EXCLUDED.bio,
                pronouns = EXCLUDED.pronouns,
                timezone = EXCLUDED.timezone,
                interaction_tones = EXCLUDED.interaction_tones,
                difficulty = EXCLUDED.difficulty,
                story_tone = EXCLUDED.story_tone,
                communication_style = EXCLUDED.communication_style,
                live_interaction_opt_in = EXCLUDED.live_interaction_opt_in,
                profile_visibility = EXCLUDED.profile_visibility,
                evidence_retention = EXCLUDED.evidence_retention,
                version = creator_profiles.version + 1,
                updated_at = NOW()
            RETURNING *
        `, [
            userId, profile.displayName, profile.bio, profile.pronouns, profile.timezone,
            profile.interactionTones, profile.difficulty, profile.storyTone,
            profile.communicationStyle, profile.liveInteractionOptIn,
            profile.profileVisibility, profile.evidenceRetention
        ]);
        return profileRow(result.rows[0]);
    }

    async listPreferences(queryable, userId) {
        const result = await queryable.query(`
            SELECT preference_type, preference_key, preference_value
            FROM creator_preferences WHERE user_id = $1
            ORDER BY preference_type, preference_key
        `, [userId]);
        return result.rows.map((row) => ({
            type: row.preference_type,
            key: row.preference_key,
            value: row.preference_value
        }));
    }

    async replacePreferences(client, userId, preferences) {
        await client.query('DELETE FROM creator_preferences WHERE user_id = $1', [userId]);
        for (const preference of preferences) {
            await client.query(`
                INSERT INTO creator_preferences (
                    user_id, preference_type, preference_key, preference_value, source
                ) VALUES ($1, $2, $3, $4, 'creator')
            `, [userId, preference.type, preference.key, preference.value]);
        }
    }

    async listQuietHours(queryable, userId) {
        const result = await queryable.query(`
            SELECT weekday, start_minute, end_minute, enabled
            FROM creator_quiet_hours WHERE user_id = $1 ORDER BY weekday
        `, [userId]);
        return result.rows.map((row) => ({
            weekday: Number(row.weekday),
            startMinute: Number(row.start_minute),
            endMinute: Number(row.end_minute),
            enabled: row.enabled
        }));
    }

    async replaceQuietHours(client, userId, windows) {
        await client.query('DELETE FROM creator_quiet_hours WHERE user_id = $1', [userId]);
        for (const window of windows) {
            await client.query(`
                INSERT INTO creator_quiet_hours (
                    user_id, weekday, start_minute, end_minute, enabled
                ) VALUES ($1, $2, $3, $4, $5)
            `, [userId, window.weekday, window.startMinute, window.endMinute, window.enabled]);
        }
    }

    async listInteractionWindows(queryable, userId) {
        const result = await queryable.query(`
            SELECT weekday, start_minute, end_minute, interaction_mode, enabled
            FROM creator_interaction_windows WHERE user_id = $1 ORDER BY weekday
        `, [userId]);
        return result.rows.map((row) => ({
            weekday: Number(row.weekday),
            startMinute: Number(row.start_minute),
            endMinute: Number(row.end_minute),
            mode: row.interaction_mode,
            enabled: row.enabled
        }));
    }

    async replaceInteractionWindows(client, userId, windows) {
        await client.query('DELETE FROM creator_interaction_windows WHERE user_id = $1', [userId]);
        for (const window of windows) {
            await client.query(`
                INSERT INTO creator_interaction_windows (
                    user_id, weekday, start_minute, end_minute, interaction_mode, enabled
                ) VALUES ($1, $2, $3, $4, $5, $6)
            `, [userId, window.weekday, window.startMinute, window.endMinute, window.mode, window.enabled]);
        }
    }

    async appendConsentEvent(client, event) {
        await client.query(`
            INSERT INTO creator_consent_events (
                user_id, actor_type, actor_username, event_type,
                previous_state, next_state, request_id
            ) VALUES ($1, $2, $3, $4, $5::JSONB, $6::JSONB, $7)
        `, [
            event.userId, event.actorType, event.actorUsername, event.eventType,
            JSON.stringify(event.previousState), JSON.stringify(event.nextState), event.requestId || null
        ]);
    }

    async appendRelationshipEvent(client, event) {
        const inserted = await client.query(`
            INSERT INTO relationship_events (
                user_id, event_type, xp_delta, source_type, source_id,
                summary_zh, summary_en, metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::JSONB)
            ON CONFLICT (user_id, source_type, source_id) DO NOTHING
            RETURNING id
        `, [
            event.userId, event.eventType, event.xpDelta, event.sourceType, event.sourceId,
            event.summaryZh, event.summaryEn, JSON.stringify(event.metadata || {})
        ]);
        if (inserted.rowCount === 1) return true;
        const existing = await client.query(`
            SELECT event_type, xp_delta, summary_zh, summary_en, metadata
            FROM relationship_events
            WHERE user_id = $1 AND source_type = $2 AND source_id = $3
        `, [event.userId, event.sourceType, event.sourceId]);
        const row = existing.rows[0];
        const expectedMetadata = event.metadata || {};
        const sameIdentity = row
            && row.event_type === event.eventType
            && Number(row.xp_delta) === event.xpDelta
            && row.summary_zh === event.summaryZh
            && row.summary_en === event.summaryEn
            && stableJson(row.metadata) === stableJson(expectedMetadata);
        if (!sameIdentity) {
            const error = new Error('Relationship event identity was reused with different semantics');
            error.code = 'RELATIONSHIP_EVENT_IDENTITY_CONFLICT';
            throw error;
        }
        return false;
    }

    async lockRelationship(client, userId) {
        await client.query(`
            INSERT INTO relationship_profiles (user_id)
            VALUES ($1) ON CONFLICT (user_id) DO NOTHING
        `, [userId]);
        const result = await client.query(
            'SELECT * FROM relationship_profiles WHERE user_id = $1 FOR UPDATE',
            [userId]
        );
        return relationshipRow(result.rows[0]);
    }

    async saveRelationship(client, userId, projection) {
        const result = await client.query(`
            UPDATE relationship_profiles
            SET total_xp = $2, level = $3, milestone = $4,
                version = version + 1, updated_at = NOW()
            WHERE user_id = $1
            RETURNING *
        `, [userId, projection.totalXp, projection.level, projection.milestone]);
        return relationshipRow(result.rows[0]);
    }

    async getRelationship(queryable, userId) {
        const result = await queryable.query('SELECT * FROM relationship_profiles WHERE user_id = $1', [userId]);
        return relationshipRow(result.rows[0]);
    }

    async ensureWelcomeMemory(client, userId) {
        await client.query(`
            INSERT INTO shared_memories (
                user_id, source_type, source_id, title_zh, title_en, body_zh, body_en,
                content_version, visibility
            ) VALUES (
                $1, 'creator_profile', 'welcome-v1',
                '第一束星光', 'The First Starlight',
                '你创建了主播世界资料。之后共同做出的选择会在这里留下可追溯的记忆。',
                'You created your Creator World profile. Future shared choices can leave traceable memories here.',
                1, 'private'
            ) ON CONFLICT (user_id, source_type, source_id) DO NOTHING
        `, [userId]);
    }

    async listMemories(queryable, userId, { limit = 20 } = {}) {
        const result = await queryable.query(`
            SELECT id, title_zh, title_en, body_zh, body_en, visibility,
                   pinned, archived, hidden, occurred_at, content_version
            FROM shared_memories
            WHERE user_id = $1 AND hidden = FALSE
            ORDER BY archived, pinned DESC, occurred_at DESC, id DESC
            LIMIT $2
        `, [userId, limit]);
        return result.rows.map((row) => ({
            id: Number(row.id), titleZh: row.title_zh, titleEn: row.title_en,
            bodyZh: row.body_zh, bodyEn: row.body_en, visibility: row.visibility,
            pinned: row.pinned, archived: row.archived, hidden: row.hidden,
            occurredAt: row.occurred_at, contentVersion: Number(row.content_version)
        }));
    }

    async updateMemoryState(client, userId, memoryId, state) {
        const result = await client.query(`
            UPDATE shared_memories
            SET pinned = $3, archived = $4, visibility = $5, hidden = $6
            WHERE id = $1 AND user_id = $2
            RETURNING id
        `, [memoryId, userId, state.pinned, state.archived, state.visibility, state.hidden]);
        return result.rowCount === 1;
    }

    async ensureWelcomeInbox(client, userId) {
        await client.query(`
            INSERT INTO creator_inbox_messages (
                user_id, sender_type, message_type, dedupe_key,
                title_zh, title_en, body_zh, body_en, action_path
            ) VALUES (
                $1, 'system', 'welcome', 'creator-foundation-welcome-v1',
                '欢迎来到主播世界', 'Welcome to Creator World',
                '先设置你的互动偏好和安静时间。所有合作功能都会尊重这些边界。',
                'Start with your interaction preferences and quiet hours. Every collaboration feature will respect these boundaries.',
                '/creator/profile'
            ) ON CONFLICT (user_id, dedupe_key) DO NOTHING
        `, [userId]);
    }

    async listInbox(queryable, userId, { limit = 30 } = {}) {
        const result = await queryable.query(`
            SELECT id, sender_type, message_type, title_zh, title_en, body_zh, body_en,
                   action_path, sent_at, expires_at, read_at, archived_at
            FROM creator_inbox_messages
            WHERE user_id = $1
              AND archived_at IS NULL
              AND (expires_at IS NULL OR expires_at > NOW())
            ORDER BY read_at NULLS FIRST, sent_at DESC, id DESC
            LIMIT $2
        `, [userId, limit]);
        return result.rows.map((row) => ({
            id: Number(row.id), senderType: row.sender_type, messageType: row.message_type,
            titleZh: row.title_zh, titleEn: row.title_en, bodyZh: row.body_zh,
            bodyEn: row.body_en, actionPath: row.action_path, sentAt: row.sent_at,
            expiresAt: row.expires_at, readAt: row.read_at, archivedAt: row.archived_at
        }));
    }

    async updateInboxState(client, userId, messageId, action) {
        const column = action === 'read' ? 'read_at' : 'archived_at';
        const result = await client.query(`
            UPDATE creator_inbox_messages SET ${column} = COALESCE(${column}, NOW())
            WHERE id = $1 AND user_id = $2 RETURNING id
        `, [messageId, userId]);
        return result.rowCount === 1;
    }

    async getActiveRoomRequest(queryable, userId) {
        const result = await queryable.query(`
            SELECT * FROM creator_room_binding_requests
            WHERE user_id = $1 AND status IN ('requested', 'verifying')
            ORDER BY id DESC LIMIT 1
        `, [userId]);
        return roomRequestRow(result.rows[0]);
    }

    async createRoomRequest(client, user, roomId, note) {
        const result = await client.query(`
            INSERT INTO creator_room_binding_requests (
                user_id, requested_room_id, previous_room_id, request_note
            ) VALUES ($1, $2, $3, $4)
            RETURNING *
        `, [user.id, roomId, user.bilibili_room_id, note]);
        return roomRequestRow(result.rows[0]);
    }

    async cancelRoomRequest(client, userId, requestId) {
        const result = await client.query(`
            UPDATE creator_room_binding_requests
            SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
            WHERE id = $1 AND user_id = $2 AND status IN ('requested', 'verifying')
            RETURNING *
        `, [requestId, userId]);
        return roomRequestRow(result.rows[0]);
    }

    async resolveRoomRequestsOnExistingBind(client, {
        userId, roomId, reviewerUsername, requestId, actorType = 'admin'
    }) {
        const resolved = await client.query(`
            UPDATE creator_room_binding_requests
            SET status = CASE WHEN requested_room_id = $2 THEN 'approved' ELSE 'rejected' END,
                review_note = CASE
                    WHEN requested_room_id = $2 THEN 'Verified through existing secure room-binding flow'
                    ELSE 'Superseded by a different room in the existing secure binding flow'
                END,
                reviewer_username = $3,
                reviewed_at = NOW(),
                updated_at = NOW()
            WHERE user_id = $1 AND status IN ('requested', 'verifying')
            RETURNING id, requested_room_id, status
        `, [userId, roomId, reviewerUsername]);
        for (const row of resolved.rows) {
            await this.appendConsentEvent(client, {
                userId,
                actorType,
                actorUsername: reviewerUsername,
                eventType: `creator.room_binding.${row.status}`,
                previousState: { requestId: Number(row.id), status: 'active' },
                nextState: {
                    requestId: Number(row.id),
                    requestedRoomId: row.requested_room_id,
                    boundRoomId: roomId,
                    status: row.status
                },
                requestId
            });
        }
        return resolved.rows.map((row) => ({
            id: Number(row.id), requestedRoomId: row.requested_room_id, status: row.status
        }));
    }

    async loadDashboard(username) {
        const userResult = await this.pool.query(`
            SELECT id, username, bilibili_room_id FROM users
            WHERE username = $1 AND authorized = TRUE AND deactivated = FALSE
        `, [username]);
        const user = userResult.rows[0];
        if (!user) return null;
        const [profile, preferences, quietHours, interactionWindows, roomRequest, relationship, memories, inbox] = await Promise.all([
            this.getProfile(this.pool, user.id),
            this.listPreferences(this.pool, user.id),
            this.listQuietHours(this.pool, user.id),
            this.listInteractionWindows(this.pool, user.id),
            this.getActiveRoomRequest(this.pool, user.id),
            this.getRelationship(this.pool, user.id),
            this.listMemories(this.pool, user.id),
            this.listInbox(this.pool, user.id)
        ]);
        return {
            account: { username: user.username, bilibiliRoomId: user.bilibili_room_id },
            profile, preferences, quietHours, interactionWindows, roomRequest, relationship, memories, inbox
        };
    }

    async listAdminSummaries({ limit, offset }) {
        const result = await this.pool.query(`
            SELECT u.username, u.bilibili_room_id,
                   CASE WHEN p.profile_visibility = 'owner' THEN p.display_name END AS display_name,
                   CASE WHEN p.profile_visibility = 'owner' THEN p.timezone END AS timezone,
                   p.live_interaction_opt_in, p.profile_visibility, p.version,
                   r.total_xp, r.level, r.milestone,
                   request.id AS request_id, request.requested_room_id, request.status AS request_status,
                   request.requested_at
            FROM users u
            LEFT JOIN creator_profiles p ON p.user_id = u.id
            LEFT JOIN relationship_profiles r ON r.user_id = u.id
            LEFT JOIN LATERAL (
                SELECT id, requested_room_id, status, requested_at
                FROM creator_room_binding_requests
                WHERE user_id = u.id
                ORDER BY id DESC LIMIT 1
            ) request ON TRUE
            WHERE u.authorized = TRUE AND u.deactivated = FALSE
              AND (p.user_id IS NOT NULL OR request.id IS NOT NULL)
            ORDER BY COALESCE(request.requested_at, p.updated_at) DESC NULLS LAST, u.username
            LIMIT $1 OFFSET $2
        `, [limit, offset]);
        return result.rows.map((row) => ({
            username: row.username,
            bilibiliRoomId: row.bilibili_room_id,
            displayName: row.display_name,
            timezone: row.timezone,
            liveInteractionOptIn: row.live_interaction_opt_in === true,
            profileVisibility: row.profile_visibility,
            profileVersion: row.version ? Number(row.version) : null,
            totalXp: Number(row.total_xp || 0),
            level: Number(row.level || 1),
            milestone: row.milestone || 'new_signal',
            roomRequest: row.request_id ? {
                id: Number(row.request_id),
                requestedRoomId: row.requested_room_id,
                status: row.request_status,
                requestedAt: row.requested_at
            } : null
        }));
    }

    async exportCreatorData(username) {
        const userResult = await this.pool.query(`
            SELECT id, username, bilibili_room_id FROM users
            WHERE username = $1 AND authorized = TRUE AND deactivated = FALSE
        `, [username]);
        const user = userResult.rows[0];
        if (!user) return null;
        const [profile, preferences, quietHours, interactionWindows, relationship, memories, inbox, consent] = await Promise.all([
            this.getProfile(this.pool, user.id),
            this.listPreferences(this.pool, user.id),
            this.listQuietHours(this.pool, user.id),
            this.listInteractionWindows(this.pool, user.id),
            this.getRelationship(this.pool, user.id),
            this.pool.query(`
                SELECT id, source_type, source_id, title_zh, title_en, body_zh, body_en,
                       content_version, visibility, pinned, archived, hidden, occurred_at, created_at
                FROM shared_memories WHERE user_id = $1
                ORDER BY occurred_at DESC, id DESC LIMIT 500
            `, [user.id]),
            this.pool.query(`
                SELECT id, sender_type, sender_username, message_type, title_zh, title_en,
                       body_zh, body_en, action_path, sent_at, expires_at, read_at, archived_at
                FROM creator_inbox_messages WHERE user_id = $1
                ORDER BY sent_at DESC, id DESC LIMIT 500
            `, [user.id]),
            this.pool.query(`
                SELECT id, actor_type, actor_username, event_type, previous_state, next_state,
                       request_id, created_at
                FROM creator_consent_events WHERE user_id = $1
                ORDER BY created_at DESC, id DESC LIMIT 500
            `, [user.id])
        ]);
        return {
            exportedAt: new Date().toISOString(),
            account: { username: user.username, bilibiliRoomId: user.bilibili_room_id },
            profile,
            preferences,
            quietHours,
            interactionWindows,
            relationship,
            memories: memories.rows,
            inbox: inbox.rows,
            consentEvents: consent.rows
        };
    }
}

module.exports = { CreatorRepository };
