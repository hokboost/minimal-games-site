'use strict';

const crypto = require('node:crypto');

const CHANNEL = 'minimal_games_socket_events';
const MAX_PAYLOAD_BYTES = 7500;

class PostgresEventBus {
    constructor(pool, onEvent) {
        if (!pool || typeof pool.connect !== 'function' || typeof pool.query !== 'function') {
            throw new TypeError('PostgreSQL event bus requires a pool');
        }
        if (typeof onEvent !== 'function') {
            throw new TypeError('PostgreSQL event bus requires an event handler');
        }
        this.pool = pool;
        this.onEvent = onEvent;
        this.instanceId = crypto.randomBytes(16).toString('hex');
        this.client = null;
        this.connecting = null;
        this.reconnectTimer = null;
        this.closed = false;
        this.ready = false;
    }

    async start() {
        if (this.closed) throw new Error('PostgreSQL event bus is closed');
        if (this.ready) return;
        if (this.connecting) return this.connecting;
        this.connecting = this.#connect().finally(() => {
            this.connecting = null;
        });
        return this.connecting;
    }

    async #connect() {
        const client = await this.pool.connect();
        if (this.closed) {
            client.release();
            return;
        }
        this.client = client;
        const lost = () => this.#handleConnectionLoss(client);
        client.on('error', lost);
        client.on('end', lost);
        client.on('notification', (notification) => {
            if (notification.channel !== CHANNEL || !notification.payload) return;
            try {
                const event = JSON.parse(notification.payload);
                if (event?.version !== 1 || event.origin === this.instanceId) return;
                Promise.resolve(this.onEvent(event.type, event.payload)).catch(() => {});
            } catch (error) {
                // Invalid payloads on this private channel are ignored.
            }
        });
        await client.query(`LISTEN ${CHANNEL}`);
        this.ready = true;
    }

    #handleConnectionLoss(client) {
        if (client !== this.client) return;
        this.ready = false;
        this.client = null;
        try {
            client.release(true);
        } catch (error) {
            // The pool may already have removed the failed connection.
        }
        if (this.closed || this.reconnectTimer) return;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.start().catch(() => this.#handleConnectionLoss(this.client));
        }, 1000);
        this.reconnectTimer.unref?.();
    }

    async publish(type, payload) {
        if (this.closed) return false;
        if (typeof type !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(type)) {
            throw new TypeError('Invalid event type');
        }
        const encoded = JSON.stringify({
            version: 1,
            origin: this.instanceId,
            type,
            payload
        });
        if (Buffer.byteLength(encoded, 'utf8') > MAX_PAYLOAD_BYTES) {
            throw new RangeError('PostgreSQL event payload is too large');
        }
        await this.pool.query('SELECT pg_notify($1, $2)', [CHANNEL, encoded]);
        return true;
    }

    isReady() {
        return this.ready;
    }

    async close() {
        this.closed = true;
        this.ready = false;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
        const client = this.client;
        this.client = null;
        if (!client) return;
        try {
            await client.query(`UNLISTEN ${CHANNEL}`);
        } catch (error) {
            // Releasing the dedicated connection is sufficient on failure.
        } finally {
            client.release();
        }
    }
}

module.exports = { PostgresEventBus };
