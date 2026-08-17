'use strict';

const { stableStringify } = require('../lib/idempotency');

class StoryWorldRepository {
    constructor(client) { this.client = client; }

    async seedContent(content) {
        const { nodesById, contentHash, ...snapshot } = content;
        const campaign = await this.client.query(`
            INSERT INTO story_campaigns (slug, title_zh, title_en)
            VALUES ($1, $2, $3) ON CONFLICT (slug) DO NOTHING RETURNING *
        `, [content.slug, content.title.zh, content.title.en]);
        const campaignRow = campaign.rows[0] || (await this.client.query('SELECT * FROM story_campaigns WHERE slug = $1', [content.slug])).rows[0];
        if (!campaignRow || campaignRow.title_zh !== content.title.zh || campaignRow.title_en !== content.title.en) throw new Error('Story campaign identity collision');
        const inserted = await this.client.query(`
            INSERT INTO story_content_versions (
                campaign_id, version, status, content_hash, content_snapshot,
                node_count, choice_count, published_at
            ) VALUES ($1, $2, 'active', $3, $4::JSONB, $5, $6, NOW())
            ON CONFLICT (campaign_id, version) DO NOTHING RETURNING *
        `, [campaignRow.id, content.version, contentHash, JSON.stringify(snapshot), content.nodes.length,
            content.nodes.filter((node) => node.type === 'choice').length]);
        const row = inserted.rows[0] || (await this.client.query(`SELECT * FROM story_content_versions WHERE campaign_id = $1 AND version = $2`, [campaignRow.id, content.version])).rows[0];
        if (!row || row.content_hash !== contentHash || Number(row.node_count) !== content.nodes.length
            || Number(row.choice_count) !== content.nodes.filter((node) => node.type === 'choice').length
            || stableStringify(row.content_snapshot) !== stableStringify(snapshot)) throw new Error('Story content version collision');
        return { campaign: campaignRow, version: row };
    }

    async loadCatalogIdentity(slug, version) {
        const result = await this.client.query(`
            SELECT campaign.id AS campaign_id, version.id AS content_version_id, version.status, version.content_hash
            FROM story_campaigns campaign JOIN story_content_versions version ON version.campaign_id = campaign.id
            WHERE campaign.slug = $1 AND version.version = $2
        `, [slug, version]);
        return result.rows[0] || null;
    }

    async loadContentVersion(contentVersionId) {
        const result = await this.client.query('SELECT id,version,status,content_hash,content_snapshot FROM story_content_versions WHERE id=$1', [contentVersionId]);
        return result.rows[0] || null;
    }

    async lockCreator(username) {
        const result = await this.client.query(`
            SELECT account.id, account.username, profile.timezone, profile.story_tone,
                   profile.communication_style, profile.live_interaction_opt_in
            FROM users account LEFT JOIN creator_profiles profile ON profile.user_id = account.id
            WHERE account.username = $1 AND account.authorized = TRUE AND account.deactivated = FALSE
            FOR UPDATE OF account
        `, [username]);
        return result.rows[0] || null;
    }

    async readCreator(username) {
        const result = await this.client.query(`
            SELECT account.id,account.username,profile.timezone,profile.story_tone,
                   profile.communication_style,profile.live_interaction_opt_in
            FROM users account LEFT JOIN creator_profiles profile ON profile.user_id=account.id
            WHERE account.username=$1 AND account.authorized=TRUE AND account.deactivated=FALSE
        `, [username]);
        return result.rows[0] || null;
    }

    async loadBoundaries(userId) {
        const [preferences, quietHours] = await Promise.all([
            this.client.query(`SELECT preference_type, preference_key, preference_value FROM creator_preferences WHERE user_id = $1`, [userId]),
            this.client.query(`SELECT weekday, start_minute, end_minute FROM creator_quiet_hours WHERE user_id = $1 AND enabled = TRUE ORDER BY weekday`, [userId])
        ]);
        return { preferences: preferences.rows, quietHours: quietHours.rows };
    }

    async lockActiveRun(userId, campaignId) {
        const result = await this.client.query(`
            SELECT * FROM story_runs WHERE user_id = $1 AND campaign_id = $2 AND status = 'active'
            ORDER BY id DESC LIMIT 1 FOR UPDATE
        `, [userId, campaignId]);
        return result.rows[0] || null;
    }

    async lockRun(userId, runId) {
        const result = await this.client.query('SELECT * FROM story_runs WHERE user_id=$1 AND id=$2 FOR UPDATE', [userId, runId]);
        return result.rows[0] || null;
    }

    async loadRun(userId, runId) {
        const result = await this.client.query('SELECT * FROM story_runs WHERE user_id=$1 AND id=$2', [userId, runId]);
        return result.rows[0] || null;
    }

    async hasCommittedChoice(runId, nodeId, choiceId) {
        const result = await this.client.query(`SELECT 1 FROM story_events WHERE run_id=$1 AND from_node_id=$2 AND selected_choice_id=$3 LIMIT 1`, [runId, nodeId, choiceId]);
        return result.rowCount > 0;
    }

    async latestRun(userId, campaignId, contentVersionId = null) {
        const result = await this.client.query(`SELECT * FROM story_runs WHERE user_id = $1 AND campaign_id = $2 AND ($3::BIGINT IS NULL OR content_version_id=$3) ORDER BY id DESC LIMIT 1`, [userId, campaignId, contentVersionId]);
        return result.rows[0] || null;
    }

    async createRun({ userId, campaignId, contentVersionId, run }) {
        const result = await this.client.query(`
            INSERT INTO story_runs (user_id, campaign_id, content_version_id, status, current_episode,
                current_node_id, revision, replay_mode, state_snapshot, checkpoint_snapshot)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::JSONB,$10::JSONB) RETURNING *
        `, [userId, campaignId, contentVersionId, run.status, run.currentEpisode, run.currentNodeId,
            run.revision, run.replayMode, JSON.stringify(run.state), run.checkpoint ? JSON.stringify(run.checkpoint) : null]);
        return result.rows[0];
    }

    async updateRun(runId, expectedRevision, run) {
        const result = await this.client.query(`
            UPDATE story_runs SET status=$3,current_episode=$4,current_node_id=$5,revision=$6,
                state_snapshot=$7::JSONB,checkpoint_snapshot=$8::JSONB,
                completed_at=CASE WHEN $3='completed' THEN COALESCE(completed_at,NOW()) ELSE NULL END,updated_at=NOW()
            WHERE id=$1 AND revision=$2 AND status='active' RETURNING *
        `, [runId, expectedRevision, run.status, run.currentEpisode, run.currentNodeId, run.revision,
            JSON.stringify(run.state), run.checkpoint ? JSON.stringify(run.checkpoint) : null]);
        return result.rows[0] || null;
    }

    async appendEvent(event) {
        const result = await this.client.query(`
            INSERT INTO story_events (event_id,run_id,command_id,semantic_hash,actor_type,actor_username,
                action,from_node_id,to_node_id,selected_choice_id,answer_correct,from_revision,to_revision,
                effects_digest,response_snapshot)
            VALUES ($1,$2,$3,$4,'creator',$5,$6,$7,$8,$9,$10,$11,$12,$13::JSONB,$14::JSONB)
            ON CONFLICT (run_id,command_id) DO NOTHING RETURNING *
        `, [event.eventId,event.runId,event.commandId,event.semanticHash,event.actorUsername,event.action,
            event.fromNodeId,event.toNodeId,event.selectedChoice,event.answerCorrect,event.fromRevision,event.toRevision,
            JSON.stringify(event.effectsDigest),JSON.stringify(event.response)]);
        return result.rows[0] || null;
    }

    async loadEvent(runId, commandId) {
        const result = await this.client.query('SELECT * FROM story_events WHERE run_id=$1 AND command_id=$2', [runId, commandId]);
        return result.rows[0] || null;
    }

    async syncState(runId, eventId, state) {
        const flagKeys = Object.keys(state.flags || {}), characterKeys = Object.keys(state.characterRelationships || {});
        await this.client.query('DELETE FROM story_flags WHERE run_id=$1 AND NOT (flag_key=ANY($2::TEXT[]))', [runId, flagKeys]);
        await this.client.query('DELETE FROM story_character_relationships WHERE run_id=$1 AND NOT (character_key=ANY($2::TEXT[]))', [runId, characterKeys]);
        for (const [key, value] of Object.entries(state.flags || {})) await this.client.query(`
            INSERT INTO story_flags(run_id,flag_key,flag_value,source_event_id) VALUES($1,$2,$3::JSONB,$4)
            ON CONFLICT(run_id,flag_key) DO UPDATE SET flag_value=EXCLUDED.flag_value,source_event_id=EXCLUDED.source_event_id,updated_at=NOW()
            WHERE story_flags.flag_value IS DISTINCT FROM EXCLUDED.flag_value
        `, [runId, key, JSON.stringify(value), eventId]);
        for (const [axis, value] of Object.entries(state.axes || {})) await this.client.query(`
            INSERT INTO story_relationship_axes(run_id,axis,value,source_event_id) VALUES($1,$2,$3,$4)
            ON CONFLICT(run_id,axis) DO UPDATE SET value=EXCLUDED.value,source_event_id=EXCLUDED.source_event_id,updated_at=NOW()
            WHERE story_relationship_axes.value IS DISTINCT FROM EXCLUDED.value
        `, [runId, axis, value, eventId]);
        for (const [character, value] of Object.entries(state.characterRelationships || {})) await this.client.query(`
            INSERT INTO story_character_relationships(run_id,character_key,value,source_event_id) VALUES($1,$2,$3,$4)
            ON CONFLICT(run_id,character_key) DO UPDATE SET value=EXCLUDED.value,source_event_id=EXCLUDED.source_event_id,updated_at=NOW()
            WHERE story_character_relationships.value IS DISTINCT FROM EXCLUDED.value
        `, [runId, character, value, eventId]);
        for (const [type, values] of [['clue', state.clues], ['item', state.inventory], ['route', state.routes], ['message', state.messages]]) {
            await this.client.query('DELETE FROM story_run_assets WHERE run_id=$1 AND asset_type=$2 AND NOT (asset_key=ANY($3::TEXT[]))', [runId, type, Object.keys(values || {})]);
            for (const key of Object.keys(values || {})) await this.client.query(`INSERT INTO story_run_assets(run_id,asset_type,asset_key,source_event_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [runId, type, key, eventId]);
        }
    }

    async insertFirstClear({ userId, contentVersionId, episode, runId, eventId }) {
        const result = await this.client.query(`INSERT INTO story_first_clears(user_id,content_version_id,episode_slug,run_id,source_event_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING id`, [userId, contentVersionId, episode, runId, eventId]);
        return result.rowCount === 1;
    }

    async insertMemory({ userId, contentVersionId, runId, eventId, key, memory }) {
        const inserted = await this.client.query(`INSERT INTO story_memories(user_id,content_version_id,memory_key,first_run_id,source_event_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING id`, [userId, contentVersionId, key, runId, eventId]);
        if (!inserted.rowCount) {
            const existing = (await this.client.query(`SELECT first_run_id,source_event_id FROM story_memories WHERE user_id=$1 AND content_version_id=$2 AND memory_key=$3`, [userId, contentVersionId, key])).rows[0];
            if (!existing) throw new Error('Story memory collision lost');
            return false;
        }
        const shared = await this.client.query(`
            INSERT INTO shared_memories(user_id,source_type,source_id,title_zh,title_en,body_zh,body_en,content_version,visibility,metadata)
            VALUES($1,'story_world',$2,$3,$4,$5,$6,$7,'private',$8::JSONB) ON CONFLICT(user_id,source_type,source_id) DO NOTHING RETURNING id
        `, [userId, `${contentVersionId}:${key}`, memory.title.zh, memory.title.en, memory.body.zh, memory.body.en,
            1, JSON.stringify({ storyContentVersionId: Number(contentVersionId), memoryKey: key, runId: Number(runId) })]);
        if (!shared.rowCount) {
            const existing = (await this.client.query(`SELECT title_zh,title_en,body_zh,body_en FROM shared_memories WHERE user_id=$1 AND source_type='story_world' AND source_id=$2`, [userId, `${contentVersionId}:${key}`])).rows[0];
            if (!existing || existing.title_zh !== memory.title.zh || existing.title_en !== memory.title.en || existing.body_zh !== memory.body.zh || existing.body_en !== memory.body.en) throw new Error('Shared story memory identity collision');
        }
        return true;
    }

    async insertUnlock({ userId, contentVersionId, eventId, unlockType, key }) {
        const result = await this.client.query(`INSERT INTO story_unlock_intents(user_id,content_version_id,unlock_type,unlock_key,source_event_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING unlock_type,unlock_key`, [userId, contentVersionId, unlockType, key, eventId]);
        if (!result.rowCount) {
            const existing = (await this.client.query(`SELECT unlock_type,unlock_key FROM story_unlock_intents WHERE user_id=$1 AND content_version_id=$2 AND unlock_type=$3 AND unlock_key=$4`, [userId, contentVersionId, unlockType, key])).rows[0];
            if (!existing || existing.unlock_type !== unlockType || existing.unlock_key !== key) throw new Error('Story unlock identity collision');
        }
    }

    async insertMessage({ userId, key, message, runId }) {
        const result = await this.client.query(`
            INSERT INTO creator_inbox_messages(user_id,sender_type,message_type,dedupe_key,title_zh,title_en,body_zh,body_en,action_path,metadata)
            VALUES($1,'system','story_letter',$2,$3,$4,$5,$6,'/story',$7::JSONB) ON CONFLICT(user_id,dedupe_key) DO NOTHING RETURNING id
        `, [userId, `story:${runId}:${key}`, message.title.zh, message.title.en, message.body.zh, message.body.en, JSON.stringify({ runId: Number(runId), messageKey: key })]);
        if (!result.rowCount) {
            const existing = (await this.client.query(`SELECT title_zh,title_en,body_zh,body_en FROM creator_inbox_messages WHERE user_id=$1 AND dedupe_key=$2`, [userId, `story:${runId}:${key}`])).rows[0];
            if (!existing || existing.title_zh !== message.title.zh || existing.title_en !== message.title.en || existing.body_zh !== message.body.zh || existing.body_en !== message.body.en) throw new Error('Story message identity collision');
        }
    }

    async appendRelationshipFirstClear({ userId, episode, runId, eventId }) {
        const sourceId = `run:${runId}:episode:${episode}`;
        const inserted = await this.client.query(`
            INSERT INTO relationship_events(user_id,event_type,xp_delta,source_type,source_id,summary_zh,summary_en,metadata)
            VALUES($1,'story.episode.completed',5,'story_world',$2,'共同完成一集分支故事','Completed a branching-story episode together',$3::JSONB)
            ON CONFLICT(user_id,source_type,source_id) DO NOTHING RETURNING id
        `, [userId, sourceId, JSON.stringify({ episode, storyEventId: eventId })]);
        if (!inserted.rowCount) {
            const existing = (await this.client.query(`SELECT event_type,xp_delta,metadata FROM relationship_events WHERE user_id=$1 AND source_type='story_world' AND source_id=$2`, [userId, sourceId])).rows[0];
            if (!existing || existing.event_type !== 'story.episode.completed' || Number(existing.xp_delta) !== 5
                || existing.metadata?.episode !== episode || existing.metadata?.storyEventId !== eventId) throw new Error('Story relationship identity collision');
        }
        if (inserted.rowCount) await this.client.query(`
            INSERT INTO relationship_profiles(user_id,total_xp,level,milestone) VALUES($1,5,1,'new_signal')
            ON CONFLICT(user_id) DO UPDATE SET total_xp=relationship_profiles.total_xp+5,
                level=LEAST(1000,1+((relationship_profiles.total_xp+5)/100)),version=relationship_profiles.version+1,updated_at=NOW()
        `, [userId]);
    }

    async insertAudit({ runId, userId, username, action, details, requestId }) {
        await this.client.query(`INSERT INTO story_audit_log(run_id,user_id,actor_type,actor_username,action,details,request_id) VALUES($1,$2,'creator',$3,$4,$5::JSONB,$6)`, [runId, userId, username, action, JSON.stringify(details || {}), requestId || null]);
    }

    async listAdminAudit(limit = 100) {
        const result = await this.client.query(`SELECT audit.id,audit.run_id,account.username,audit.action,audit.details,audit.created_at FROM story_audit_log audit LEFT JOIN users account ON account.id=audit.user_id ORDER BY audit.id DESC LIMIT $1`, [limit]);
        return result.rows;
    }
}

module.exports = { StoryWorldRepository };
