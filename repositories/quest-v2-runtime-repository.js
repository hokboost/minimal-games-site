'use strict';

const { stableStringify } = require('../lib/idempotency');

class QuestV2RuntimeRepository {
    constructor(client) {
        if (!client?.query) throw new TypeError('QuestV2RuntimeRepository requires a transaction client');
        this.client = client;
    }

    async lockCreator(username) {
        const result = await this.client.query(`
            SELECT account.id, account.username, profile.timezone, profile.evidence_retention,
                   relationship.level AS relationship_level
            FROM users account
            JOIN creator_profiles profile ON profile.user_id = account.id
            JOIN relationship_profiles relationship ON relationship.user_id = account.id
            WHERE account.username = $1 AND account.authorized = TRUE AND account.deactivated = FALSE
              AND COALESCE(account.account_locked, FALSE) = FALSE
            FOR UPDATE OF account
        `, [username]);
        return result.rows[0] || null;
    }

    async loadEligibilityFacts(userId, requirements = {}) {
        const achievements = Array.isArray(requirements.achievements)
            ? requirements.achievements : [];
        const storyFlags = Array.isArray(requirements.storyFlags)
            ? requirements.storyFlags : [];
        const collectionItems = Array.isArray(requirements.collectionItems)
            ? requirements.collectionItems : [];
        if (![achievements, storyFlags, collectionItems].every((items) => items.length <= 128
            && items.every((item) => typeof item === 'string' && item.length <= 120))) {
            throw new Error('Quest eligibility fact request is malformed');
        }

        const achievementRows = achievements.length === 0 ? [] : (await this.client.query(`
            SELECT DISTINCT definition.slug
            FROM streamer_achievement_unlocks achievement_unlock
            JOIN streamer_achievement_definitions definition
              ON definition.id = achievement_unlock.achievement_id
            WHERE achievement_unlock.user_id = $1
              AND definition.slug = ANY($2::TEXT[])
        `, [userId, achievements])).rows;

        // Only the authoritative current projection of a non-replay active or
        // completed run can satisfy an eligibility flag. Abandoned runs and
        // discarded checkpoint branches are intentionally excluded.
        const storyRows = storyFlags.length === 0 ? [] : (await this.client.query(`
            SELECT flag.flag_key, flag.flag_value, run.id AS run_id
            FROM story_flags flag
            JOIN story_runs run ON run.id = flag.run_id
            WHERE run.user_id = $1
              AND run.replay_mode = FALSE
              AND run.status IN ('active', 'completed')
              AND flag.flag_key = ANY($2::TEXT[])
            ORDER BY flag.flag_key, run.id
        `, [userId, storyFlags])).rows;

        const storyValues = Object.create(null);
        for (const row of storyRows) {
            if (!Object.hasOwn(storyValues, row.flag_key)) {
                storyValues[row.flag_key] = row.flag_value;
                continue;
            }
            if (stableStringify(storyValues[row.flag_key]) !== stableStringify(row.flag_value)) {
                throw new Error(`Quest eligibility story flag has conflicting authoritative values: ${row.flag_key}`);
            }
        }

        const collectionRows = collectionItems.length === 0 ? [] : (await this.client.query(`
            SELECT holding.item_key
            FROM streamer_collection_holdings holding
            WHERE holding.user_id = $1
              AND holding.item_key = ANY($2::TEXT[])
        `, [userId, collectionItems])).rows;

        return Object.freeze({
            achievements: Object.freeze(achievementRows.map((row) => row.slug).sort()),
            storyFlags: Object.freeze({ ...storyValues }),
            collectionItems: Object.freeze(collectionRows.map((row) => row.item_key).sort())
        });
    }

    async listAssignments(userId, { limit = 100, offset = 0 } = {}) {
        const result = await this.client.query(`
            SELECT assignment.id, assignment.assignment_key, assignment.status,
                   assignment.revision, assignment.occurrence, assignment.reward_points,
                   assignment.assignment_source, assignment.offered_at, assignment.accepted_at,
                   assignment.submitted_at, assignment.completed_at, assignment.resolved_at,
                   assignment.due_at, assignment.postpone_until,
                   assignment.postponed_hours, assignment.last_postponed_at,
                   assignment.expired_at, assignment.rejected_at,
                   definition.slug, version.version, version.category, version.difficulty,
                   version.estimated_minutes, version.title_zh, version.title_en,
                   version.description_zh, version.description_en,
                   version.hint_zh, version.hint_en, version.completion_zh, version.completion_en,
                   version.verification_mode, version.review_policy,
                   version.postpone_policy, version.expiry_behavior,
                   settlement.status AS settlement_status
            FROM quest_v2_assignments assignment
            JOIN quest_v2_versions version ON version.id = assignment.version_id
            JOIN quest_v2_definitions definition ON definition.id = version.definition_id
            LEFT JOIN quest_v2_reward_settlements settlement ON settlement.assignment_id = assignment.id
            WHERE assignment.user_id = $1
            ORDER BY
                CASE assignment.status
                    WHEN 'active' THEN 0 WHEN 'returned' THEN 1 WHEN 'submitted' THEN 2
                    WHEN 'under_review' THEN 3 WHEN 'offered' THEN 4 ELSE 5 END,
                assignment.offered_at DESC, assignment.id DESC
            LIMIT $2 OFFSET $3
        `, [userId, limit, offset]);
        return result.rows;
    }

    async listAssignmentSteps(userId, assignmentIds) {
        if (assignmentIds.length === 0) return [];
        const result = await this.client.query(`
            SELECT assignment.id AS assignment_id, step.id AS step_id, step.step_key,
                   step.ordinal, step.title_zh, step.title_en,
                   step.instructions_zh, step.instructions_en, step.evidence_kind,
                   step.parallel_group, step.depends_on_keys, step.required,
                   state.status, state.progress, state.revision,
                   evidence.id AS latest_evidence_id, evidence.evidence_kind AS submitted_kind,
                   evidence.submitted_at, evidence.sha256,
                   review.decision AS latest_review_decision, review.note AS latest_review_note
            FROM quest_v2_assignments assignment
            JOIN quest_v2_step_definitions step ON step.version_id = assignment.version_id
            LEFT JOIN quest_v2_assignment_steps state
              ON state.assignment_id = assignment.id AND state.step_definition_id = step.id
            LEFT JOIN LATERAL (
                SELECT id, evidence_kind, submitted_at, sha256
                FROM quest_v2_evidence
                WHERE assignment_id = assignment.id AND step_definition_id = step.id
                ORDER BY submitted_at DESC, id DESC LIMIT 1
            ) evidence ON TRUE
            LEFT JOIN LATERAL (
                SELECT decision, note
                FROM quest_v2_evidence_reviews
                WHERE evidence_id = evidence.id
                ORDER BY reviewed_at DESC, id DESC LIMIT 1
            ) review ON TRUE
            WHERE assignment.user_id = $1 AND assignment.id = ANY($2::BIGINT[])
            ORDER BY assignment.id, step.ordinal
        `, [userId, assignmentIds]);
        return result.rows;
    }

    async listAppeals(userId) {
        const result = await this.client.query(`
            SELECT appeal.id,appeal.assignment_id,appeal.status,appeal.reason,
                   appeal.decision,appeal.resolution_note,appeal.submitted_at,appeal.resolved_at,
                   definition.slug,version.title_zh,version.title_en
            FROM quest_v2_appeals appeal
            JOIN quest_v2_assignments assignment ON assignment.id=appeal.assignment_id
            JOIN quest_v2_versions version ON version.id=assignment.version_id
            JOIN quest_v2_definitions definition ON definition.id=version.definition_id
            WHERE appeal.user_id=$1
            ORDER BY appeal.submitted_at DESC,appeal.id
            LIMIT 100
        `, [userId]);
        return result.rows;
    }

    async lockAssignment(userId, assignmentId) {
        const result = await this.client.query(`
            SELECT assignment.*,
                   (assignment.due_at IS NOT NULL
                    AND assignment.due_at <= clock_timestamp()) AS overdue,
                   definition.slug, version.category, version.verification_mode,
                   version.review_policy, version.cooldown_hours, version.decline_behavior,
                   version.postpone_policy, version.expiry_behavior, version.unlock_hooks,
                   version.completion_zh, version.completion_en
            FROM quest_v2_assignments assignment
            JOIN quest_v2_versions version ON version.id = assignment.version_id
            JOIN quest_v2_definitions definition ON definition.id = version.definition_id
            WHERE assignment.id = $1 AND assignment.user_id = $2
            FOR UPDATE OF assignment
        `, [assignmentId, userId]);
        return result.rows[0] || null;
    }

    async transitionAssignment(assignmentId, expectedRevision, fromStatuses, toStatus, extra = {}) {
        const result = await this.client.query(`
            UPDATE quest_v2_assignments
            SET status = $4::VARCHAR(20),
                revision = revision + 1,
                accepted_at = CASE WHEN $4::VARCHAR(20) = 'accepted' THEN NOW() ELSE accepted_at END,
                submitted_at = CASE WHEN $4::VARCHAR(20) = 'submitted' THEN NOW() ELSE submitted_at END,
                completed_at = CASE WHEN $4::VARCHAR(20) = 'completed' THEN NOW() ELSE completed_at END,
                resolved_at = CASE WHEN $4::VARCHAR(20) IN (
                    'completed', 'declined', 'rejected', 'expired', 'cancelled'
                ) THEN NOW() ELSE resolved_at END,
                expired_at = CASE WHEN $4::VARCHAR(20) = 'expired' THEN NOW() ELSE expired_at END,
                rejected_at = CASE WHEN $4::VARCHAR(20) = 'rejected' THEN NOW() ELSE rejected_at END,
                postpone_until = COALESCE($5::TIMESTAMPTZ, postpone_until),
                updated_at = NOW()
            WHERE id = $1 AND revision = $2 AND status = ANY($3::TEXT[])
            RETURNING *
        `, [assignmentId, expectedRevision, fromStatuses, toStatus, extra.postponeUntil || null]);
        return result.rows[0] || null;
    }

    async initializeSteps(assignmentId, versionId) {
        await this.client.query(`
            INSERT INTO quest_v2_assignment_steps (assignment_id, step_definition_id, status)
            SELECT $1, step.id,
                   CASE WHEN cardinality(step.depends_on_keys) = 0 THEN 'active' ELSE 'locked' END
            FROM quest_v2_step_definitions step
            WHERE step.version_id = $2
            ON CONFLICT (assignment_id, step_definition_id) DO NOTHING
        `, [assignmentId, versionId]);
    }

    async insertAssignmentEvent(event) {
        const inserted = await this.client.query(`
            INSERT INTO quest_v2_assignment_events (
                event_id, assignment_id, actor_type, actor_username, event_type,
                from_status, to_status, dedupe_key, payload, request_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::JSONB, $10)
            ON CONFLICT (assignment_id, dedupe_key) DO NOTHING
            RETURNING id
        `, [
            event.eventId, event.assignmentId, event.actorType, event.actorUsername,
            event.eventType, event.fromStatus || null, event.toStatus || null,
            event.dedupeKey, JSON.stringify(event.payload || {}), event.requestId || null
        ]);
        if (inserted.rowCount === 1) return true;
        const existing = await this.client.query(`
            SELECT actor_type, actor_username, event_type, from_status, to_status, payload
            FROM quest_v2_assignment_events
            WHERE assignment_id = $1 AND dedupe_key = $2
        `, [event.assignmentId, event.dedupeKey]);
        const row = existing.rows[0];
        const matches = row
            && row.actor_type === event.actorType
            && row.actor_username === (event.actorUsername || null)
            && row.event_type === event.eventType
            && row.from_status === (event.fromStatus || null)
            && row.to_status === (event.toStatus || null)
            && stableStringify(row.payload) === stableStringify(event.payload || {});
        if (!matches) throw new Error('Quest assignment event identity collision');
        return { replay: true, row };
    }

    async lockEvidenceStep(userId, assignmentId, stepId) {
        const result = await this.client.query(`
            SELECT assignment.id AS assignment_id, assignment.status AS assignment_status,
                   assignment.revision AS assignment_revision, assignment.user_id,
                   assignment.due_at, assignment.postponed_hours,
                   (assignment.due_at IS NOT NULL
                    AND assignment.due_at <= clock_timestamp()) AS overdue,
                   step.id AS step_id, step.evidence_kind, step.required,
                   state.status AS step_status, state.revision AS step_revision
            FROM quest_v2_assignments assignment
            JOIN quest_v2_step_definitions step
              ON step.version_id = assignment.version_id AND step.id = $3
            JOIN quest_v2_assignment_steps state
              ON state.assignment_id = assignment.id AND state.step_definition_id = step.id
            WHERE assignment.id = $2 AND assignment.user_id = $1
            FOR UPDATE OF assignment, state
        `, [userId, assignmentId, stepId]);
        return result.rows[0] || null;
    }

    async insertEvidence(evidence) {
        const result = await this.client.query(`
            INSERT INTO quest_v2_evidence (
                id, assignment_id, step_definition_id, submitted_by_user_id,
                evidence_kind, content, content_sha256, media_bytes, media_type, byte_count,
                width, height, sha256, retention_until
            ) VALUES ($1, $2, $3, $4, $5, $6::JSONB, $7, $8, $9, $10, $11, $12, $13, $14)
            ON CONFLICT (id) DO NOTHING
            RETURNING id
        `, [
            evidence.id, evidence.assignmentId, evidence.stepId, evidence.userId,
            evidence.kind, JSON.stringify(evidence.content), evidence.contentSha256,
            evidence.media?.buffer || null,
            evidence.media?.mediaType || null, evidence.media?.byteCount || null,
            evidence.media?.width || null, evidence.media?.height || null,
            evidence.media?.sha256 || null, evidence.retentionUntil
        ]);
        return result.rows[0] || null;
    }

    async evidenceQuota(userId, assignmentId, stepId) {
        const result = await this.client.query(`
            SELECT COALESCE(SUM(COALESCE(byte_count, octet_length(content::TEXT)))
                       FILTER (WHERE redacted_at IS NULL), 0) AS retained_bytes,
                   COUNT(*) FILTER (WHERE submitted_at >= NOW() - INTERVAL '24 hours') AS recent_count,
                   COUNT(*) FILTER (WHERE assignment_id = $2 AND step_definition_id = $3) AS step_versions
            FROM quest_v2_evidence WHERE submitted_by_user_id = $1
        `, [userId, assignmentId, stepId]);
        return {
            retainedBytes: Number(result.rows[0]?.retained_bytes || 0),
            recentCount: Number(result.rows[0]?.recent_count || 0),
            stepVersions: Number(result.rows[0]?.step_versions || 0)
        };
    }

    async markStepSubmitted(assignmentId, stepId, expectedRevision, evidenceId) {
        const result = await this.client.query(`
            UPDATE quest_v2_assignment_steps
            SET status = 'submitted', progress = jsonb_build_object('evidenceId', $4::TEXT),
                revision = revision + 1, updated_at = NOW()
            WHERE assignment_id = $1 AND step_definition_id = $2
              AND revision = $3 AND status IN ('active', 'returned')
            RETURNING revision
        `, [assignmentId, stepId, expectedRevision, evidenceId]);
        return result.rowCount === 1;
    }

    async assignmentSubmissionReadiness(assignmentId) {
        const result = await this.client.query(`
            SELECT COUNT(*) FILTER (WHERE step.required) AS required_count,
                   COUNT(*) FILTER (WHERE step.required AND state.status IN ('submitted', 'completed')) AS ready_count,
                   COUNT(*) FILTER (WHERE step.required AND state.status = 'submitted') AS submitted_count,
                   COUNT(*) FILTER (WHERE step.required
                     AND step.evidence_kind <> 'trusted_event'
                     AND state.status IN ('active', 'returned')) AS pending_reviewable_count
            FROM quest_v2_step_definitions step
            JOIN quest_v2_assignments assignment ON assignment.version_id = step.version_id AND assignment.id = $1
            JOIN quest_v2_assignment_steps state
              ON state.assignment_id = assignment.id AND state.step_definition_id = step.id
        `, [assignmentId]);
        return {
            required: Number(result.rows[0]?.required_count || 0),
            ready: Number(result.rows[0]?.ready_count || 0),
            submitted: Number(result.rows[0]?.submitted_count || 0),
            pendingReviewable: Number(result.rows[0]?.pending_reviewable_count || 0)
        };
    }

    async assignmentCompletionReadiness(assignmentId) {
        const result = await this.client.query(`
            SELECT COUNT(*) FILTER (WHERE step.required) AS required_count,
                   COUNT(*) FILTER (WHERE step.required AND state.status = 'completed') AS completed_count
            FROM quest_v2_step_definitions step
            JOIN quest_v2_assignments assignment ON assignment.version_id = step.version_id AND assignment.id = $1
            JOIN quest_v2_assignment_steps state
              ON state.assignment_id = assignment.id AND state.step_definition_id = step.id
        `, [assignmentId]);
        return Number(result.rows[0]?.required_count || 0) > 0
            && Number(result.rows[0]?.required_count) === Number(result.rows[0]?.completed_count);
    }

    async lockLatestEvidence(assignmentId) {
        const result = await this.client.query(`
            SELECT evidence.id, evidence.evidence_kind, evidence.content, evidence.sha256,
                   evidence.byte_count, evidence.width, evidence.height, evidence.submitted_at,
                   step.id AS step_id, step.step_key, step.required
            FROM quest_v2_assignments assignment
            JOIN quest_v2_step_definitions step ON step.version_id = assignment.version_id
            JOIN quest_v2_assignment_steps state
              ON state.assignment_id = assignment.id
             AND state.step_definition_id = step.id
            JOIN LATERAL (
                SELECT candidate.* FROM quest_v2_evidence candidate
                WHERE candidate.assignment_id = assignment.id
                  AND candidate.step_definition_id = step.id
                ORDER BY candidate.submitted_at DESC, candidate.id DESC
                LIMIT 1 FOR UPDATE
            ) evidence ON TRUE
            WHERE assignment.id = $1 AND state.status = 'submitted'
            ORDER BY step.ordinal
        `, [assignmentId]);
        return result.rows;
    }

    async insertEvidenceReview(review) {
        await this.client.query(`
            INSERT INTO quest_v2_evidence_reviews (
                evidence_id, assignment_id, reviewer_username, decision, note, request_id
            ) VALUES ($1, $2, $3, $4, $5, $6)
        `, [review.evidenceId, review.assignmentId, review.reviewerUsername,
            review.decision, review.note, review.requestId || null]);
    }

    async markStepsReviewed(assignmentId, decision) {
        const result = await this.client.query(`
            UPDATE quest_v2_assignment_steps state
            SET status = CASE $2::VARCHAR(20)
                    WHEN 'approved' THEN 'completed'
                    WHEN 'returned' THEN 'returned'
                    ELSE 'rejected'
                END,
                revision = state.revision + 1,
                completed_at = CASE WHEN $2::VARCHAR(20) = 'approved' THEN NOW() ELSE NULL END,
                updated_at = NOW()
            FROM quest_v2_step_definitions step
            WHERE state.assignment_id = $1
              AND state.step_definition_id = step.id
              AND state.status = 'submitted'
            RETURNING state.step_definition_id, step.step_key
        `, [assignmentId, decision]);
        return result.rows;
    }

    async unlockEligibleSteps(assignmentId) {
        const result = await this.client.query(`
            UPDATE quest_v2_assignment_steps state
            SET status = 'active', revision = state.revision + 1, updated_at = NOW()
            FROM quest_v2_step_definitions step
            WHERE state.assignment_id = $1
              AND state.step_definition_id = step.id
              AND state.status = 'locked'
              AND NOT EXISTS (
                  SELECT 1
                  FROM unnest(step.depends_on_keys) dependency(step_key)
                  LEFT JOIN quest_v2_step_definitions prerequisite
                    ON prerequisite.version_id = step.version_id
                   AND prerequisite.step_key = dependency.step_key
                  LEFT JOIN quest_v2_assignment_steps prerequisite_state
                    ON prerequisite_state.assignment_id = state.assignment_id
                   AND prerequisite_state.step_definition_id = prerequisite.id
                  WHERE prerequisite.id IS NULL
                     OR prerequisite_state.status IS DISTINCT FROM 'completed'
              )
            RETURNING state.step_definition_id, step.step_key
        `, [assignmentId]);
        return result.rows;
    }

    async insertSettlement(settlement) {
        const status = settlement.rewardPoints === 0 ? 'zero_value' : 'pending';
        const result = await this.client.query(`
            INSERT INTO quest_v2_reward_settlements (
                settlement_key, assignment_id, user_id, reward_policy_version,
                reward_points, operation_type, status, posted_at
            ) VALUES ($1, $2, $3, $4, $5, 'quest_auto_reward', $6::VARCHAR(20),
                      CASE WHEN $6::VARCHAR(20) = 'zero_value' THEN NOW() ELSE NULL END)
            ON CONFLICT (assignment_id) DO NOTHING
            RETURNING settlement_key, status
        `, [settlement.key, settlement.assignmentId, settlement.userId,
            settlement.rewardPolicyVersion, settlement.rewardPoints, status]);
        return result.rows[0] || null;
    }

    async markSettlementPosted(key, balanceBefore, balanceAfter) {
        const result = await this.client.query(`
            UPDATE quest_v2_reward_settlements
            SET status = 'posted', balance_before = $2, balance_after = $3, posted_at = NOW()
            WHERE settlement_key = $1 AND status = 'pending'
            RETURNING settlement_key
        `, [key, balanceBefore, balanceAfter]);
        return result.rowCount === 1;
    }

    async insertAudit(entry) {
        await this.client.query(`
            INSERT INTO quest_v2_audit_log (
                assignment_id, actor_type, actor_username, action, details, request_id
            ) VALUES ($1, $2, $3, $4, $5::JSONB, $6)
        `, [entry.assignmentId || null, entry.actorType, entry.actorUsername || null,
            entry.action, JSON.stringify(entry.details || {}), entry.requestId || null]);
    }

    async insertTrustedEvent(event) {
        const result = await this.client.query(`
            INSERT INTO quest_v2_trusted_events (
                event_id, source_type, dedupe_key, event_type, schema_version,
                actor_user_id, subject_user_id, occurred_at, correlation_id, payload
            ) VALUES ($1, $2, $3, $4, 1, $5, $6, $7, $8, $9::JSONB)
            ON CONFLICT (source_type, dedupe_key) DO NOTHING
            RETURNING id
        `, [event.eventId, event.sourceType, event.dedupeKey, event.eventType,
            event.actorUserId, event.subjectUserId, event.occurredAt,
            event.correlationId, JSON.stringify(event.payload)]);
        return result.rows[0] || null;
    }

    async loadTrustedEvent(sourceType, dedupeKey) {
        const result = await this.client.query(`
            SELECT * FROM quest_v2_trusted_events
            WHERE source_type = $1 AND dedupe_key = $2
        `, [sourceType, dedupeKey]);
        return result.rows[0] || null;
    }

    async listTrustedCandidates(userId) {
        const result = await this.client.query(`
            SELECT assignment.id, assignment.status, assignment.revision,
                   assignment.user_id, assignment.version_id, assignment.accepted_at,
                   assignment.due_at, assignment.completed_at, assignment.resolved_at,
                   assignment.board_id, assignment.chain_id,
                   assignment.reward_policy_version, assignment.reward_points,
                   assignment.completion_rule, definition.slug, version.version,
                   version.verification_mode, version.category, version.allow_event_reuse,
                   CASE WHEN chain_node.node_number IS NULL THEN ''
                        ELSE chain.slug || ':' || chain_node.node_number::TEXT END AS chain_node_key
            FROM quest_v2_assignments assignment
            JOIN quest_v2_versions version ON version.id = assignment.version_id
            JOIN quest_v2_definitions definition ON definition.id = version.definition_id
            LEFT JOIN quest_v2_chains chain ON chain.id = assignment.chain_id
            LEFT JOIN quest_v2_chain_nodes chain_node
              ON chain_node.chain_id = assignment.chain_id
             AND chain_node.version_id = assignment.version_id
            WHERE assignment.user_id = $1 AND assignment.status = 'active'
              AND version.verification_mode IN ('automatic', 'hybrid')
            ORDER BY assignment.id
            FOR UPDATE OF assignment
        `, [userId]);
        return result.rows;
    }

    async readAssignmentSubjectId(assignmentId) {
        const result = await this.client.query(
            'SELECT user_id FROM quest_v2_assignments WHERE id=$1',
            [assignmentId]
        );
        const userId = Number(result.rows[0]?.user_id);
        return Number.isSafeInteger(userId) && userId > 0 ? userId : null;
    }

    async readAppealSubjectId(appealId) {
        const result = await this.client.query(
            'SELECT user_id FROM quest_v2_appeals WHERE id=$1',
            [appealId]
        );
        const userId = Number(result.rows[0]?.user_id);
        return Number.isSafeInteger(userId) && userId > 0 ? userId : null;
    }

    async lockReviewerAndSubject(reviewerUsername, subjectUserId) {
        const result = await this.client.query(`
            SELECT id,username,is_admin
            FROM users
            WHERE (username=$1 OR id=$2)
              AND authorized=TRUE AND deactivated=FALSE
              AND COALESCE(account_locked,FALSE)=FALSE
            ORDER BY id
            FOR UPDATE
        `, [reviewerUsername, subjectUserId]);
        return {
            reviewer: result.rows.find((row) => row.username === reviewerUsername) || null,
            subject: result.rows.find((row) => Number(row.id) === Number(subjectUserId)) || null
        };
    }

    async lockAssignmentForReview(assignmentId) {
        const result = await this.client.query(`
            SELECT assignment.*, account.username, definition.slug,
                   version.review_policy, version.verification_mode,
                   version.completion_zh, version.completion_en, version.category,
                   version.safety_class,
                   CASE WHEN chain_node.node_number IS NULL THEN ''
                        ELSE chain.slug || ':' || chain_node.node_number::TEXT END AS chain_node_key
            FROM quest_v2_assignments assignment
            JOIN users account ON account.id = assignment.user_id
              AND account.authorized=TRUE AND account.deactivated=FALSE
              AND COALESCE(account.account_locked,FALSE)=FALSE
            JOIN quest_v2_versions version ON version.id = assignment.version_id
            JOIN quest_v2_definitions definition ON definition.id = version.definition_id
            LEFT JOIN quest_v2_chains chain ON chain.id = assignment.chain_id
            LEFT JOIN quest_v2_chain_nodes chain_node
              ON chain_node.chain_id = assignment.chain_id
             AND chain_node.version_id = assignment.version_id
            WHERE assignment.id = $1
            FOR UPDATE OF assignment
        `, [assignmentId]);
        return result.rows[0] || null;
    }

    async lockReviewer(username) {
        const result = await this.client.query(`
            SELECT id, username, is_admin
            FROM users
            WHERE username = $1 AND is_admin = TRUE AND authorized = TRUE
              AND deactivated = FALSE AND COALESCE(account_locked, FALSE) = FALSE
            FOR SHARE
        `, [username]);
        return result.rows[0] || null;
    }

    async recordChainCompletion({ id, userId, chainId, assignmentId, sourceEventId }) {
        const result = await this.client.query(`
            WITH chain_state AS (
                SELECT chain.id,chain.slug,COUNT(*) AS total_nodes,
                       COUNT(*) FILTER (WHERE EXISTS(
                           SELECT 1 FROM quest_v2_assignments completed
                           WHERE completed.user_id=$2
                             AND completed.chain_id=chain.id
                             AND completed.version_id=node.version_id
                             AND completed.status='completed'
                       )) AS completed_nodes
                FROM quest_v2_chains chain
                JOIN quest_v2_chain_nodes node ON node.chain_id=chain.id
                WHERE chain.id=$3
                  AND EXISTS(
                      SELECT 1 FROM quest_v2_assignments trigger_assignment
                      WHERE trigger_assignment.id=$4 AND trigger_assignment.user_id=$2
                        AND trigger_assignment.chain_id=chain.id
                        AND trigger_assignment.status='completed'
                  )
                GROUP BY chain.id,chain.slug
            ), inserted AS (
                INSERT INTO quest_v2_chain_completions(
                    id,user_id,chain_id,trigger_assignment_id,source_event_id
                )
                SELECT $1,$2,state.id,$4,$5 FROM chain_state state
                WHERE state.total_nodes>0 AND state.completed_nodes=state.total_nodes
                ON CONFLICT(user_id,chain_id) DO NOTHING
                RETURNING *
            )
            SELECT inserted.*,chain_state.slug AS chain_slug
            FROM inserted JOIN chain_state ON chain_state.id=inserted.chain_id
        `, [id, userId, chainId, assignmentId, sourceEventId]);
        return result.rows[0] || null;
    }

    async findAppealForAssignment(userId, assignmentId) {
        return (await this.client.query(`SELECT * FROM quest_v2_appeals
            WHERE user_id=$1 AND assignment_id=$2 FOR UPDATE`, [userId, assignmentId])).rows[0] || null;
    }

    async insertAppeal(appeal) {
        return (await this.client.query(`INSERT INTO quest_v2_appeals(
            id,assignment_id,user_id,command_id,semantic_hash,reason
        ) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`, [appeal.id, appeal.assignmentId,
            appeal.userId, appeal.commandId, appeal.semanticHash, appeal.reason])).rows[0] || null;
    }

    async lockAppeal(appealId) {
        return (await this.client.query(`SELECT appeal.*,account.username
            FROM quest_v2_appeals appeal
            JOIN users account ON account.id=appeal.user_id
              AND account.authorized=TRUE AND account.deactivated=FALSE
              AND COALESCE(account.account_locked,FALSE)=FALSE
            WHERE appeal.id=$1 FOR UPDATE OF appeal`, [appealId])).rows[0] || null;
    }

    async resolveAppeal(appealId, reviewerUserId, resolution) {
        return (await this.client.query(`UPDATE quest_v2_appeals
            SET status='resolved',decision=$2,resolution_note=$3,resolved_by_user_id=$4,
                resolution_command_id=$5,resolution_semantic_hash=$6,resolved_at=NOW()
            WHERE id=$1 AND status='pending' RETURNING *`, [appealId, resolution.decision,
            resolution.note, reviewerUserId, resolution.commandId,
            resolution.semanticHash])).rows[0] || null;
    }

    async listPendingAppeals(limit = 100) {
        const result = await this.client.query(`SELECT appeal.id,appeal.assignment_id,
                   appeal.reason,appeal.submitted_at,account.username,
                   definition.slug,version.title_zh,version.title_en
            FROM quest_v2_appeals appeal
            JOIN users account ON account.id=appeal.user_id
            JOIN quest_v2_assignments assignment ON assignment.id=appeal.assignment_id
            JOIN quest_v2_versions version ON version.id=assignment.version_id
            JOIN quest_v2_definitions definition ON definition.id=version.definition_id
            WHERE appeal.status='pending'
            ORDER BY appeal.submitted_at,appeal.id LIMIT $1`, [limit]);
        return result.rows;
    }

    async listReviewQueue(limit = 100) {
        const result = await this.client.query(`
            SELECT assignment.id, assignment.revision, account.username,
                   version.title_zh, version.title_en, version.reward_points,
                   version.review_policy, version.safety_class,
                   evidence.id AS evidence_id, evidence.evidence_kind,
                   evidence.content, evidence.content_sha256, evidence.sha256,
                   evidence.byte_count, evidence.width, evidence.height,
                   evidence.redacted_at, step.step_key
            FROM quest_v2_assignments assignment
            JOIN users account ON account.id = assignment.user_id
            JOIN quest_v2_versions version ON version.id = assignment.version_id
            JOIN quest_v2_step_definitions step ON step.version_id = version.id AND step.required = TRUE
            JOIN quest_v2_assignment_steps state
              ON state.assignment_id = assignment.id
             AND state.step_definition_id = step.id
            JOIN LATERAL (
                SELECT id, evidence_kind, content, content_sha256, sha256,
                       byte_count, width, height, redacted_at
                FROM quest_v2_evidence
                WHERE assignment_id = assignment.id AND step_definition_id = step.id
                ORDER BY submitted_at DESC, id DESC LIMIT 1
            ) evidence ON TRUE
            WHERE assignment.status = 'under_review' AND state.status = 'submitted'
              AND version.review_policy IN ('owner', 'admin')
            ORDER BY assignment.submitted_at, assignment.id, step.ordinal
            LIMIT $1
        `, [limit]);
        return result.rows;
    }

    async postponeAssignment(assignmentId, expectedRevision, hours, maximumHours) {
        const result = await this.client.query(`
            UPDATE quest_v2_assignments
            SET due_at = due_at + make_interval(hours => $3),
                postpone_until = due_at + make_interval(hours => $3),
                postponed_hours = postponed_hours + $3,
                last_postponed_at = NOW(),
                revision = revision + 1, updated_at = NOW()
            WHERE id = $1 AND revision = $2
              AND status IN ('offered', 'active', 'returned')
              AND due_at IS NOT NULL AND due_at > clock_timestamp()
              AND postponed_hours + $3 <= $4
            RETURNING *
        `, [assignmentId, expectedRevision, hours, maximumHours]);
        return result.rows[0] || null;
    }

    async lockDueAssignments(limit = 100) {
        const result = await this.client.query(`
            SELECT id, revision, status, due_at, user_id, version_id, occurrence
            FROM quest_v2_assignments
            WHERE status IN ('offered', 'accepted', 'active', 'returned')
              AND due_at IS NOT NULL AND due_at <= clock_timestamp()
            ORDER BY due_at, id
            LIMIT $1
            FOR UPDATE SKIP LOCKED
        `, [limit]);
        return result.rows;
    }

    async expireAssignment(assignmentId, expectedRevision) {
        const result = await this.client.query(`
            UPDATE quest_v2_assignments
            SET status = 'expired', revision = revision + 1,
                expired_at = NOW(), resolved_at = NOW(), updated_at = NOW()
            WHERE id = $1 AND revision = $2
              AND status IN ('offered', 'accepted', 'active', 'returned')
              AND due_at IS NOT NULL AND due_at <= clock_timestamp()
            RETURNING *
        `, [assignmentId, expectedRevision]);
        return result.rows[0] || null;
    }

    async listTrustedHistory(userId, since) {
        const result = await this.client.query(`
            SELECT event_type, occurred_at, payload
            FROM quest_v2_trusted_events
            WHERE subject_user_id = $1 AND occurred_at >= $2
              AND processing_status IN ('recorded', 'processed')
            ORDER BY occurred_at, id
            LIMIT 10000
        `, [userId, since]);
        return result.rows.map((row) => ({
            eventType: row.event_type,
            occurredAt: new Date(row.occurred_at).toISOString(),
            payload: row.payload
        }));
    }

    async listAssignmentTrustedHistory(assignmentId) {
        const result = await this.client.query(`
            SELECT event.id AS trusted_event_id, event.event_type,
                   event.occurred_at, event.payload
            FROM quest_v2_assignments assignment
            JOIN quest_v2_versions version ON version.id = assignment.version_id
            JOIN quest_v2_trusted_events event
              ON event.subject_user_id = assignment.user_id
             AND event.occurred_at >= assignment.accepted_at
             AND event.occurred_at <= clock_timestamp()
             AND (assignment.due_at IS NULL OR event.occurred_at <= assignment.due_at)
             AND (assignment.completed_at IS NULL OR event.occurred_at < assignment.completed_at)
             AND (assignment.resolved_at IS NULL OR event.occurred_at < assignment.resolved_at)
            WHERE assignment.id = $1
              AND assignment.status = 'active'
              AND assignment.accepted_at IS NOT NULL
              AND (
                  version.allow_event_reuse = TRUE
                  OR NOT EXISTS (
                      SELECT 1
                      FROM quest_v2_assignment_event_consumptions prior
                      WHERE prior.user_id = assignment.user_id
                        AND prior.version_id = assignment.version_id
                        AND prior.trusted_event_id = event.id
                        AND prior.assignment_id <> assignment.id
                  )
              )
            ORDER BY event.occurred_at, event.id
            LIMIT 10000
        `, [assignmentId]);
        return result.rows.map((row) => ({
            trustedEventId: Number(row.trusted_event_id),
            eventType: row.event_type,
            occurredAt: new Date(row.occurred_at).toISOString(),
            payload: row.payload
        }));
    }

    async consumeTrustedEvents(assignmentId, trustedEventIds) {
        if (!Array.isArray(trustedEventIds) || trustedEventIds.length === 0) return [];
        const result = await this.client.query(`
            WITH inserted AS (
                INSERT INTO quest_v2_assignment_event_consumptions (
                    assignment_id, trusted_event_id, user_id, version_id,
                    occurrence, allow_event_reuse
                )
                SELECT assignment.id, event.id, assignment.user_id,
                       assignment.version_id, assignment.occurrence,
                       version.allow_event_reuse
                FROM quest_v2_assignments assignment
                JOIN quest_v2_versions version ON version.id = assignment.version_id
                JOIN quest_v2_trusted_events event
                  ON event.id = ANY($2::BIGINT[])
                 AND event.subject_user_id = assignment.user_id
                 AND event.occurred_at >= assignment.accepted_at
                 AND event.occurred_at <= clock_timestamp()
                 AND (assignment.due_at IS NULL OR event.occurred_at <= assignment.due_at)
                 AND (assignment.completed_at IS NULL OR event.occurred_at < assignment.completed_at)
                 AND (assignment.resolved_at IS NULL OR event.occurred_at < assignment.resolved_at)
                WHERE assignment.id = $1 AND assignment.status = 'active'
                  AND assignment.accepted_at IS NOT NULL
                ON CONFLICT DO NOTHING
                RETURNING trusted_event_id
            )
            SELECT trusted_event_id FROM inserted
            UNION
            SELECT trusted_event_id
            FROM quest_v2_assignment_event_consumptions
            WHERE assignment_id = $1 AND trusted_event_id = ANY($2::BIGINT[])
        `, [assignmentId, trustedEventIds]);
        return result.rows.map((row) => Number(row.trusted_event_id));
    }

    async listTrustedSteps(assignmentId) {
        const result = await this.client.query(`
            SELECT step.id, step.step_key, step.completion_rule, state.status
            FROM quest_v2_assignment_steps state
            JOIN quest_v2_step_definitions step ON step.id = state.step_definition_id
            WHERE state.assignment_id = $1 AND step.evidence_kind = 'trusted_event'
            ORDER BY step.ordinal
            FOR UPDATE OF state
        `, [assignmentId]);
        return result.rows;
    }

    async markTrustedStepCompleted(assignmentId, stepId, ruleResult) {
        const result = await this.client.query(`
            UPDATE quest_v2_assignment_steps state
            SET status = 'completed', progress = $3::JSONB,
                revision = revision + 1, completed_at = NOW(), updated_at = NOW()
            FROM quest_v2_step_definitions step
            WHERE state.assignment_id = $1 AND state.step_definition_id = $2
              AND state.step_definition_id = step.id
              AND step.evidence_kind = 'trusted_event' AND state.status = 'active'
            RETURNING state.step_definition_id, step.step_key
        `, [assignmentId, stepId, JSON.stringify(ruleResult)]);
        return result.rows[0] || null;
    }

    async finalizeTrustedEvent(id, resultBody) {
        const result = await this.client.query(`
            UPDATE quest_v2_trusted_events
            SET processing_status = $2, result = $3::JSONB, processed_at = NOW()
            WHERE id = $1 AND processing_status = 'recorded'
            RETURNING id
        `, [id, resultBody.matches.length > 0 ? 'processed' : 'ignored', JSON.stringify(resultBody)]);
        if (result.rowCount !== 1) throw new Error('Trusted quest event finalization raced');
    }

    async redactExpiredEvidence(evidenceId) {
        const result = await this.client.query(`
            UPDATE quest_v2_evidence
            SET content = '{}'::JSONB, media_bytes = NULL,
                redacted_at = NOW(), redaction_reason = 'retention_expired'
            WHERE id = $1 AND redacted_at IS NULL
              AND retention_until <= NOW()
            RETURNING id, assignment_id
        `, [evidenceId]);
        return result.rows[0] || null;
    }

    async redactExpiredEvidenceBatch(limit = 100) {
        const result = await this.client.query(`
            WITH due AS (
                SELECT evidence.id,assignment.user_id,account.username
                FROM quest_v2_evidence evidence
                JOIN quest_v2_assignments assignment ON assignment.id=evidence.assignment_id
                JOIN users account ON account.id=assignment.user_id
                WHERE evidence.redacted_at IS NULL AND evidence.retention_until <= NOW()
                ORDER BY evidence.retention_until,evidence.id LIMIT $1
                FOR UPDATE OF evidence SKIP LOCKED
            )
            UPDATE quest_v2_evidence evidence
            SET content = '{}'::JSONB, media_bytes = NULL,
                redacted_at = NOW(), redaction_reason = 'retention_expired'
            FROM due WHERE evidence.id = due.id
            RETURNING evidence.id,evidence.assignment_id,due.user_id,due.username
        `, [limit]);
        return result.rows;
    }

    async loadLegacyCardForImport(userId, taskCardAssignmentId) {
        const result = await this.client.query(`
            SELECT assignment.id, assignment.status, assignment.reward_points,
                   assignment.assigned_at, assignment.resolved_at,
                   template.slug, template.title_zh, template.title_en,
                   template.description_zh, template.description_en
            FROM task_card_assignments assignment
            JOIN task_card_templates template ON template.id = assignment.template_id
            JOIN users account ON account.username = assignment.username
            WHERE assignment.id = $1 AND account.id = $2
            FOR SHARE OF assignment
        `, [taskCardAssignmentId, userId]);
        return result.rows[0] || null;
    }

    async importLegacyCard(userId, card) {
        const mapped = await this.client.query(`
            SELECT quest_assignment_id FROM quest_v2_legacy_imports
            WHERE task_card_assignment_id = $1
        `, [card.id]);
        if (mapped.rows[0]) return { assignmentId: Number(mapped.rows[0].quest_assignment_id), replay: true };

        const slug = `legacy-task-card-${card.id}`;
        const definition = await this.client.query(`
            INSERT INTO quest_v2_definitions (slug, source, created_by)
            VALUES ($1, 'legacy_import', 'legacy_bridge')
            ON CONFLICT (slug) DO NOTHING
            RETURNING id
        `, [slug]);
        let definitionId = definition.rows[0]?.id;
        if (!definitionId) {
            const existing = await this.client.query(
                "SELECT id FROM quest_v2_definitions WHERE slug = $1 AND source = 'legacy_import'",
                [slug]
            );
            definitionId = existing.rows[0]?.id;
        }
        if (!definitionId) throw new Error('Legacy quest definition identity collision');
        const crypto = require('node:crypto');
        const hash = crypto.createHash('sha256').update(JSON.stringify({
            taskCardAssignmentId: Number(card.id), status: card.status,
            rewardPoints: Number(card.reward_points), titleZh: card.title_zh, titleEn: card.title_en
        })).digest('hex');
        const version = await this.client.query(`
            INSERT INTO quest_v2_versions (
                definition_id, version, lifecycle, category, tags, difficulty,
                estimated_minutes, safety_class, title_zh, title_en,
                description_zh, description_en, hint_zh, hint_en,
                completion_zh, completion_en, verification_mode, consent_category,
                eligibility_rule, completion_rule, reward_points, review_policy,
                repeatable, published_at, content_hash
            ) VALUES ($1, 1, 'active', 'creativity', ARRAY['legacy'], 'guided', 15,
                'standard', $2, $3, $4, $5, '历史记录（只读）', 'Historical record (read-only)',
                '已从旧任务卡导入', 'Imported from legacy task cards', 'manual', 'creativity',
                '{"op":"relationship_level","minimum":1}'::JSONB,
                '{"op":"admin_confirmation"}'::JSONB,
                0, 'none', FALSE, NOW(), $6)
            ON CONFLICT (definition_id, version) DO NOTHING
            RETURNING id
        `, [definitionId, card.title_zh, card.title_en, card.description_zh, card.description_en, hash]);
        let versionId = version.rows[0]?.id;
        if (!versionId) {
            const existing = await this.client.query(
                'SELECT id, content_hash FROM quest_v2_versions WHERE definition_id = $1 AND version = 1',
                [definitionId]
            );
            if (existing.rows[0]?.content_hash !== hash) throw new Error('Legacy quest version identity collision');
            versionId = existing.rows[0].id;
        }
        await this.client.query(`
            INSERT INTO quest_v2_step_definitions (
                version_id, step_key, ordinal, title_zh, title_en,
                instructions_zh, instructions_en, evidence_kind, completion_rule
            ) VALUES ($1, 'legacy', 1, $2, $3, $4, $5, 'none',
                '{"op":"admin_confirmation"}'::JSONB)
            ON CONFLICT (version_id, step_key) DO NOTHING
        `, [versionId, card.title_zh, card.title_en, card.description_zh, card.description_en]);
        const terminal = card.status === 'completed' ? 'completed' : 'cancelled';
        const assignment = await this.client.query(`
            INSERT INTO quest_v2_assignments (
                assignment_key, user_id, version_id, status, occurrence,
                reward_policy_version, reward_points, completion_rule,
                assignment_source, completed_at, resolved_at, due_at
            ) VALUES ($1, $2, $3, $4::VARCHAR(20), 1, 1, 0,
                '{"op":"admin_confirmation"}'::JSONB,
                'legacy_import', CASE WHEN $4::VARCHAR(20) = 'completed' THEN NOW() ELSE NULL END,
                NOW(), NOW() + INTERVAL '1 second')
            RETURNING id
        `, [`legacy:${card.id}:history`, userId, versionId, terminal]);
        await this.client.query(`
            INSERT INTO quest_v2_legacy_imports (
                task_card_assignment_id, quest_assignment_id, imported_by_user_id, imported_status
            ) VALUES ($1, $2, $3, $4)
        `, [card.id, assignment.rows[0].id, userId, card.status]);
        return { assignmentId: Number(assignment.rows[0].id), replay: false };
    }
}

module.exports = { QuestV2RuntimeRepository };
