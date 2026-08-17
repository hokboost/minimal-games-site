'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const { ApplicationLifecycle } = require('../app/application-lifecycle');

class FakeTimerHandle {
    constructor(id, clock) {
        this.id = id;
        this.clock = clock;
        this.unrefCalled = false;
    }

    unref() {
        this.unrefCalled = true;
        return this;
    }
}

class FakeClock {
    constructor() {
        this.now = 0;
        this.nextId = 1;
        this.timers = new Map();
        this.handles = [];
    }

    setTimeout(callback, delay) {
        return this.#schedule('timeout', callback, delay);
    }

    clearTimeout(handle) {
        this.#clear(handle);
    }

    setInterval(callback, delay) {
        return this.#schedule('interval', callback, delay);
    }

    clearInterval(handle) {
        this.#clear(handle);
    }

    #schedule(type, callback, delay) {
        const id = this.nextId++;
        const handle = new FakeTimerHandle(id, this);
        this.handles.push(handle);
        this.timers.set(id, {
            callback,
            delay,
            dueAt: this.now + delay,
            handle,
            type
        });
        return handle;
    }

    #clear(handle) {
        this.timers.delete(handle?.id);
    }

    async advance(milliseconds) {
        const target = this.now + milliseconds;
        while (true) {
            const due = [...this.timers.values()]
                .filter((timer) => timer.dueAt <= target)
                .sort((left, right) => left.dueAt - right.dueAt || left.handle.id - right.handle.id)[0];
            if (!due) break;

            this.now = due.dueAt;
            if (due.type === 'timeout') {
                this.timers.delete(due.handle.id);
            } else if (this.timers.has(due.handle.id)) {
                due.dueAt += due.delay;
            }
            due.callback();
            await this.flushMicrotasks();
        }
        this.now = target;
        await this.flushMicrotasks();
    }

    async flushMicrotasks() {
        for (let index = 0; index < 8; index += 1) await Promise.resolve();
    }
}

test('application lifecycle starts sequentially, stops in reverse, and is idempotent', async () => {
    const lifecycle = new ApplicationLifecycle();
    const events = [];
    let releaseDatabase;
    const databaseReady = new Promise((resolve) => { releaseDatabase = resolve; });

    lifecycle.registerComponent('database', {
        async start() {
            events.push('database:start');
            await databaseReady;
        },
        async stop() {
            events.push('database:stop');
        }
    });
    lifecycle.register('http', {
        async start() {
            events.push('http:start');
        },
        async stop() {
            events.push('http:stop');
        }
    });

    const firstStart = lifecycle.start();
    const secondStart = lifecycle.start();
    assert.equal(firstStart, secondStart);
    assert.deepEqual(events, ['database:start']);
    releaseDatabase();
    await firstStart;
    await lifecycle.start();
    assert.deepEqual(events, ['database:start', 'http:start']);
    assert.equal(lifecycle.state, 'running');

    const firstStop = lifecycle.stop();
    const secondStop = lifecycle.stop();
    assert.equal(firstStop, secondStop);
    await firstStop;
    await lifecycle.stop();
    assert.deepEqual(events, [
        'database:start',
        'http:start',
        'http:stop',
        'database:stop'
    ]);
    assert.equal(lifecycle.state, 'stopped');
});

test('application lifecycle rejects duplicate names and active registration', async () => {
    const lifecycle = new ApplicationLifecycle();
    const component = { start() {}, stop() {} };
    lifecycle.registerComponent('database', component);

    assert.throws(
        () => lifecycle.registerRecurringJob('database', { run() {}, intervalMs: 10 }),
        /already registered/
    );
    assert.throws(
        () => lifecycle.registerComponent('database', component),
        /already registered/
    );

    await lifecycle.start();
    assert.throws(
        () => lifecycle.registerComponent('late-component', component),
        /cannot be registered/
    );
    await lifecycle.stop();
});

test('a failed start cleans the partial component and prior components in reverse', async () => {
    const lifecycle = new ApplicationLifecycle();
    const events = [];
    lifecycle.registerComponent('database', {
        async start() { events.push('database:start'); },
        async stop() { events.push('database:stop'); }
    });
    lifecycle.registerComponent('event-bus', {
        async start() {
            events.push('event-bus:start');
            throw new Error('event bus unavailable');
        },
        async stop() { events.push('event-bus:stop'); }
    });
    lifecycle.registerComponent('http', {
        async start() { events.push('http:start'); },
        async stop() { events.push('http:stop'); }
    });

    await assert.rejects(lifecycle.start(), /event bus unavailable/);
    assert.deepEqual(events, [
        'database:start',
        'event-bus:start',
        'event-bus:stop',
        'database:stop'
    ]);
    assert.equal(lifecycle.state, 'stopped');
    await lifecycle.stop();
});

test('stop attempts every component even when one cleanup fails', async () => {
    const lifecycle = new ApplicationLifecycle();
    const events = [];
    lifecycle.registerComponent('database', {
        async start() { events.push('database:start'); },
        async stop() { events.push('database:stop'); }
    });
    lifecycle.registerComponent('http', {
        async start() { events.push('http:start'); },
        async stop() {
            events.push('http:stop');
            throw new Error('http close failed');
        }
    });

    await lifecycle.start();
    await assert.rejects(lifecycle.stop(), (error) => (
        error instanceof AggregateError
        && error.errors.some((item) => item.message === 'http close failed')
    ));
    assert.deepEqual(events, [
        'database:start',
        'http:start',
        'http:stop',
        'database:stop'
    ]);
    assert.equal(lifecycle.state, 'stopped');
});

test('recurring jobs honor initial delay, interval, unref, errors, and stop', async () => {
    const clock = new FakeClock();
    const errors = [];
    const runs = [];
    const lifecycle = new ApplicationLifecycle({
        clock,
        onJobError(error, context) {
            errors.push({ message: error.message, ...context });
        }
    });
    lifecycle.registerRecurringJob('maintenance', {
        initialDelayMs: 5,
        intervalMs: 10,
        unref: true,
        async run({ runNumber }) {
            runs.push(runNumber);
            if (runNumber === 2) throw new Error('transient maintenance failure');
        }
    });

    await lifecycle.start();
    assert.equal(runs.length, 0);
    assert.equal(clock.handles[0].unrefCalled, true);
    await clock.advance(4);
    assert.equal(runs.length, 0);
    await clock.advance(1);
    assert.deepEqual(runs, [1]);
    assert.equal(clock.handles[1].unrefCalled, true);
    await clock.advance(10);
    assert.deepEqual(runs, [1, 2]);
    assert.deepEqual(errors, [{
        message: 'transient maintenance failure',
        name: 'maintenance',
        runNumber: 2
    }]);
    await clock.advance(10);
    assert.deepEqual(runs, [1, 2, 3]);

    await lifecycle.stop();
    await clock.advance(100);
    assert.deepEqual(runs, [1, 2, 3]);
});

test('runOnStart is awaited before the next component starts', async () => {
    const clock = new FakeClock();
    const lifecycle = new ApplicationLifecycle({ clock });
    const events = [];
    lifecycle.registerRecurringJob('recovery', {
        runOnStart: true,
        initialDelayMs: 20,
        intervalMs: 50,
        async run({ runNumber }) {
            events.push(`recovery:${runNumber}`);
            await Promise.resolve();
        }
    });
    lifecycle.registerComponent('http', {
        async start() { events.push('http:start'); },
        async stop() { events.push('http:stop'); }
    });

    await lifecycle.start();
    assert.deepEqual(events, ['recovery:1', 'http:start']);
    await clock.advance(20);
    assert.deepEqual(events, ['recovery:1', 'http:start', 'recovery:2']);
    await lifecycle.stop();
});

test('recurring jobs never overlap and stop waits for the active run', async () => {
    const clock = new FakeClock();
    const lifecycle = new ApplicationLifecycle({ clock });
    let releaseRun;
    let runs = 0;
    lifecycle.registerRecurringJob('outbox', {
        initialDelayMs: 0,
        intervalMs: 5,
        unref: false,
        run() {
            runs += 1;
            return new Promise((resolve) => { releaseRun = resolve; });
        }
    });

    await lifecycle.start();
    await clock.advance(5);
    assert.equal(runs, 1);
    await clock.advance(20);
    assert.equal(runs, 1);

    let stopped = false;
    const stopping = lifecycle.stop().then(() => { stopped = true; });
    await clock.flushMicrotasks();
    assert.equal(stopped, false);
    releaseRun();
    await stopping;
    assert.equal(stopped, true);
    await clock.advance(20);
    assert.equal(runs, 1);
});

test('server module wires the lifecycle without starting on require', () => {
    const projectRoot = path.resolve(__dirname, '..');
    const contract = String.raw`
        const runtime = require('./server');
        if (runtime.server.listening) throw new Error('server listened during require');
        if (runtime.applicationLifecycle.state !== 'idle') {
            throw new Error('application lifecycle started during require');
        }
        if (!String(runtime.startServer).includes('applicationLifecycle.start')) {
            throw new Error('startServer does not start the application lifecycle');
        }
        if (!String(runtime.shutdown).includes('applicationLifecycle.stop')) {
            throw new Error('shutdown does not stop the application lifecycle');
        }
        const names = [...runtime.applicationLifecycle.entries.keys()];
        for (const required of [
            'database-pool',
            'session-store',
            'paid-action-concurrency-guard',
            'database-schema',
            'streamer-world-runtime-readiness',
            'socket-event-bus',
            'session-cleanup',
            'ip-cleanup',
            'security-cleanup',
            'socket-session-revalidation',
            'wish-auto-send',
            'idempotency-recovery',
            'database-maintenance',
            'gift-stuck-task-monitor',
            'gift-delivery-outbox-drain',
            'gift-delivery-outbox',
            'http-server'
        ]) {
            if (!names.includes(required)) throw new Error('missing lifecycle entry: ' + required);
        }
        if (names.at(-1) !== 'http-server') {
            throw new Error('HTTP server must start last and stop first');
        }
    `;
    const result = spawnSync(process.execPath, ['-e', contract], {
        cwd: projectRoot,
        encoding: 'utf8',
        env: { ...process.env, NODE_ENV: 'development' },
        // The repository's generated bilingual content makes a cold module load on
        // mounted Windows workspaces materially slower than an in-memory unit test.
        // This remains a no-I/O contract check; give module loading, not startup, room.
        timeout: 90 * 1000
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
});
