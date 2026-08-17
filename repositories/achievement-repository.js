'use strict';

class AchievementRepository {
    constructor(client) {
        if (!client?.query) throw new TypeError('AchievementRepository requires a queryable client');
        this.client = client;
    }

    async seed(definitions) {
        await this.client.query(`
            INSERT INTO streamer_achievement_definitions (
                slug,lifecycle,version,title_zh,title_en,description_zh,description_en,
                event_type,target,filters,hidden,season,collection_key,content_hash
            ) SELECT seed.slug,'active',seed.version,seed.title_zh,seed.title_en,seed.description_zh,seed.description_en,
                     seed.event_type,seed.target,seed.filters,seed.hidden,seed.season,seed.collection_key,seed.content_hash
              FROM jsonb_to_recordset($1::JSONB) AS seed(
                slug TEXT,version INTEGER,title_zh TEXT,title_en TEXT,description_zh TEXT,description_en TEXT,
                event_type TEXT,target INTEGER,filters JSONB,hidden BOOLEAN,season INTEGER,collection_key TEXT,content_hash TEXT
              ) ON CONFLICT (slug) DO NOTHING
        `, [JSON.stringify(definitions.map((item) => ({
            slug:item.slug,version:item.version,title_zh:item.titleZh,title_en:item.titleEn,
            description_zh:item.descriptionZh,description_en:item.descriptionEn,event_type:item.eventType,
            target:item.target,filters:item.filters,hidden:item.hidden,season:item.season,
            collection_key:item.collectionKey,content_hash:item.contentHash
        })))]);
        const persisted = await this.client.query('SELECT slug,version,content_hash FROM streamer_achievement_definitions WHERE slug=ANY($1::TEXT[])', [definitions.map((item) => item.slug)]);
        const bySlug = new Map(persisted.rows.map((row) => [row.slug,row]));
        for (const item of definitions) {
            const row = bySlug.get(item.slug);
            if (!row || Number(row.version) !== item.version || row.content_hash !== item.contentHash) {
                throw new Error(`Achievement catalog identity collision: ${item.slug}`);
            }
        }
        return definitions.length;
    }

    async lockUser(username) {
        const result = await this.client.query(`SELECT id,username FROM users WHERE username=$1 AND authorized=TRUE AND deactivated=FALSE FOR UPDATE`, [username]);
        return result.rows[0] || null;
    }

    async readUser(username) {
        const result = await this.client.query(`SELECT id,username FROM users WHERE username=$1 AND authorized=TRUE AND deactivated=FALSE`, [username]);
        return result.rows[0] || null;
    }

    async definitions(eventType = null) {
        const result = await this.client.query(`
            SELECT * FROM streamer_achievement_definitions
            WHERE lifecycle='active' AND ($1::TEXT IS NULL OR event_type=$1)
            ORDER BY id
        `, [eventType]);
        return result.rows;
    }

    async insertEvent(value) {
        const inserted = await this.client.query(`
            INSERT INTO streamer_achievement_events(event_id,user_id,source_type,source_event_id,event_type,occurred_at,payload,semantic_hash)
            VALUES($1,$2,$3,$4,$5,$6,$7::JSONB,$8)
            ON CONFLICT (source_type,source_event_id) DO NOTHING RETURNING *
        `, [value.eventId,value.userId,value.sourceType,value.sourceEventId,value.eventType,value.occurredAt,JSON.stringify(value.payload),value.semanticHash]);
        if (inserted.rows[0]) return { inserted: true, row: inserted.rows[0] };
        const existing = await this.client.query('SELECT * FROM streamer_achievement_events WHERE source_type=$1 AND source_event_id=$2 FOR UPDATE', [value.sourceType,value.sourceEventId]);
        return { inserted: false, row: existing.rows[0] || null };
    }

    async lockProgress(userId, achievementId) {
        await this.client.query(`
            INSERT INTO streamer_achievement_progress(user_id,achievement_id)
            VALUES($1,$2) ON CONFLICT (user_id,achievement_id) DO NOTHING
        `, [userId,achievementId]);
        const result = await this.client.query('SELECT * FROM streamer_achievement_progress WHERE user_id=$1 AND achievement_id=$2 FOR UPDATE', [userId,achievementId]);
        return result.rows[0];
    }

    async updateProgress(row, progress, keys, eventId, unlocked) {
        const result = await this.client.query(`
            UPDATE streamer_achievement_progress
            SET progress=$4,progress_keys=$5::JSONB,revision=revision+1,last_event_id=$6,
                unlocked_at=CASE WHEN $7::BOOLEAN AND unlocked_at IS NULL THEN NOW() ELSE unlocked_at END,
                updated_at=NOW()
            WHERE user_id=$1 AND achievement_id=$2 AND revision=$3 RETURNING *
        `, [row.user_id,row.achievement_id,row.revision,progress,JSON.stringify(keys),eventId,unlocked]);
        return result.rows[0] || null;
    }

    async insertUnlock(userId, achievementId, eventId) {
        const result = await this.client.query(`
            INSERT INTO streamer_achievement_unlocks(user_id,achievement_id,achievement_event_id)
            VALUES($1,$2,$3) ON CONFLICT (user_id,achievement_id) DO NOTHING RETURNING id
        `, [userId,achievementId,eventId]);
        return Boolean(result.rows[0]);
    }

    async unlocksForEvent(eventId) {
        const result = await this.client.query(`
            SELECT definition.slug FROM streamer_achievement_unlocks unlock
            JOIN streamer_achievement_definitions definition ON definition.id=unlock.achievement_id
            WHERE unlock.achievement_event_id=$1 ORDER BY definition.slug
        `, [eventId]);
        return result.rows.map((row) => row.slug);
    }

    async insertCollection(userId, itemKey, achievementSlug) {
        const inserted = await this.client.query(`
            INSERT INTO streamer_collection_holdings(user_id,item_key,source_type,source_id)
            VALUES($1,$2,'achievement',$3) ON CONFLICT (user_id,item_key) DO NOTHING RETURNING id
        `, [userId,itemKey,achievementSlug]);
        if (inserted.rows[0]) return true;
        const existing = await this.client.query('SELECT source_type,source_id FROM streamer_collection_holdings WHERE user_id=$1 AND item_key=$2', [userId,itemKey]);
        if (existing.rows[0]?.source_type !== 'achievement' || existing.rows[0]?.source_id !== achievementSlug) {
            throw new Error(`Achievement collection provenance collision: ${itemKey}`);
        }
        return false;
    }

    async archiveSeason(userId, event) {
        const row = await this.client.query('SELECT id,content_hash FROM story_content_versions WHERE campaign_id=(SELECT id FROM story_campaigns WHERE slug=$1) AND version=$2', [event.payload.season,event.payload.contentVersion || 1]);
        if (!row.rows[0]) return false;
        await this.client.query(`
            INSERT INTO streamer_season_archives(user_id,season_slug,content_version_id,state,conclusion_key,snapshot_hash,archived_at)
            VALUES($1,$2,$3,'archived',$4,$5,NOW()) ON CONFLICT (user_id,content_version_id) DO NOTHING
        `, [userId,event.payload.season,row.rows[0].id,event.payload.conclusion || null,row.rows[0].content_hash]);
        return true;
    }

    async state(userId) {
        const achievements = await this.client.query(`
            SELECT definition.*,progress.progress,progress.unlocked_at
            FROM streamer_achievement_definitions definition
            LEFT JOIN streamer_achievement_progress progress ON progress.achievement_id=definition.id AND progress.user_id=$1
            WHERE definition.lifecycle IN ('active','retired') ORDER BY definition.season NULLS LAST,definition.id
        `, [userId]);
        const collection = await this.client.query(`SELECT item_key,source_type,acquired_at,archived_at,showcase_slot FROM streamer_collection_holdings WHERE user_id=$1 ORDER BY acquired_at,id`, [userId]);
        const archives = await this.client.query(`SELECT season_slug,state,conclusion_key,archived_at FROM streamer_season_archives WHERE user_id=$1 ORDER BY id`, [userId]);
        return { achievements: achievements.rows, collection: collection.rows, archives: archives.rows };
    }

    async audit(value) {
        await this.client.query(`INSERT INTO streamer_achievement_audit(user_id,actor_username,action,source_event_id,details,request_id) VALUES($1,$2,$3,$4,$5::JSONB,$6)`,
            [value.userId,value.actorUsername,value.action,value.sourceEventId,JSON.stringify(value.details || {}),value.requestId || null]);
    }
}

module.exports = { AchievementRepository };
