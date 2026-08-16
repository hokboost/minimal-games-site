ALTER TABLE users
    ADD COLUMN IF NOT EXISTS account_locked BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS account_locked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS account_locked_by VARCHAR(50),
    ADD COLUMN IF NOT EXISTS account_lock_reason TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'users'::regclass
          AND conname = 'users_permanent_lock_shape_check'
    ) THEN
        ALTER TABLE users
            ADD CONSTRAINT users_permanent_lock_shape_check CHECK (
                (account_locked = FALSE
                    AND account_locked_at IS NULL
                    AND account_locked_by IS NULL
                    AND account_lock_reason IS NULL)
                OR
                (account_locked = TRUE
                    AND account_locked_at IS NOT NULL
                    AND account_locked_by IS NOT NULL
                    AND account_lock_reason IS NOT NULL
                    AND char_length(account_lock_reason) BETWEEN 1 AND 500)
            );
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS task_card_templates (
    id BIGSERIAL PRIMARY KEY,
    slug VARCHAR(100) NOT NULL UNIQUE,
    title_zh VARCHAR(240) NOT NULL,
    title_en VARCHAR(240) NOT NULL,
    task_kind VARCHAR(40) NOT NULL,
    reward_points INTEGER NOT NULL CHECK (reward_points BETWEEN 1 AND 100000000),
    complete_label_zh VARCHAR(240) NOT NULL,
    complete_label_en VARCHAR(240) NOT NULL,
    progress_label_zh VARCHAR(240) NOT NULL,
    progress_label_en VARCHAR(240) NOT NULL,
    abandon_label_zh VARCHAR(240) NOT NULL,
    abandon_label_en VARCHAR(240) NOT NULL,
    encouragement_zh VARCHAR(500) NOT NULL,
    encouragement_en VARCHAR(500) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS task_card_assignments (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL REFERENCES users(username),
    template_id BIGINT NOT NULL REFERENCES task_card_templates(id),
    status VARCHAR(24) NOT NULL DEFAULT 'offered'
        CHECK (status IN ('offered', 'claimed', 'pending_approval', 'approved', 'abandoned', 'expired')),
    reward_points INTEGER NOT NULL CHECK (reward_points BETWEEN 1 AND 100000000),
    assigned_by VARCHAR(50) NOT NULL,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    claimed_at TIMESTAMPTZ,
    due_at TIMESTAMPTZ,
    progress_extensions INTEGER NOT NULL DEFAULT 0 CHECK (progress_extensions BETWEEN 0 AND 10),
    submitted_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    reviewed_by VARCHAR(50) REFERENCES users(username),
    review_note VARCHAR(500),
    CONSTRAINT task_card_assignment_shape_check CHECK (
        (status = 'offered' AND claimed_at IS NULL AND due_at IS NULL AND submitted_at IS NULL AND resolved_at IS NULL)
        OR
        (status = 'claimed' AND claimed_at IS NOT NULL AND due_at IS NOT NULL AND submitted_at IS NULL AND resolved_at IS NULL)
        OR
        (status = 'pending_approval' AND claimed_at IS NOT NULL AND due_at IS NOT NULL AND submitted_at IS NOT NULL AND resolved_at IS NULL)
        OR
        (status IN ('approved', 'abandoned', 'expired') AND resolved_at IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_task_cards_one_active_per_user
    ON task_card_assignments(username)
    WHERE status IN ('claimed', 'pending_approval');
CREATE INDEX IF NOT EXISTS idx_task_cards_user_status
    ON task_card_assignments(username, status, assigned_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_cards_pending_review
    ON task_card_assignments(status, submitted_at)
    WHERE status = 'pending_approval';

CREATE TABLE IF NOT EXISTS event_task_assignments (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL REFERENCES users(username),
    title VARCHAR(240) NOT NULL,
    description VARCHAR(2000) NOT NULL,
    reward_points INTEGER NOT NULL CHECK (reward_points BETWEEN 1 AND 100000000),
    status VARCHAR(24) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'pending_approval', 'approved', 'expired')),
    assigned_by VARCHAR(50) NOT NULL,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    due_at TIMESTAMPTZ NOT NULL,
    submitted_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    reviewed_by VARCHAR(50) REFERENCES users(username),
    review_note VARCHAR(500),
    CONSTRAINT event_task_assignment_shape_check CHECK (
        due_at > assigned_at
        AND (status = 'active' AND submitted_at IS NULL AND resolved_at IS NULL
            OR status = 'pending_approval' AND submitted_at IS NOT NULL AND resolved_at IS NULL
            OR status IN ('approved', 'expired') AND resolved_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_event_tasks_user_status
    ON event_task_assignments(username, status, assigned_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_tasks_pending_review
    ON event_task_assignments(status, submitted_at)
    WHERE status = 'pending_approval';

ALTER TABLE submissions
    ADD COLUMN IF NOT EXISTS reward_points INTEGER,
    ADD COLUMN IF NOT EXISTS cost_points INTEGER;

INSERT INTO task_card_templates (
    slug, title_zh, title_en, task_kind, reward_points,
    complete_label_zh, complete_label_en,
    progress_label_zh, progress_label_en,
    abandon_label_zh, abandon_label_en,
    encouragement_zh, encouragement_en
) VALUES
    ('learn-wo-yiwei', '学会《我以为我可以》', 'Learn “I Thought I Could”', 'learn_song', 15000,
     '我完全学会啦，都唱对了！', 'I learned it all and sang every part!',
     '我基本都会啦，就差几个小地方～', 'I mostly know it—just a few tiny parts left!',
     '这首先放一放，换个任务抱抱', 'I’ll pause this one and try another task',
     '已经很接近啦！再给你3天，把那几个小地方温柔拿下～', 'You are so close! Here are 3 more days to polish those last little parts.'),
    ('sing-na-xie-hua', '演唱《那些你说过的话》', 'Perform “The Things You Said”', 'perform_song', 2000,
     '唱完啦，这次发挥超满意！', 'I performed it and I’m really happy with it!',
     '已经能唱下来啦，再顺一顺就好～', 'I can sing it through—just need a little polish!',
     '今天先不唱这首，换一张吧', 'I’ll skip this song today and draw another card',
     '很棒，整首已经快连起来啦！倒计时为你延长3天～', 'Great work—the whole song is almost flowing! You have 3 extra days.'),
    ('sing-meiyou-yiwai', '演唱《没有意外的分开》', 'Perform “A Separation Without Surprise”', 'perform_song', 2888,
     '完整唱下来啦，情绪也到位了！', 'I sang the whole song and nailed the emotion!',
     '大部分稳稳的，再磨一下细节～', 'Most of it is solid—just polishing the details!',
     '这次先放弃，给我换首歌吧', 'I’ll let this one go and switch songs',
     '情绪和旋律都抓得越来越好啦，再奖励你3天慢慢磨～', 'The melody and emotion are coming together—take 3 more days to polish it.'),
    ('sing-cangzai-xindi', '演唱《你是我藏在心底的秘密》', 'Perform “You Are the Secret in My Heart”', 'perform_song', 2000,
     '唱完啦，把秘密好好唱出来了！', 'I finished it and sang the secret from my heart!',
     '快唱顺啦，再熟悉几个转音～', 'Almost smooth—just a few turns left to learn!',
     '秘密先藏回去，换个任务啦', 'I’ll tuck this secret away and choose another task',
     '已经很有感觉啦！多给你3天，把转音也唱得漂漂亮亮～', 'It already has such a lovely feeling! Take 3 more days for those vocal turns.'),
    ('duet-ai-ni-de-xin', '找个没妹妹学会《爱你的心》线下合唱', 'Learn and perform “A Heart That Loves You” as an offline duet', 'offline_duet', 30000,
     '合唱成功啦，我们配合得超棒！', 'The duet is done—we worked together beautifully!',
     '人和歌都约好啦，正在认真排练～', 'Partner and song are ready—we’re rehearsing!',
     '这次合唱没约成，换个任务吧', 'The duet didn’t work out this time—give me another task',
     '能约到一起排练已经很厉害啦！再给你3天把配合练得闪闪发光～', 'Getting a rehearsal together is already wonderful! Take 3 more days to make the duet shine.')
ON CONFLICT (slug) DO UPDATE SET
    title_zh = EXCLUDED.title_zh,
    title_en = EXCLUDED.title_en,
    task_kind = EXCLUDED.task_kind,
    reward_points = EXCLUDED.reward_points,
    complete_label_zh = EXCLUDED.complete_label_zh,
    complete_label_en = EXCLUDED.complete_label_en,
    progress_label_zh = EXCLUDED.progress_label_zh,
    progress_label_en = EXCLUDED.progress_label_en,
    abandon_label_zh = EXCLUDED.abandon_label_zh,
    abandon_label_en = EXCLUDED.abandon_label_en,
    encouragement_zh = EXCLUDED.encouragement_zh,
    encouragement_en = EXCLUDED.encouragement_en,
    active = TRUE;
