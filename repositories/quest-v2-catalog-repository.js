'use strict';

const crypto = require('node:crypto');
const { stableStringify } = require('../lib/idempotency');

function contentHash(value) {
    return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

class QuestV2CatalogRepository {
    constructor(client) {
        if (!client?.query) throw new TypeError('QuestV2CatalogRepository requires a queryable client');
        this.client = client;
    }

    async seedBuiltInContent({ quests, chains, boards }) {
        await this.client.query(`
            INSERT INTO quest_v2_definitions (slug, source)
            SELECT seed.slug, 'built_in'
            FROM jsonb_to_recordset($1::JSONB) AS seed(slug TEXT)
            ON CONFLICT (slug) DO NOTHING
        `, [JSON.stringify(quests.map(({ slug }) => ({ slug })))]);

        const versions = quests.map((item) => ({
            ...item,
            contentHash: contentHash(item),
            eligibilityRule: item.eligibilityRule,
            completionRule: item.completionRule,
            reviewPolicy: item.verificationMode === 'automatic' ? 'none' : 'owner'
        }));
        await this.client.query(`
            INSERT INTO quest_v2_versions (
                definition_id, version, lifecycle, category, tags, difficulty,
                estimated_minutes, safety_class, title_zh, title_en,
                description_zh, description_en, hint_zh, hint_en,
                completion_zh, completion_en, verification_mode, consent_category,
                eligibility_rule, completion_rule, reward_policy_version,
                reward_points, review_policy, cooldown_hours, repeatable,
                published_at, content_hash
            )
            SELECT definition.id, seed.version, seed.status, seed.category, seed.tags,
                   seed.difficulty, seed.estimated_minutes, seed.safety_class,
                   seed.title_zh, seed.title_en, seed.description_zh, seed.description_en,
                   seed.hint_zh, seed.hint_en, seed.completion_zh, seed.completion_en,
                   seed.verification_mode, seed.consent_category,
                   seed.eligibility_rule, seed.completion_rule, 1,
                   seed.reward_points, seed.review_policy, seed.cooldown_hours,
                   seed.repeatable, NOW(), seed.content_hash
            FROM jsonb_to_recordset($1::JSONB) AS seed(
                slug TEXT, version INTEGER, status TEXT, category TEXT, tags TEXT[],
                difficulty TEXT, estimated_minutes INTEGER, safety_class TEXT,
                title_zh TEXT, title_en TEXT, description_zh TEXT, description_en TEXT,
                hint_zh TEXT, hint_en TEXT, completion_zh TEXT, completion_en TEXT,
                verification_mode TEXT, consent_category TEXT,
                eligibility_rule JSONB, completion_rule JSONB, reward_points INTEGER,
                review_policy TEXT, cooldown_hours INTEGER, repeatable BOOLEAN,
                content_hash TEXT
            )
            JOIN quest_v2_definitions definition ON definition.slug = seed.slug
            ON CONFLICT (definition_id, version) DO NOTHING
        `, [JSON.stringify(versions.map((item) => ({
            slug: item.slug,
            version: item.version,
            status: item.status,
            category: item.category,
            tags: item.tags,
            difficulty: item.difficulty,
            estimated_minutes: item.estimatedMinutes,
            safety_class: item.safetyClass,
            title_zh: item.titleZh,
            title_en: item.titleEn,
            description_zh: item.descriptionZh,
            description_en: item.descriptionEn,
            hint_zh: item.hintZh,
            hint_en: item.hintEn,
            completion_zh: item.completionZh,
            completion_en: item.completionEn,
            verification_mode: item.verificationMode,
            consent_category: item.consentCategory,
            eligibility_rule: item.eligibilityRule,
            completion_rule: item.completionRule,
            reward_points: item.rewardPoints,
            review_policy: item.reviewPolicy,
            cooldown_hours: item.cooldownHours,
            repeatable: item.repeatable,
            content_hash: item.contentHash
        })))]);

        const persisted = await this.client.query(`
            SELECT definition.slug, version.version, version.content_hash
            FROM quest_v2_definitions definition
            JOIN quest_v2_versions version ON version.definition_id = definition.id
            WHERE definition.slug = ANY($1::TEXT[]) AND version.version = 1
        `, [versions.map((item) => item.slug)]);
        const bySlug = new Map(persisted.rows.map((row) => [row.slug, row]));
        for (const item of versions) {
            if (bySlug.get(item.slug)?.content_hash !== item.contentHash) {
                throw new Error(`Built-in quest content identity collision: ${item.slug}`);
            }
        }

        await this.client.query(`
            INSERT INTO quest_v2_step_definitions (
                version_id, step_key, ordinal, title_zh, title_en,
                instructions_zh, instructions_en, evidence_kind, completion_rule
            )
            SELECT version.id, 'complete', 1, version.title_zh, version.title_en,
                   version.description_zh, version.description_en,
                   seed.evidence_kind, version.completion_rule
            FROM jsonb_to_recordset($1::JSONB) AS seed(slug TEXT, evidence_kind TEXT)
            JOIN quest_v2_definitions definition ON definition.slug = seed.slug
            JOIN quest_v2_versions version ON version.definition_id = definition.id AND version.version = 1
            ON CONFLICT (version_id, step_key) DO NOTHING
        `, [JSON.stringify(versions.map((item) => ({ slug: item.slug, evidence_kind: item.evidenceKind })))]);
        const persistedSteps = await this.client.query(`
            SELECT definition.slug, step.evidence_kind, step.completion_rule
            FROM quest_v2_definitions definition
            JOIN quest_v2_versions version ON version.definition_id = definition.id AND version.version = 1
            JOIN quest_v2_step_definitions step ON step.version_id = version.id AND step.step_key = 'complete'
            WHERE definition.slug = ANY($1::TEXT[])
        `, [versions.map((item) => item.slug)]);
        const stepBySlug = new Map(persistedSteps.rows.map((row) => [row.slug, row]));
        for (const item of versions) {
            const row = stepBySlug.get(item.slug);
            if (!row || row.evidence_kind !== item.evidenceKind
                || stableStringify(row.completion_rule) !== stableStringify(item.completionRule)) {
                throw new Error(`Built-in quest step identity collision: ${item.slug}`);
            }
        }

        for (const board of boards) await this.seedBoard(board);
        for (const chain of chains) await this.seedChain(chain);
        for (let index = 0; index < boards.length; index += 1) {
            await this.seedSchedule(boards[index].slug, index);
        }
    }

    async seedBoard(board) {
        const hash = contentHash(board);
        await this.client.query(`
            INSERT INTO quest_v2_boards (slug, title_zh, title_en, lifecycle, content_hash)
            VALUES ($1, $2, $3, 'active', $4)
            ON CONFLICT (slug) DO NOTHING
        `, [board.slug, board.titleZh, board.titleEn, hash]);
        const persisted = await this.client.query(
            'SELECT id, content_hash FROM quest_v2_boards WHERE slug = $1',
            [board.slug]
        );
        if (persisted.rows[0]?.content_hash !== hash) throw new Error(`Built-in board identity collision: ${board.slug}`);
        for (let index = 0; index < board.quests.length; index += 1) {
            await this.client.query(`
                INSERT INTO quest_v2_board_slots (board_id, slot_number, version_id)
                SELECT $1, $2, version.id
                FROM quest_v2_definitions definition
                JOIN quest_v2_versions version ON version.definition_id = definition.id AND version.version = 1
                WHERE definition.slug = $3
                ON CONFLICT (board_id, slot_number) DO NOTHING
            `, [persisted.rows[0].id, index + 1, board.quests[index]]);
        }
        const slots = await this.client.query(`
            SELECT slot.slot_number, definition.slug
            FROM quest_v2_board_slots slot
            JOIN quest_v2_versions version ON version.id = slot.version_id
            JOIN quest_v2_definitions definition ON definition.id = version.definition_id
            WHERE slot.board_id = $1 ORDER BY slot.slot_number
        `, [persisted.rows[0].id]);
        if (stableStringify(slots.rows.map((row) => row.slug)) !== stableStringify(board.quests)) {
            throw new Error(`Built-in board slots identity collision: ${board.slug}`);
        }
    }

    async seedChain(chain) {
        const hash = contentHash(chain);
        await this.client.query(`
            INSERT INTO quest_v2_chains (slug, title_zh, title_en, lifecycle, content_hash)
            VALUES ($1, $2, $3, 'active', $4)
            ON CONFLICT (slug) DO NOTHING
        `, [chain.slug, chain.titleZh, chain.titleEn, hash]);
        const persisted = await this.client.query(
            'SELECT id, content_hash FROM quest_v2_chains WHERE slug = $1',
            [chain.slug]
        );
        if (persisted.rows[0]?.content_hash !== hash) throw new Error(`Built-in chain identity collision: ${chain.slug}`);
        for (let index = 0; index < chain.quests.length; index += 1) {
            await this.client.query(`
                INSERT INTO quest_v2_chain_nodes (chain_id, node_number, version_id, prerequisite_node)
                SELECT $1, $2, version.id, $3
                FROM quest_v2_definitions definition
                JOIN quest_v2_versions version ON version.definition_id = definition.id AND version.version = 1
                WHERE definition.slug = $4
                ON CONFLICT (chain_id, node_number) DO NOTHING
            `, [persisted.rows[0].id, index + 1, index === 0 ? null : index, chain.quests[index]]);
        }
        const nodes = await this.client.query(`
            SELECT node.node_number, node.prerequisite_node, definition.slug
            FROM quest_v2_chain_nodes node
            JOIN quest_v2_versions version ON version.id = node.version_id
            JOIN quest_v2_definitions definition ON definition.id = version.definition_id
            WHERE node.chain_id = $1 ORDER BY node.node_number
        `, [persisted.rows[0].id]);
        const expected = chain.quests.map((slug, index) => ({
            node_number: index + 1, prerequisite_node: index === 0 ? null : index, slug
        }));
        if (stableStringify(nodes.rows.map((row) => ({
            node_number: Number(row.node_number),
            prerequisite_node: row.prerequisite_node == null ? null : Number(row.prerequisite_node),
            slug: row.slug
        }))) !== stableStringify(expected)) {
            throw new Error(`Built-in chain nodes identity collision: ${chain.slug}`);
        }
    }

    async seedSchedule(boardSlug, weekOffset) {
        await this.client.query(`
            INSERT INTO quest_v2_schedules (
                schedule_key, board_id, timezone, starts_at, ends_at, lifecycle
            )
            SELECT $1, board.id, 'UTC',
                   date_trunc('week', NOW()) + make_interval(weeks => $2),
                   date_trunc('week', NOW()) + make_interval(weeks => $2 + 1),
                   CASE WHEN $2 = 0 THEN 'active' ELSE 'scheduled' END
            FROM quest_v2_boards board WHERE board.slug = $3
            ON CONFLICT (schedule_key) DO NOTHING
        `, [`phase-2-week-${String(weekOffset + 1).padStart(2, '0')}`, weekOffset, boardSlug]);
    }

    async lockCreator(username) {
        const accountResult = await this.client.query(`
            SELECT account.id,account.username
            FROM users account
            WHERE account.username = $1 AND account.authorized = TRUE AND account.deactivated = FALSE
              AND COALESCE(account.account_locked,FALSE)=FALSE
            ORDER BY account.id
            FOR NO KEY UPDATE OF account
        `, [username]);
        const account = accountResult.rows[0];
        if (!account) return null;
        const profile = (await this.client.query(`
            SELECT timezone FROM creator_profiles WHERE user_id=$1
        `, [account.id])).rows[0];
        return profile ? { ...account, ...profile } : null;
    }

    async listBlockedCategories(userId) {
        const result = await this.client.query(`
            SELECT preference_key FROM creator_preferences
            WHERE user_id = $1 AND preference_type = 'quest_category'
              AND preference_value = 'block'
        `, [userId]);
        return result.rows.map((row) => row.preference_key);
    }

    async listBoards(userId) {
        const result = await this.client.query(`
            SELECT board.id AS board_id, board.slug AS board_slug,
                   board.title_zh AS board_title_zh, board.title_en AS board_title_en,
                   slot.slot_number, version.id AS version_id, definition.slug,
                   version.category, version.difficulty, version.estimated_minutes,
                   version.title_zh, version.title_en, version.description_zh, version.description_en,
                   version.reward_points, version.verification_mode,
                   assignment.id AS assignment_id, assignment.status AS assignment_status
            FROM creator_profiles profile
            JOIN quest_v2_boards board ON TRUE
            JOIN quest_v2_schedules schedule ON schedule.board_id = board.id
              AND schedule.lifecycle = 'active'
              AND schedule.timezone = profile.timezone
              AND schedule.starts_at <= NOW() AND schedule.ends_at > NOW()
            JOIN quest_v2_board_slots slot ON slot.board_id = board.id
            JOIN quest_v2_versions version ON version.id = slot.version_id
            JOIN quest_v2_definitions definition ON definition.id = version.definition_id
            LEFT JOIN LATERAL (
                SELECT id, status FROM quest_v2_assignments
                WHERE user_id = $1 AND version_id = version.id
                ORDER BY CASE WHEN status IN ('offered','accepted','active','submitted','under_review','returned') THEN 0 ELSE 1 END,
                         occurrence DESC LIMIT 1
            ) assignment ON TRUE
            WHERE profile.user_id = $1
              AND board.lifecycle = 'active' AND version.lifecycle = 'active'
              AND (version.starts_at IS NULL OR version.starts_at <= NOW())
              AND (version.ends_at IS NULL OR version.ends_at > NOW())
            ORDER BY board.id, slot.slot_number
        `, [userId]);
        return result.rows;
    }

    async listChains(userId) {
        const result = await this.client.query(`
            SELECT chain.id AS chain_id, chain.slug AS chain_slug,
                   chain.title_zh AS chain_title_zh, chain.title_en AS chain_title_en,
                   node.node_number, node.prerequisite_node, version.id AS version_id,
                   definition.slug, version.category, version.title_zh, version.title_en,
                   assignment.id AS assignment_id, assignment.status AS assignment_status
            FROM quest_v2_chains chain
            JOIN quest_v2_chain_nodes node ON node.chain_id = chain.id
            JOIN quest_v2_versions version ON version.id = node.version_id
            JOIN quest_v2_definitions definition ON definition.id = version.definition_id
            LEFT JOIN LATERAL (
                SELECT id, status FROM quest_v2_assignments
                WHERE user_id = $1 AND version_id = version.id
                ORDER BY CASE WHEN status IN ('offered','accepted','active','submitted','under_review','returned') THEN 0 ELSE 1 END,
                         occurrence DESC LIMIT 1
            ) assignment ON TRUE
            WHERE chain.lifecycle = 'active'
            ORDER BY chain.id, node.node_number
        `, [userId]);
        return result.rows;
    }

    async offerAssignment({ userId, versionId, boardId = null, chainId = null, source, assignmentKey }) {
        const result = await this.client.query(`
            WITH prior AS (
                SELECT COALESCE(MAX(occurrence), 0) AS last_occurrence,
                       MAX(COALESCE(resolved_at, completed_at)) AS last_resolved,
                       BOOL_OR(status IN ('offered', 'accepted', 'active', 'submitted', 'under_review', 'returned')) AS has_active
                FROM quest_v2_assignments
                WHERE user_id = $2 AND version_id = $3
            )
            INSERT INTO quest_v2_assignments (
                assignment_key, user_id, version_id, board_id, chain_id,
                reward_policy_version, reward_points, completion_rule, assignment_source,
                occurrence, due_at
            )
            SELECT $1 || ':cycle:' || (prior.last_occurrence + 1)::TEXT,
                   $2, version.id, $4, $5, version.reward_policy_version,
                   version.reward_points, version.completion_rule, $6,
                   prior.last_occurrence + 1, NOW() + INTERVAL '14 days'
            FROM quest_v2_versions version CROSS JOIN prior
            WHERE version.id = $3 AND version.lifecycle = 'active'
              AND COALESCE(prior.has_active, FALSE) = FALSE
              AND (version.repeatable = TRUE OR prior.last_occurrence = 0)
              AND (prior.last_resolved IS NULL
                   OR prior.last_resolved + make_interval(hours => version.cooldown_hours) <= NOW())
            ON CONFLICT DO NOTHING
            RETURNING id
        `, [assignmentKey, userId, versionId, boardId, chainId, source]);
        return result.rows[0] || null;
    }

    async loadOfferCandidate(userId, versionId, boardId, chainId) {
        const sharedEligibility = `
            version.id = $2 AND version.lifecycle = 'active'
            AND (version.starts_at IS NULL OR version.starts_at <= clock_timestamp())
            AND (version.ends_at IS NULL OR version.ends_at > clock_timestamp())
            AND NOT EXISTS (
                SELECT 1 FROM creator_preferences preference
                WHERE preference.user_id = $1
                  AND preference.preference_type = 'quest_category'
                  AND preference.preference_key = version.category
                  AND preference.preference_value = 'block'
            )`;
        let result;
        if (boardId !== null) {
            result = await this.client.query(`
                SELECT version.id, version.category, version.lifecycle,
                       version.eligibility_rule
                FROM quest_v2_versions version
                JOIN creator_profiles profile ON profile.user_id = $1
                JOIN quest_v2_board_slots slot
                  ON slot.version_id = version.id AND slot.board_id = $3
                JOIN quest_v2_boards board
                  ON board.id = slot.board_id AND board.lifecycle = 'active'
                JOIN quest_v2_schedules schedule
                 ON schedule.board_id = board.id
                 AND schedule.lifecycle = 'active'
                 AND schedule.timezone = profile.timezone
                 AND schedule.starts_at <= clock_timestamp()
                 AND schedule.ends_at > clock_timestamp()
                WHERE ${sharedEligibility}
                ORDER BY schedule.id
                LIMIT 1
                FOR SHARE OF version, slot, board, schedule
            `, [userId, versionId, boardId]);
        } else {
            result = await this.client.query(`
                SELECT version.id, version.category, version.lifecycle,
                       version.eligibility_rule
                FROM quest_v2_versions version
                JOIN quest_v2_chain_nodes node
                  ON node.version_id = version.id AND node.chain_id = $3
                JOIN quest_v2_chains chain
                  ON chain.id = node.chain_id AND chain.lifecycle = 'active'
                WHERE ${sharedEligibility}
                  AND (node.prerequisite_node IS NULL OR EXISTS (
                      SELECT 1 FROM quest_v2_chain_nodes prior_node
                      JOIN quest_v2_assignments prior_assignment
                        ON prior_assignment.version_id = prior_node.version_id
                       AND prior_assignment.user_id = $1
                       AND prior_assignment.status = 'completed'
                      WHERE prior_node.chain_id = node.chain_id
                        AND prior_node.node_number = node.prerequisite_node
                  ))
                LIMIT 1
                FOR SHARE OF version, node, chain
            `, [userId, versionId, chainId]);
        }
        return result.rows[0] || null;
    }

    async listVersionSteps(versionId) {
        const result = await this.client.query(`
            SELECT id, step_key, ordinal, evidence_kind, depends_on_keys,
                   completion_rule, required
            FROM quest_v2_step_definitions
            WHERE version_id = $1
            ORDER BY ordinal, id
            FOR SHARE
        `, [versionId]);
        return result.rows;
    }

    async listCreatorTimezones() {
        const result = await this.client.query(`
            SELECT DISTINCT timezone
            FROM creator_profiles
            WHERE timezone IS NOT NULL AND timezone <> ''
            ORDER BY timezone
            LIMIT 100
        `);
        return result.rows.length > 0 ? result.rows.map((row) => row.timezone) : ['UTC'];
    }

    async materializeWeeklyBoards({ timezone, horizonWeeks, asOf = null }) {
        const timezoneToken = crypto.createHash('sha256').update(timezone).digest('hex').slice(0, 24);
        await this.client.query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
            [`quest-v2-weekly:${timezone}`]
        );
        const timestamp = asOf || null;

        // The original twelve one-shot rows are retained for audit but leave
        // the active scheduler once the rolling materializer owns a timezone.
        await this.client.query(`
            UPDATE quest_v2_schedules
            SET lifecycle = 'cancelled'
            WHERE rotation_week_start IS NULL
              AND schedule_key LIKE 'phase-2-week-%'
              AND lifecycle IN ('scheduled', 'active')
              AND timezone = $1
        `, [timezone]);
        await this.client.query(`
            UPDATE quest_v2_schedules
            SET lifecycle = 'finished'
            WHERE rotation_week_start IS NOT NULL AND timezone = $1
              AND lifecycle = 'active'
              AND ends_at <= COALESCE($2::TIMESTAMPTZ, clock_timestamp())
        `, [timezone, timestamp]);
        await this.client.query(`
            UPDATE quest_v2_schedules
            SET lifecycle = 'cancelled'
            WHERE rotation_week_start IS NOT NULL AND timezone = $1
              AND lifecycle = 'scheduled'
              AND ends_at <= COALESCE($2::TIMESTAMPTZ, clock_timestamp())
        `, [timezone, timestamp]);

        const inserted = await this.client.query(`
            WITH active_boards AS (
                SELECT board.id,
                       ROW_NUMBER() OVER (
                           ORDER BY MIN(legacy.schedule_key), board.id
                       ) AS board_number,
                       COUNT(*) OVER () AS board_count
                FROM quest_v2_boards board
                JOIN quest_v2_schedules legacy ON legacy.board_id = board.id
                  AND legacy.rotation_week_start IS NULL
                  AND legacy.schedule_key LIKE 'phase-2-week-%'
                WHERE board.lifecycle = 'active'
                GROUP BY board.id
            ), local_weeks AS (
                SELECT week_offset,
                       date_trunc('week',
                           COALESCE($3::TIMESTAMPTZ, clock_timestamp()) AT TIME ZONE $1
                       )::DATE + (week_offset * 7) AS week_start
                FROM generate_series(0, $2::INTEGER) AS generated(week_offset)
            ), selected AS (
                SELECT week.week_start, board.id AS board_id
                FROM local_weeks week
                JOIN active_boards board
                  ON board.board_number = 1 + mod(
                      mod(((week.week_start - DATE '2026-08-17') / 7)::INTEGER,
                          board.board_count::INTEGER) + board.board_count::INTEGER,
                      board.board_count::INTEGER)
            )
            INSERT INTO quest_v2_schedules(
                schedule_key, board_id, timezone, starts_at, ends_at,
                lifecycle, rotation_week_start
            )
            SELECT 'weekly-' || $4 || '-' || to_char(selected.week_start, 'YYYY-MM-DD'),
                   selected.board_id, $1,
                   selected.week_start::TIMESTAMP AT TIME ZONE $1,
                   (selected.week_start + 7)::TIMESTAMP AT TIME ZONE $1,
                   CASE WHEN selected.week_start = date_trunc('week',
                       COALESCE($3::TIMESTAMPTZ, clock_timestamp()) AT TIME ZONE $1
                   )::DATE THEN 'active' ELSE 'scheduled' END,
                   selected.week_start
            FROM selected
            ON CONFLICT (timezone, rotation_week_start)
                WHERE rotation_week_start IS NOT NULL
            DO NOTHING
            RETURNING id
        `, [timezone, horizonWeeks, timestamp, timezoneToken]);

        await this.client.query(`
            UPDATE quest_v2_schedules
            SET lifecycle = 'active'
            WHERE rotation_week_start IS NOT NULL AND timezone = $1
              AND lifecycle = 'scheduled'
              AND starts_at <= COALESCE($2::TIMESTAMPTZ, clock_timestamp())
              AND ends_at > COALESCE($2::TIMESTAMPTZ, clock_timestamp())
        `, [timezone, timestamp]);
        const state = await this.client.query(`
            SELECT COUNT(*) FILTER (
                       WHERE lifecycle = 'active'
                         AND starts_at <= COALESCE($2::TIMESTAMPTZ, clock_timestamp())
                         AND ends_at > COALESCE($2::TIMESTAMPTZ, clock_timestamp())
                   ) AS current_count,
                   COUNT(*) FILTER (
                       WHERE lifecycle = 'scheduled'
                         AND starts_at > COALESCE($2::TIMESTAMPTZ, clock_timestamp())
                   ) AS future_count
            FROM quest_v2_schedules
            WHERE timezone = $1 AND rotation_week_start IS NOT NULL
              AND ends_at > COALESCE($2::TIMESTAMPTZ, clock_timestamp())
        `, [timezone, timestamp]);
        return {
            timezone,
            inserted: inserted.rowCount,
            current: Number(state.rows[0]?.current_count || 0),
            future: Number(state.rows[0]?.future_count || 0)
        };
    }

    async listStudioVersions({ limit = 100, offset = 0 } = {}) {
        const result = await this.client.query(`
            SELECT definition.slug, definition.source, version.*
            FROM quest_v2_definitions definition
            JOIN quest_v2_versions version ON version.definition_id = definition.id
            ORDER BY version.created_at DESC, version.id DESC
            LIMIT $1 OFFSET $2
        `, [limit, offset]);
        return result.rows;
    }

    async createStudioDraft(input, adminUsername) {
        const definition = await this.client.query(`
            INSERT INTO quest_v2_definitions (slug, source, created_by)
            VALUES ($1, 'owner_studio', $2)
            ON CONFLICT (slug) DO NOTHING
            RETURNING id
        `, [input.slug, adminUsername]);
        let definitionId = definition.rows[0]?.id;
        if (!definitionId) {
            const existing = await this.client.query(
                "SELECT id FROM quest_v2_definitions WHERE slug = $1 AND source = 'owner_studio'",
                [input.slug]
            );
            definitionId = existing.rows[0]?.id;
        }
        if (!definitionId) throw new Error('Quest slug belongs to an immutable non-studio definition');
        const hash = contentHash(input);
        const version = await this.client.query(`
            INSERT INTO quest_v2_versions (
                definition_id, version, lifecycle, category, tags, difficulty,
                estimated_minutes, safety_class, title_zh, title_en,
                description_zh, description_en, hint_zh, hint_en,
                completion_zh, completion_en, verification_mode, consent_category,
                eligibility_rule, completion_rule, reward_policy_version,
                reward_points, review_policy, cooldown_hours, repeatable,
                allow_event_reuse, content_hash
            ) VALUES (
                $1, $2, 'draft', $3, $4, $5, $6, $7, $8, $9,
                $10, $11, $12, $13, $14, $15, $16, $3,
                $17::JSONB, $18::JSONB, 1, $19, $20, $21, FALSE, $22, $23
            ) RETURNING id
        `, [
            definitionId, input.version, input.category, input.tags, input.difficulty,
            input.estimatedMinutes, input.safetyClass, input.titleZh, input.titleEn,
            input.descriptionZh, input.descriptionEn, input.hintZh, input.hintEn,
            input.completionZh, input.completionEn, input.verificationMode,
            JSON.stringify(input.eligibilityRule), JSON.stringify(input.completionRule),
            input.rewardPoints, input.reviewPolicy, input.cooldownHours,
            input.allowEventReuse, hash
        ]);
        for (const step of input.steps) {
            await this.client.query(`
                INSERT INTO quest_v2_step_definitions (
                    version_id, step_key, ordinal, title_zh, title_en,
                    instructions_zh, instructions_en, evidence_kind,
                    parallel_group, depends_on_keys, completion_rule, required
                ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::JSONB,$12)
            `, [
                version.rows[0].id, step.step_key, step.ordinal,
                step.title_zh, step.title_en,
                step.instructions_zh, step.instructions_en,
                step.evidence_kind, step.parallel_group,
                step.depends_on_keys, JSON.stringify(step.completion_rule), step.required
            ]);
        }
        return { definitionId: Number(definitionId), versionId: Number(version.rows[0].id), contentHash: hash };
    }

    async publishStudioVersion(versionId) {
        const result = await this.client.query(`
            UPDATE quest_v2_versions
            SET lifecycle = 'active', published_at = NOW()
            WHERE id = $1 AND lifecycle IN ('draft', 'validated')
            RETURNING id
        `, [versionId]);
        return result.rowCount === 1;
    }

    async listLegacyTaskCards(username, limit = 100) {
        const result = await this.client.query(`
            SELECT assignment.id, assignment.status, assignment.reward_points,
                   assignment.assigned_at, assignment.resolved_at,
                   template.slug, template.title_zh, template.title_en
            FROM task_card_assignments assignment
            JOIN task_card_templates template ON template.id = assignment.template_id
            WHERE assignment.username = $1
            ORDER BY assignment.assigned_at DESC, assignment.id DESC
            LIMIT $2
        `, [username, limit]);
        return result.rows;
    }
}

module.exports = { QuestV2CatalogRepository, contentHash };
