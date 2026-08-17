'use strict';

function number(value) {
    return value === null || value === undefined ? null : Number(value);
}

class RewardCatalogRepository {
    constructor({ pool }) {
        if (!pool?.connect || !pool?.query) throw new TypeError('RewardCatalogRepository requires pool');
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

    async seedCatalog(client, pack, hashes) {
        for (const item of pack.items) {
            let itemRow = (await client.query(`INSERT INTO reward_catalog_items(slug) VALUES($1)
                ON CONFLICT(slug) DO NOTHING RETURNING id`, [item.slug])).rows[0];
            if (!itemRow) itemRow = (await client.query(`SELECT id FROM reward_catalog_items WHERE slug=$1`,
                [item.slug])).rows[0];
            const visibilityKey = ['story_unlock', 'achievement_unlock'].includes(item.visibility.type)
                ? item.visibility.key : null;
            const visibilityStart = item.visibility.type === 'season_window' ? item.visibility.startsAt : null;
            const visibilityEnd = item.visibility.type === 'season_window' ? item.visibility.endsAt : null;
            const values = [number(itemRow.id), pack.catalogVersion, 1, hashes.get(item.slug), item.kind,
                item.titleZh, item.titleEn, item.descriptionZh, item.descriptionEn, item.artKey,
                item.pointsPrice, item.exposureValue, item.providerGiftType || null, item.stockLimit,
                item.perUserLimit, item.cooldownHours, item.approval, item.visibility.type,
                visibilityKey, visibilityStart, visibilityEnd, item.ownerGrantOnly === true];
            const inserted = await client.query(`INSERT INTO reward_catalog_versions(item_id,catalog_version,version,
                content_hash,kind,title_zh,title_en,description_zh,description_en,art_key,points_price,
                exposure_value,provider_gift_type,stock_limit,per_user_limit,cooldown_hours,approval_policy,
                visibility_type,visibility_key,visibility_start,visibility_end,owner_grant_only)
                VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
                ON CONFLICT(item_id,version) DO NOTHING RETURNING id`, values);
            if (inserted.rowCount === 0) {
                const existing = (await client.query(`SELECT content_hash,catalog_version,kind,title_zh,title_en,
                    description_zh,description_en,art_key,points_price,exposure_value,provider_gift_type,
                    stock_limit,per_user_limit,cooldown_hours,approval_policy,visibility_type,visibility_key,
                    visibility_start,visibility_end,
                    owner_grant_only FROM reward_catalog_versions WHERE item_id=$1 AND version=1`, [itemRow.id])).rows[0];
                const expected = [hashes.get(item.slug), pack.catalogVersion, item.kind, item.titleZh, item.titleEn,
                    item.descriptionZh, item.descriptionEn, item.artKey, item.pointsPrice, item.exposureValue,
                    item.providerGiftType || null, item.stockLimit, item.perUserLimit, item.cooldownHours,
                    item.approval, item.visibility.type, visibilityKey, visibilityStart, visibilityEnd,
                    item.ownerGrantOnly === true];
                const actual = [existing.content_hash, existing.catalog_version, existing.kind, existing.title_zh,
                    existing.title_en, existing.description_zh, existing.description_en, existing.art_key,
                    number(existing.points_price), number(existing.exposure_value), existing.provider_gift_type,
                    number(existing.stock_limit), number(existing.per_user_limit), number(existing.cooldown_hours),
                    existing.approval_policy, existing.visibility_type, existing.visibility_key,
                    existing.visibility_start?.toISOString?.() || existing.visibility_start,
                    existing.visibility_end?.toISOString?.() || existing.visibility_end,
                    existing.owner_grant_only === true];
                if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Reward catalog seed collision');
            }
        }
        for (const budget of pack.budgets) {
            const inserted = await client.query(`INSERT INTO reward_catalog_budgets(budget_key,scope,daily_limit)
                VALUES($1,$2,$3) ON CONFLICT(budget_key) DO NOTHING RETURNING id`,
            [budget.key, budget.scope, budget.dailyLimit]);
            if (!inserted.rowCount) {
                const existing = (await client.query(`SELECT scope,daily_limit FROM reward_catalog_budgets
                    WHERE budget_key=$1`, [budget.key])).rows[0];
                if (!existing || existing.scope !== budget.scope || number(existing.daily_limit) !== budget.dailyLimit) {
                    throw new Error('Reward budget seed collision');
                }
            }
        }
    }

    async lockAccounts(client, usernames) {
        const names = [...new Set(usernames.filter(Boolean))];
        const result = await client.query(`SELECT u.id,u.username,u.balance,u.bilibili_room_id,u.is_admin,
            u.authorized,u.deactivated,u.account_locked,p.live_interaction_opt_in,p.timezone,p.communication_style
            FROM users u LEFT JOIN creator_profiles p ON p.user_id=u.id
            WHERE u.username=ANY($1::TEXT[]) ORDER BY u.id FOR UPDATE OF u`, [names]);
        return new Map(result.rows.map(row => [row.username, row]));
    }

    async accountIdentity(username) {
        return (await this.pool.query(`SELECT id,username,is_admin,authorized,deactivated,account_locked
            FROM users WHERE username=$1`, [username])).rows[0] || null;
    }

    async creatorBoundaries(client, userId, ownerUserId) {
        const [preferences, quiet, windows, room, report] = await Promise.all([
            client.query(`SELECT preference_type,preference_key,preference_value FROM creator_preferences
                WHERE user_id=$1`, [userId]),
            client.query(`SELECT weekday,start_minute,end_minute,enabled FROM creator_quiet_hours
                WHERE user_id=$1 ORDER BY weekday`, [userId]),
            client.query(`SELECT weekday,start_minute,end_minute,interaction_mode,enabled
                FROM creator_interaction_windows WHERE user_id=$1 ORDER BY weekday`, [userId]),
            client.query(`SELECT creator_muted_until FROM live_interactions WHERE creator_user_id=$1
                AND owner_user_id=$2 AND status='active' ORDER BY id DESC LIMIT 1`, [userId, ownerUserId]),
            client.query(`SELECT report.status,report.creator_reconsented_at
                FROM live_interaction_reports report
                JOIN live_interactions room ON room.id=report.interaction_id
                WHERE room.creator_user_id=$1 AND room.owner_user_id=$2
                  AND (report.status IN('open','reviewing')
                    OR (report.status IN('resolved','dismissed')
                      AND report.creator_reconsented_at IS NULL))
                ORDER BY report.created_at DESC,report.id DESC LIMIT 1`, [userId, ownerUserId])
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
            quietHours: quiet.rows.map(row => ({ weekday: number(row.weekday), startMinute: number(row.start_minute),
                endMinute: number(row.end_minute), enabled: row.enabled === true })),
            interactionWindows: windows.rows.map(row => ({ weekday: number(row.weekday),
                startMinute: number(row.start_minute), endMinute: number(row.end_minute),
                mode: row.interaction_mode, enabled: row.enabled === true })),
            room: room.rows[0] ? { mutedUntil: room.rows[0].creator_muted_until } : null,
            report: report.rows[0] ? { status: report.rows[0].status,
                creatorReconsentedAt: report.rows[0].creator_reconsented_at } : null
        };
    }

    async listCatalog(username) {
        const result = await this.pool.query(`SELECT version.*,item.slug,
            (SELECT COUNT(*) FROM reward_orders orders WHERE orders.catalog_version_id=version.id
                AND orders.status IN('approved','claimed')) AS stock_used,
            (SELECT COUNT(*) FROM reward_orders orders JOIN users account ON account.id=orders.user_id
                WHERE account.username=$1 AND orders.catalog_version_id=version.id
                AND orders.status IN('approved','claimed')) AS user_item_count,
            (SELECT MAX(approved_at + make_interval(hours=>version.cooldown_hours)) FROM reward_orders orders
                JOIN users account ON account.id=orders.user_id WHERE account.username=$1
                AND orders.catalog_version_id=version.id AND orders.status IN('approved','claimed')) AS cooldown_until,
            (SELECT COUNT(*) FROM reward_orders orders JOIN users account ON account.id=orders.user_id
                WHERE account.username=$1 AND orders.catalog_version_id=version.id
                AND orders.status IN('submitted','pending_approval')) AS pending_count,
            CASE
              WHEN version.visibility_type='story_unlock' THEN EXISTS(
                SELECT 1 FROM story_unlock_intents unlock JOIN users account ON account.id=unlock.user_id
                WHERE account.username=$1 AND unlock.unlock_type='reward_catalog_visibility'
                  AND unlock.unlock_key=CASE version.visibility_key
                    WHEN 'reward.story-lantern' THEN 'tides.storm-label'
                    ELSE version.visibility_key END
                  AND unlock.status IN('visible','consumed')
                  AND unlock.progression_scope='account_entitlement'
                  AND unlock.economic_eligible=TRUE
                  AND unlock.provenance_type IN('episode_first_clear','season_completion')
                  AND unlock.published_binding_hash IS NOT NULL)
              WHEN version.visibility_type='achievement_unlock' THEN EXISTS(
                SELECT 1 FROM streamer_achievement_unlocks achievement_unlock
                JOIN users account ON account.id=achievement_unlock.user_id
                JOIN streamer_achievement_definitions definition
                  ON definition.id=achievement_unlock.achievement_id
                WHERE account.username=$1 AND (
                  version.visibility_key='achievement:' || definition.slug
                  OR (definition.event_type='game.run.completed'
                    AND version.visibility_key='achievement:game:' || (definition.filters->>'gameId'))))
              ELSE TRUE
            END AS has_unlock
            FROM reward_catalog_versions version JOIN reward_catalog_items item ON item.id=version.item_id
            WHERE version.lifecycle='active' ORDER BY version.points_price,item.slug`, [username]);
        return result.rows;
    }

    async lockCatalogVersion(client, id) {
        return (await client.query(`SELECT version.*,item.slug FROM reward_catalog_versions version
            JOIN reward_catalog_items item ON item.id=version.item_id WHERE version.id=$1 FOR UPDATE OF version`, [id])).rows[0] || null;
    }

    async lockCatalogVersionBySlug(client, slug) {
        return (await client.query(`SELECT version.*,item.slug FROM reward_catalog_versions version
            JOIN reward_catalog_items item ON item.id=version.item_id
            WHERE item.slug=$1 AND version.lifecycle='active' FOR UPDATE OF version`, [slug])).rows[0] || null;
    }

    async eligibilityFacts(client, userId, versionId, excludeOrderId = null) {
        const result = await client.query(`SELECT
            COUNT(*) FILTER(WHERE user_id=$1 AND status IN('approved','claimed')) AS user_item_count,
            COUNT(*) FILTER(WHERE user_id=$1 AND status IN('submitted','pending_approval')) AS pending_count,
            COUNT(*) FILTER(WHERE status IN('approved','claimed')) AS stock_used,
            MAX(approved_at) FILTER(WHERE user_id=$1 AND status IN('approved','claimed')) AS last_approved
            FROM reward_orders WHERE catalog_version_id=$2 AND ($3::UUID IS NULL OR id<>$3)`,
        [userId, versionId, excludeOrderId]);
        return result.rows[0];
    }

    async hasVisibilityUnlock(client, userId, type, key) {
        if (!key) return true;
        if (type === 'achievement_unlock') {
            return (await client.query(`SELECT EXISTS(
                SELECT 1 FROM streamer_achievement_unlocks achievement_unlock
                JOIN streamer_achievement_definitions definition
                  ON definition.id=achievement_unlock.achievement_id
                WHERE achievement_unlock.user_id=$1 AND (
                  $2='achievement:' || definition.slug
                  OR (definition.event_type='game.run.completed'
                    AND $2='achievement:game:' || (definition.filters->>'gameId')))) AS allowed`,
            [userId, key])).rows[0]?.allowed === true;
        }
        // The published v1 reward key predates the authored Season Two
        // milestone key. Keep this explicit compatibility mapping instead of
        // rewriting either immutable content version.
        const storyKey = key === 'reward.story-lantern' ? 'tides.storm-label' : key;
        return (await client.query(`SELECT EXISTS(SELECT 1 FROM story_unlock_intents WHERE user_id=$1
            AND unlock_type='reward_catalog_visibility' AND unlock_key=$2
            AND status IN('visible','consumed')
            AND progression_scope='account_entitlement' AND economic_eligible=TRUE
            AND provenance_type IN('episode_first_clear','season_completion')
            AND published_binding_hash IS NOT NULL) AS allowed`, [userId, storyKey])).rows[0]?.allowed === true;
    }

    async reserveBudgets(client, userId, amount, dateKey) {
        if (amount === 0) return;
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended('streamer-reward-budget',0))");
        const budgets = await client.query(`SELECT id,scope,daily_limit FROM reward_catalog_budgets
            WHERE lifecycle='active' ORDER BY id FOR UPDATE`);
        for (const budget of budgets.rows) {
            const subject = budget.scope === 'user' ? userId : 0;
            await client.query(`INSERT INTO reward_budget_counters(budget_id,period_start,subject_user_id,used_amount)
                VALUES($1,$2,$3,0) ON CONFLICT DO NOTHING`, [budget.id, dateKey, subject]);
            const updated = await client.query(`UPDATE reward_budget_counters counter SET used_amount=used_amount+$4,
                revision=revision+1,updated_at=NOW() FROM reward_catalog_budgets budget
                WHERE counter.budget_id=$1 AND counter.period_start=$2 AND counter.subject_user_id=$3
                AND budget.id=counter.budget_id AND counter.used_amount+$4<=budget.daily_limit RETURNING counter.used_amount`,
            [budget.id, dateKey, subject, amount]);
            if (updated.rowCount !== 1) {
                const error = new Error('Reward budget exceeded');
                error.code = 'REWARD_BUDGET_EXCEEDED';
                throw error;
            }
        }
    }

    async findCommand(client, actorUserId, commandId) {
        return (await client.query(`SELECT semantic_hash,response_status,response_body FROM reward_commands
            WHERE actor_user_id=$1 AND command_id=$2`, [actorUserId, commandId])).rows[0] || null;
    }

    async findSourceOrder(client, userId, sourceType, sourceKey) {
        return (await client.query(`SELECT orders.*,version.kind,item.slug FROM reward_orders orders
            JOIN reward_catalog_versions version ON version.id=orders.catalog_version_id
            JOIN reward_catalog_items item ON item.id=version.item_id
            WHERE orders.user_id=$1 AND orders.source_type=$2 AND orders.source_key=$3
            FOR UPDATE OF orders`, [userId, sourceType, sourceKey])).rows[0] || null;
    }

    async saveCommand(client, values) {
        await client.query(`INSERT INTO reward_commands(actor_user_id,command_id,command_type,semantic_hash,
            response_status,response_body) VALUES($1,$2,$3,$4,$5,$6::JSONB)`, [values.actorUserId,
            values.commandId, values.commandType, values.semanticHash, values.status, JSON.stringify(values.body)]);
    }

    async createOrder(client, values) {
        return (await client.query(`INSERT INTO reward_orders(id,user_id,catalog_version_id,source_type,source_key,
            grant_template_key,created_by_user_id,status,points_cost,exposure_value,semantic_hash,notification_policy,approved_at)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8::VARCHAR(24),$9,$10,$11,$12,
                CASE WHEN $8::VARCHAR(24)='approved' THEN NOW() END) RETURNING *`,
        [values.id, values.userId, values.catalogVersionId, values.sourceType, values.sourceKey,
            values.grantTemplateKey || null, values.createdByUserId, values.status, values.pointsCost,
            values.exposureValue, values.semanticHash, values.notificationPolicy || 'normal'])).rows[0];
    }

    async readOrderIdentity(client, orderId) {
        return (await client.query(`SELECT account.username,orders.created_by_user_id FROM reward_orders orders
            JOIN users account ON account.id=orders.user_id WHERE orders.id=$1`, [orderId])).rows[0] || null;
    }

    async lockOrder(client, orderId, username = null) {
        const params = [orderId];
        let owner = '';
        if (username) {
            params.push(username);
            owner = 'AND account.username=$2';
        }
        return (await client.query(`SELECT orders.*,version.id AS version_id,version.catalog_version,
            version.lifecycle,version.kind,version.provider_gift_type,version.title_zh,version.title_en,
            version.points_price,version.exposure_value AS catalog_exposure_value,version.stock_limit,
            version.per_user_limit,version.cooldown_hours,version.approval_policy,version.visibility_type,
            version.visibility_key,version.owner_grant_only,item.slug,account.username FROM reward_orders orders
            JOIN reward_catalog_versions version ON version.id=orders.catalog_version_id
            JOIN reward_catalog_items item ON item.id=version.item_id
            JOIN users account ON account.id=orders.user_id WHERE orders.id=$1 ${owner} FOR UPDATE OF orders`, params)).rows[0] || null;
    }

    async transitionOrder(client, orderId, status, actorUserId = null) {
        return (await client.query(`UPDATE reward_orders SET status=$2::VARCHAR(24),updated_at=NOW(),
            reviewer_user_id=CASE WHEN $2::VARCHAR(24) IN('approved','rejected') THEN $3 ELSE reviewer_user_id END,
            approved_at=CASE WHEN $2::VARCHAR(24)='approved' THEN NOW() ELSE approved_at END,
            rejected_at=CASE WHEN $2::VARCHAR(24)='rejected' THEN NOW() ELSE rejected_at END,
            claimed_at=CASE WHEN $2::VARCHAR(24)='claimed' THEN NOW() ELSE claimed_at END,
            cancelled_at=CASE WHEN $2::VARCHAR(24)='cancelled' THEN NOW() ELSE cancelled_at END,
            revoked_at=CASE WHEN $2::VARCHAR(24)='revoked' THEN NOW() ELSE revoked_at END
            WHERE id=$1 RETURNING *`, [orderId, status, actorUserId])).rows[0];
    }

    async appendOrderEvent(client, values) {
        const parent = await client.query(`SELECT id FROM reward_orders
            WHERE id=$1 FOR UPDATE`, [values.orderId]);
        if (parent.rowCount !== 1) {
            const error = new Error('Reward order not found');
            error.code = 'REWARD_ORDER_NOT_FOUND';
            throw error;
        }
        const sequence = number((await client.query(`SELECT COALESCE(MAX(sequence),0)+1 AS sequence
            FROM reward_order_events WHERE order_id=$1`, [values.orderId])).rows[0].sequence);
        await client.query(`INSERT INTO reward_order_events(event_id,order_id,sequence,event_type,actor_user_id,details)
            VALUES($1,$2,$3,$4,$5,$6::JSONB)`, [values.eventId, values.orderId, sequence,
            values.eventType, values.actorUserId || null, JSON.stringify(values.details || {})]);
        return sequence;
    }

    async createGrant(client, orderId, userId) {
        return (await client.query(`INSERT INTO reward_inventory_grants(order_id,user_id,status)
            VALUES($1,$2,'available') RETURNING *`, [orderId, userId])).rows[0];
    }

    async lockGrant(client, orderId) {
        return (await client.query(`SELECT * FROM reward_inventory_grants WHERE order_id=$1 FOR UPDATE`, [orderId])).rows[0] || null;
    }

    async claimProviderGrant(client, values) {
        const inventory = (await client.query(`INSERT INTO wish_inventory(username,gift_type,gift_name,bilibili_gift_id,
            status,expires_at,source_type,source_batch_id,batch_order,batch_value)
            VALUES($1,$2,$3,$4,'stored','infinity','reward_catalog',$5,1,$6) RETURNING id`,
        [values.username, values.giftType, values.giftName, values.providerGiftId,
            `reward-order:${values.orderId}`, values.exposureValue])).rows[0];
        await client.query(`UPDATE reward_inventory_grants SET status='claimed',wish_inventory_id=$2,
            claimed_at=NOW() WHERE order_id=$1 AND status='available'`, [values.orderId, inventory.id]);
        return number(inventory.id);
    }

    async claimAsset(client, values) {
        const inserted = await client.query(`INSERT INTO reward_user_assets(user_id,asset_type,asset_key,source_order_id)
            VALUES($1,$2,$3,$4) ON CONFLICT(user_id,asset_type,asset_key) DO NOTHING RETURNING id`,
        [values.userId, values.kind, values.slug, values.orderId]);
        if (inserted.rowCount !== 1) {
            const error = new Error('Reward asset already owned');
            error.code = 'REWARD_ASSET_OWNED';
            throw error;
        }
    }

    async revokeGrant(client, orderId) {
        const result = await client.query(`UPDATE reward_inventory_grants SET status='revoked',revoked_at=NOW()
            WHERE order_id=$1 AND status='available' RETURNING id`, [orderId]);
        return result.rowCount === 1;
    }

    async upsertWishlist(client, userId, values) {
        return (await client.query(`INSERT INTO reward_wishlists(user_id,catalog_version_id,target_quantity,priority)
            VALUES($1,$2,$3,$4) ON CONFLICT(user_id,catalog_version_id) DO UPDATE
            SET target_quantity=EXCLUDED.target_quantity,priority=EXCLUDED.priority,revision=reward_wishlists.revision+1,
                updated_at=NOW() RETURNING *`, [userId, values.catalogVersionId,
            values.targetQuantity, values.priority])).rows[0];
    }

    async state(username, { limit = 30, offset = 0 } = {}) {
        const [orders, count, wishlist, assets] = await Promise.all([
            this.pool.query(`SELECT orders.id,orders.source_type,orders.status,orders.points_cost,
                orders.notification_policy,orders.created_at,orders.approved_at,orders.claimed_at,
                item.slug,version.kind,version.title_zh,version.title_en,grant.wish_inventory_id,
                inventory.status AS inventory_status,inventory.gift_exchange_id,
                exchange.delivery_status,exchange.failure_reason
                FROM reward_orders orders JOIN users account ON account.id=orders.user_id
                JOIN reward_catalog_versions version ON version.id=orders.catalog_version_id
                JOIN reward_catalog_items item ON item.id=version.item_id
                LEFT JOIN reward_inventory_grants grant ON grant.order_id=orders.id
                LEFT JOIN wish_inventory inventory ON inventory.id=grant.wish_inventory_id
                LEFT JOIN gift_exchanges exchange ON exchange.id=inventory.gift_exchange_id
                WHERE account.username=$1 ORDER BY orders.created_at DESC,orders.id LIMIT $2 OFFSET $3`,
            [username, limit, offset]),
            this.pool.query(`SELECT COUNT(*) AS total FROM reward_orders orders JOIN users account
                ON account.id=orders.user_id WHERE account.username=$1`, [username]),
            this.pool.query(`SELECT list.catalog_version_id,list.target_quantity,list.priority,list.revision,
                item.slug,version.*,version.id AS catalog_version_id,
                (SELECT COUNT(*) FROM reward_orders usage WHERE usage.catalog_version_id=version.id
                  AND usage.status IN('approved','claimed')) AS stock_used,
                (SELECT COUNT(*) FROM reward_orders usage WHERE usage.catalog_version_id=version.id
                  AND usage.user_id=account.id AND usage.status IN('approved','claimed')) AS user_item_count,
                (SELECT COUNT(*) FROM reward_orders usage WHERE usage.catalog_version_id=version.id
                  AND usage.user_id=account.id AND usage.status IN('submitted','pending_approval')) AS pending_count,
                (SELECT MAX(approved_at + make_interval(hours=>version.cooldown_hours))
                  FROM reward_orders usage WHERE usage.catalog_version_id=version.id
                    AND usage.user_id=account.id AND usage.status IN('approved','claimed')) AS cooldown_until,
                CASE
                  WHEN version.visibility_type='story_unlock' THEN EXISTS(
                    SELECT 1 FROM story_unlock_intents unlock WHERE unlock.user_id=account.id
                      AND unlock.unlock_type='reward_catalog_visibility'
                      AND unlock.unlock_key=CASE version.visibility_key
                        WHEN 'reward.story-lantern' THEN 'tides.storm-label'
                        ELSE version.visibility_key END
                      AND unlock.status IN('visible','consumed')
                      AND unlock.progression_scope='account_entitlement'
                      AND unlock.economic_eligible=TRUE
                      AND unlock.provenance_type IN('episode_first_clear','season_completion')
                      AND unlock.published_binding_hash IS NOT NULL)
                  WHEN version.visibility_type='achievement_unlock' THEN EXISTS(
                    SELECT 1 FROM streamer_achievement_unlocks achievement_unlock
                    JOIN streamer_achievement_definitions definition
                      ON definition.id=achievement_unlock.achievement_id
                    WHERE achievement_unlock.user_id=account.id AND (
                      version.visibility_key='achievement:' || definition.slug
                      OR (definition.event_type='game.run.completed'
                        AND version.visibility_key='achievement:game:' || (definition.filters->>'gameId'))))
                  ELSE TRUE
                END AS has_unlock
                FROM reward_wishlists list JOIN users account ON account.id=list.user_id
                JOIN reward_catalog_versions version ON version.id=list.catalog_version_id
                JOIN reward_catalog_items item ON item.id=version.item_id WHERE account.username=$1
                ORDER BY list.priority,list.updated_at DESC`, [username]),
            this.pool.query(`SELECT assets.asset_type,assets.asset_key,assets.acquired_at FROM reward_user_assets assets
                JOIN users account ON account.id=assets.user_id WHERE account.username=$1 ORDER BY assets.acquired_at DESC`, [username])
        ]);
        return { orders: orders.rows, total: number(count.rows[0]?.total || 0), wishlist: wishlist.rows, assets: assets.rows };
    }

    async pendingReview(limit = 50) {
        return (await this.pool.query(`SELECT orders.id,orders.created_at,orders.points_cost,orders.exposure_value,
            account.username,item.slug,version.title_zh,version.title_en,orders.source_type,orders.grant_template_key
            FROM reward_orders orders JOIN users account ON account.id=orders.user_id
            JOIN reward_catalog_versions version ON version.id=orders.catalog_version_id
            JOIN reward_catalog_items item ON item.id=version.item_id
            WHERE orders.status='pending_approval' ORDER BY orders.created_at LIMIT $1`, [limit])).rows;
    }

    async audit(client, values) {
        await client.query(`INSERT INTO reward_audit_log(order_id,actor_user_id,action,request_id,details)
            VALUES($1,$2,$3,$4,$5::JSONB)`, [values.orderId || null, values.actorUserId || null,
            values.action, values.requestId || null, JSON.stringify(values.details || {})]);
    }

    async appendRewardInbox(client, values) {
        const inserted = await client.query(`INSERT INTO creator_inbox_messages(user_id,sender_type,sender_username,
            message_type,dedupe_key,title_zh,title_en,body_zh,body_en,action_path,metadata)
            VALUES($1,'owner',$2,'reward_status',$3,$4,$5,$6,$7,'/creator-rewards',$8::JSONB)
            ON CONFLICT(user_id,dedupe_key) DO NOTHING RETURNING id`, [values.userId, values.ownerUsername,
            `reward:${values.orderId}`, values.titleZh, values.titleEn, values.bodyZh, values.bodyEn,
            JSON.stringify({ orderId: values.orderId, templateKey: values.templateKey })]);
        return inserted.rowCount === 1;
    }
}

module.exports = { RewardCatalogRepository };
