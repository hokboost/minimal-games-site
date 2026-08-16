'use strict';

class PostgresQuestRepository {
    constructor(client) {
        if (!client || typeof client.query !== 'function') throw new TypeError('Quest repository requires a transaction client');
        this.client = client;
    }

    async listPublishedDefinitions() {
        const result = await this.client.query(`
            SELECT id, slug, version, title_zh, title_en, description_zh, description_en,
                   verification_mode, objective_version, objective, reward_points
            FROM quest_definitions
            WHERE status = 'published'
              AND (starts_at IS NULL OR starts_at <= NOW())
              AND (ends_at IS NULL OR ends_at > NOW())
              AND eligibility->>'type' = 'task_card_pilot'
            ORDER BY id
        `);
        return result.rows;
    }

    async createAssignment(username, definition, target) {
        const result = await this.client.query(`
            INSERT INTO quest_assignments (
                username, definition_id, objective_version, objective_snapshot,
                reward_points, target_value, assignment_source
            ) VALUES ($1, $2, $3, $4, $5, $6, 'automatic_pilot')
            ON CONFLICT (username, definition_id) DO NOTHING
            RETURNING id
        `, [
            username,
            definition.id,
            Number(definition.objective_version),
            JSON.stringify(definition.objective),
            Number(definition.reward_points),
            target
        ]);
        return result.rows[0] || null;
    }

    async insertProgressEvent(event) {
        const result = await this.client.query(`
            INSERT INTO quest_progress_events (
                source_type, source_event_id, username, event_type,
                event_version, occurred_at, payload
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (source_type, source_event_id) DO NOTHING
            RETURNING id
        `, [
            event.sourceType,
            event.sourceEventId,
            event.username,
            event.eventType,
            event.eventVersion,
            event.occurredAt,
            JSON.stringify(event.payload)
        ]);
        return result.rows[0] || null;
    }

    async loadProgressEvent(sourceType, sourceEventId) {
        const result = await this.client.query(`
            SELECT id, source_type, source_event_id, username, event_type, event_version,
                   occurred_at, payload, processing_status, result
            FROM quest_progress_events
            WHERE source_type = $1 AND source_event_id = $2
        `, [sourceType, sourceEventId]);
        return result.rows[0] || null;
    }

    async listCandidateAssignments(username, eventType) {
        const result = await this.client.query(`
            SELECT a.id, a.status, a.progress_value, a.target_value, a.reward_points,
                   a.revision, a.objective_version, a.objective_snapshot,
                   d.slug, d.version, d.verification_mode
            FROM quest_assignments a
            JOIN quest_definitions d ON d.id = a.definition_id
            WHERE a.username = $1
              AND a.status = 'active'
              AND (a.due_at IS NULL OR a.due_at > NOW())
              AND a.objective_snapshot->>'event' = $2
            ORDER BY a.id
            FOR UPDATE OF a
        `, [username, eventType]);
        return result.rows;
    }

    async updateProgress(assignmentId, expectedRevision, progressValue) {
        const result = await this.client.query(`
            UPDATE quest_assignments
            SET progress_value = $3, revision = revision + 1
            WHERE id = $1 AND status = 'active' AND revision = $2
            RETURNING revision
        `, [assignmentId, expectedRevision, progressValue]);
        return result.rows[0] || null;
    }

    async insertRewardPosting(posting) {
        const result = await this.client.query(`
            INSERT INTO quest_reward_postings (
                posting_id, assignment_id, progress_event_id, username,
                completion_number, reward_points, operation_type, status
            ) VALUES ($1, $2, $3, $4, 1, $5, $6, 'pending')
            ON CONFLICT (assignment_id) DO NOTHING
            RETURNING posting_id
        `, [
            posting.postingId,
            posting.assignmentId,
            posting.progressEventId,
            posting.username,
            posting.rewardPoints,
            posting.operationType
        ]);
        return result.rows[0] || null;
    }

    async markPostingPosted(postingId, balanceBefore, balanceAfter) {
        const result = await this.client.query(`
            UPDATE quest_reward_postings
            SET status = 'posted', balance_before = $2, balance_after = $3, posted_at = NOW()
            WHERE posting_id = $1 AND status = 'pending'
            RETURNING posting_id
        `, [postingId, balanceBefore, balanceAfter]);
        if (result.rowCount !== 1) throw new Error('Quest reward posting state changed');
    }

    async completeAssignment(assignmentId, expectedRevision, progressValue, postingId) {
        const result = await this.client.query(`
            UPDATE quest_assignments
            SET status = 'completed', progress_value = $3, revision = revision + 1,
                completed_at = NOW(), completion_number = 1, reward_posting_id = $4
            WHERE id = $1 AND status = 'active' AND revision = $2
            RETURNING revision
        `, [assignmentId, expectedRevision, progressValue, postingId]);
        if (result.rowCount !== 1) throw new Error('Quest assignment completion raced');
        return result.rows[0];
    }

    async insertAudit(entry) {
        await this.client.query(`
            INSERT INTO quest_audit_log (
                assignment_id, progress_event_id, posting_id, username,
                action, verification_mode, details, request_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
            entry.assignmentId,
            entry.progressEventId,
            entry.postingId || null,
            entry.username,
            entry.action,
            entry.verificationMode,
            JSON.stringify(entry.details),
            entry.requestId || null
        ]);
    }

    async finalizeProgressEvent(eventId, status, resultBody) {
        const result = await this.client.query(`
            UPDATE quest_progress_events
            SET processing_status = $2, result = $3, processed_at = NOW()
            WHERE id = $1 AND processing_status = 'recorded'
            RETURNING id
        `, [eventId, status, JSON.stringify(resultBody)]);
        if (result.rowCount !== 1) throw new Error('Quest progress event finalization raced');
    }

    async listUserAssignments(username) {
        const result = await this.client.query(`
            SELECT a.id, a.status, a.progress_value, a.target_value, a.reward_points,
                   a.assigned_at, a.due_at, a.completed_at, a.reward_posting_id,
                   d.slug, d.version, d.title_zh, d.title_en,
                   d.description_zh, d.description_en, d.verification_mode
            FROM quest_assignments a
            JOIN quest_definitions d ON d.id = a.definition_id
            WHERE a.username = $1 AND a.status IN ('active', 'completed')
            ORDER BY CASE a.status WHEN 'active' THEN 0 ELSE 1 END, a.assigned_at DESC, a.id DESC
            LIMIT 20
        `, [username]);
        return result.rows;
    }
}

module.exports = PostgresQuestRepository;
