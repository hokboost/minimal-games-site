'use strict';

class BoundedSemaphore {
    constructor(maxQueue = 20) {
        if (!Number.isSafeInteger(maxQueue) || maxQueue < 0) {
            throw new TypeError('Semaphore queue limit must be a non-negative integer');
        }
        this.locked = false;
        this.closed = false;
        this.maxQueue = maxQueue;
        this.waiters = [];
    }

    acquire(timeoutMs = 15000) {
        if (this.closed) return Promise.reject(new Error('Semaphore is closed'));
        if (!this.locked) {
            this.locked = true;
            return Promise.resolve(this.#releaseHandle());
        }
        if (this.waiters.length >= this.maxQueue) {
            return Promise.reject(new Error('Semaphore queue is full'));
        }
        return new Promise((resolve, reject) => {
            const waiter = { resolve, reject, timer: null };
            waiter.timer = setTimeout(() => {
                const index = this.waiters.indexOf(waiter);
                if (index >= 0) this.waiters.splice(index, 1);
                reject(new Error('Semaphore acquisition timed out'));
            }, timeoutMs);
            waiter.timer.unref?.();
            this.waiters.push(waiter);
        });
    }

    #releaseHandle() {
        let released = false;
        return () => {
            if (released) return;
            released = true;
            const next = this.waiters.shift();
            if (!next) {
                this.locked = false;
                return;
            }
            clearTimeout(next.timer);
            next.resolve(this.#releaseHandle());
        };
    }

    close() {
        this.closed = true;
        for (const waiter of this.waiters.splice(0)) {
            clearTimeout(waiter.timer);
            waiter.reject(new Error('Semaphore is closed'));
        }
    }
}

module.exports = { BoundedSemaphore };
