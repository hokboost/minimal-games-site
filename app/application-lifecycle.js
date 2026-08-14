'use strict';

const DEFAULT_CLOCK = Object.freeze({
    setTimeout: (...args) => setTimeout(...args),
    clearTimeout: (handle) => clearTimeout(handle),
    setInterval: (...args) => setInterval(...args),
    clearInterval: (handle) => clearInterval(handle)
});

function defaultJobErrorReporter(error, { name, runNumber }) {
    console.error('Recurring lifecycle job failed', {
        job: name,
        runNumber,
        error
    });
}

function validateName(name) {
    if (typeof name !== 'string' || name.trim() !== name || name.length < 1 || name.length > 100) {
        throw new TypeError('Lifecycle component name must be a non-empty trimmed string');
    }
    return name;
}

function validateClock(clock) {
    for (const method of ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval']) {
        if (typeof clock?.[method] !== 'function') {
            throw new TypeError(`Lifecycle clock is missing ${method}()`);
        }
    }
    return clock;
}

function validateDelay(value, label, { allowZero = false } = {}) {
    if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) {
        throw new TypeError(`${label} must be ${allowZero ? 'a non-negative' : 'a positive'} integer`);
    }
    return value;
}

function unrefTimer(handle, enabled) {
    if (enabled) handle?.unref?.();
    return handle;
}

function createRecurringJobComponent(name, options, clock, reportJobError) {
    const {
        run,
        intervalMs,
        initialDelayMs = intervalMs,
        runOnStart = false,
        unref = true
    } = options || {};

    if (typeof run !== 'function') throw new TypeError(`Recurring job ${name} requires run()`);
    validateDelay(intervalMs, `Recurring job ${name} intervalMs`);
    validateDelay(initialDelayMs, `Recurring job ${name} initialDelayMs`, { allowZero: true });
    if (typeof runOnStart !== 'boolean') {
        throw new TypeError(`Recurring job ${name} runOnStart must be boolean`);
    }
    if (typeof unref !== 'boolean') {
        throw new TypeError(`Recurring job ${name} unref must be boolean`);
    }

    let active = false;
    let initialTimer = null;
    let intervalTimer = null;
    let runningPromise = null;
    let runNumber = 0;

    const execute = async ({ propagate = false } = {}) => {
        if (!active) return undefined;
        if (runningPromise) {
            // The invocation that created runningPromise owns error reporting.
            // Overlapping timer ticks only wait for it and must never surface a
            // second unhandled rejection.
            await runningPromise.catch(() => {});
            return undefined;
        }
        runNumber += 1;
        const currentRun = runNumber;
        runningPromise = Promise.resolve().then(() => run({ name, runNumber: currentRun }));
        try {
            await runningPromise;
        } catch (error) {
            if (propagate) throw error;
            await reportJobError(error, { name, runNumber: currentRun });
        } finally {
            runningPromise = null;
        }
        return undefined;
    };

    const startInterval = () => {
        if (!active || intervalTimer) return;
        intervalTimer = unrefTimer(clock.setInterval(() => {
            void execute();
        }, intervalMs), unref);
    };

    const schedule = () => {
        if (!active) return;
        if (initialDelayMs === 0) {
            startInterval();
            return;
        }
        initialTimer = unrefTimer(clock.setTimeout(() => {
            initialTimer = null;
            void execute().finally(() => {
                if (active) startInterval();
            });
        }, initialDelayMs), unref);
    };

    return {
        async start() {
            if (active) return;
            active = true;
            try {
                if (runOnStart) await execute({ propagate: true });
                schedule();
            } catch (error) {
                active = false;
                if (initialTimer) clock.clearTimeout(initialTimer);
                if (intervalTimer) clock.clearInterval(intervalTimer);
                initialTimer = null;
                intervalTimer = null;
                throw error;
            }
        },

        async stop() {
            active = false;
            if (initialTimer) clock.clearTimeout(initialTimer);
            if (intervalTimer) clock.clearInterval(intervalTimer);
            initialTimer = null;
            intervalTimer = null;
            if (runningPromise) await runningPromise.catch(() => {});
        }
    };
}

class ApplicationLifecycle {
    constructor({ clock = DEFAULT_CLOCK, onJobError = defaultJobErrorReporter } = {}) {
        this.clock = validateClock(clock);
        if (typeof onJobError !== 'function') {
            throw new TypeError('onJobError must be a function');
        }
        this.onJobError = onJobError;
        this.entries = new Map();
        this.startedNames = [];
        this.state = 'idle';
        this.startPromise = null;
        this.stopPromise = null;
    }

    register(name, component) {
        return this.registerComponent(name, component);
    }

    registerComponent(name, component) {
        const normalizedName = validateName(name);
        if (this.state === 'starting' || this.state === 'running' || this.state === 'stopping') {
            throw new Error('Lifecycle components cannot be registered while the application is active');
        }
        if (this.entries.has(normalizedName)) {
            throw new Error(`Lifecycle component already registered: ${normalizedName}`);
        }
        if (typeof component?.start !== 'function' || typeof component?.stop !== 'function') {
            throw new TypeError(`Lifecycle component ${normalizedName} requires start() and stop()`);
        }
        this.entries.set(normalizedName, {
            name: normalizedName,
            start: () => component.start(),
            stop: () => component.stop()
        });
        return this;
    }

    registerRecurringJob(name, options) {
        const normalizedName = validateName(name);
        if (this.state === 'starting' || this.state === 'running' || this.state === 'stopping') {
            throw new Error('Lifecycle components cannot be registered while the application is active');
        }
        if (this.entries.has(normalizedName)) {
            throw new Error(`Lifecycle component already registered: ${normalizedName}`);
        }
        const component = createRecurringJobComponent(
            normalizedName,
            options,
            this.clock,
            (error, context) => this.#reportJobError(error, context)
        );
        return this.registerComponent(normalizedName, component);
    }

    start() {
        if (this.state === 'running') return Promise.resolve(this);
        if (this.state === 'starting') return this.startPromise;
        if (this.state === 'stopping') {
            return this.stopPromise.then(() => this.start());
        }

        this.state = 'starting';
        this.startPromise = this.#startSequentially();
        return this.startPromise;
    }

    stop() {
        if (this.state === 'idle' || this.state === 'stopped') return Promise.resolve();
        if (this.state === 'stopping') return this.stopPromise;
        if (this.state === 'starting') {
            return this.startPromise.then(
                () => this.stop(),
                () => undefined
            );
        }

        this.state = 'stopping';
        this.stopPromise = this.#stopStartedComponents();
        return this.stopPromise;
    }

    async #startSequentially() {
        this.startedNames = [];
        try {
            for (const entry of this.entries.values()) {
                // Include the current component in rollback because start() may
                // allocate a partial resource before it rejects.
                this.startedNames.push(entry.name);
                await entry.start();
            }
            this.state = 'running';
            return this;
        } catch (error) {
            const cleanupErrors = await this.#stopStartedComponents({ suppressErrors: true });
            if (cleanupErrors.length > 0 && error && typeof error === 'object') {
                try {
                    error.cleanupErrors = cleanupErrors;
                } catch {
                    // Preserve the startup failure even when it is non-extensible.
                }
            }
            throw error;
        } finally {
            this.startPromise = null;
        }
    }

    async #stopStartedComponents({ suppressErrors = false } = {}) {
        const errors = [];
        const names = this.startedNames.splice(0).reverse();
        for (const name of names) {
            const entry = this.entries.get(name);
            if (!entry) continue;
            try {
                await entry.stop();
            } catch (error) {
                errors.push(error);
            }
        }
        this.state = 'stopped';
        this.stopPromise = null;
        if (!suppressErrors && errors.length > 0) {
            throw new AggregateError(errors, 'One or more lifecycle components failed to stop');
        }
        return errors;
    }

    async #reportJobError(error, context) {
        try {
            await this.onJobError(error, context);
        } catch {
            // Error reporting must not create an unhandled recurring-job rejection.
        }
    }
}

module.exports = {
    ApplicationLifecycle
};
