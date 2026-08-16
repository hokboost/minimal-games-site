-- Phase 2 expands the immutable v1 objective language with two explicitly
-- allowlisted, server-authored gameplay facts. The Phase 1 migration remains
-- checksum-locked and is intentionally not modified.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'quest_definitions'::regclass
          AND conname = 'quest_definitions_objective_check'
          AND contype = 'c'
    ) THEN
        RAISE EXCEPTION 'Phase 1 quest objective constraint is missing';
    END IF;
END
$$;

ALTER TABLE quest_definitions
    DROP CONSTRAINT quest_definitions_objective_check;

ALTER TABLE quest_definitions
    ADD CONSTRAINT quest_definitions_objective_v1_check CHECK (
        jsonb_typeof(objective) = 'object'
        AND (
            (
                objective->>'type' = 'event_count'
                AND objective->>'event' IN (
                    'adventure.chapter.completed',
                    'quiz.round.completed'
                )
                AND objective->>'target' ~ '^(1000000|[1-9][0-9]{0,5})$'
                AND (NOT (objective ? 'filters') OR jsonb_typeof(objective->'filters') = 'object')
            )
            OR (
                objective->>'type' = 'event_threshold'
                AND objective->>'event' = 'doudizhu.match.won'
                AND objective->>'field' = 'scoreDelta'
                AND objective->>'operator' = '>='
                AND CASE
                    WHEN objective->>'value' ~ '^[1-9][0-9]{0,9}$'
                    THEN (objective->>'value')::NUMERIC <= 2147483647
                    ELSE FALSE
                END
            )
        )
    ) NOT VALID;

ALTER TABLE quest_definitions
    VALIDATE CONSTRAINT quest_definitions_objective_v1_check;

INSERT INTO quest_definitions (
    slug, version, status,
    title_zh, title_en, description_zh, description_en,
    verification_mode, objective_version, objective, reward_points,
    eligibility, published_at
) VALUES
    (
        'quiz-three-strong-rounds', 1, 'published',
        '知识冲刺：三次高分答题', 'Knowledge Sprint: Three Strong Rounds',
        '完成三轮答题，并且每轮至少答对8题。进度由服务器结算记录。',
        'Complete three quiz rounds with at least eight correct answers in each. Server settlement records progress.',
        'automatic', 1,
        '{"type":"event_count","event":"quiz.round.completed","target":3,"filters":{"minimumCorrect":8}}'::jsonb,
        600,
        '{"type":"task_card_pilot"}'::jsonb,
        NOW()
    ),
    (
        'doudizhu-first-win', 1, 'published',
        '牌桌初胜：赢下一局斗地主', 'First Table Victory: Win a Dou Dizhu Match',
        '以地主或农民身份赢下一局斗地主。胜负和分差由服务器牌局状态验证。',
        'Win one Dou Dizhu match as either landlord or farmer. The server verifies the outcome and score.',
        'automatic', 1,
        '{"type":"event_threshold","event":"doudizhu.match.won","field":"scoreDelta","operator":">=","value":1}'::jsonb,
        500,
        '{"type":"task_card_pilot"}'::jsonb,
        NOW()
    )
ON CONFLICT (slug, version) DO NOTHING;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM quest_definitions
        WHERE slug = 'quiz-three-strong-rounds'
          AND version = 1
          AND status = 'published'
          AND verification_mode = 'automatic'
          AND objective_version = 1
          AND objective = '{"type":"event_count","event":"quiz.round.completed","target":3,"filters":{"minimumCorrect":8}}'::jsonb
          AND reward_points = 600
          AND eligibility = '{"type":"task_card_pilot"}'::jsonb
    ) THEN
        RAISE EXCEPTION 'Quiz Quest v1 conflicts with an existing definition';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM quest_definitions
        WHERE slug = 'doudizhu-first-win'
          AND version = 1
          AND status = 'published'
          AND verification_mode = 'automatic'
          AND objective_version = 1
          AND objective = '{"type":"event_threshold","event":"doudizhu.match.won","field":"scoreDelta","operator":">=","value":1}'::jsonb
          AND reward_points = 500
          AND eligibility = '{"type":"task_card_pilot"}'::jsonb
    ) THEN
        RAISE EXCEPTION 'Dou Dizhu Quest v1 conflicts with an existing definition';
    END IF;
END
$$;
