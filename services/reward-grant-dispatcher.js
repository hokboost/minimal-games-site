'use strict';

class RewardGrantDispatcher {
    constructor({ repository, rewardService, workerId, batchSize = 20 }) {
        if (!repository?.claimBatch || !repository?.failClaim
            || !rewardService?.dispatchClaimedIntent) {
            throw new TypeError('Reward grant dispatcher requires repository and reward service');
        }
        this.repository = repository;
        this.rewardService = rewardService;
        this.workerId = workerId;
        this.batchSize = batchSize;
        this.running = false;
    }

    async dispatchBatch() {
        if (this.running) return { skipped: true, claimed: 0, completed: 0,
            retried: 0, deadLettered: 0, committedAfterResponseLoss: 0 };
        this.running = true;
        const summary = { skipped: false, claimed: 0, completed: 0,
            retried: 0, deadLettered: 0, committedAfterResponseLoss: 0 };
        try {
            const intents = await this.repository.claimBatch(this.workerId, { limit: this.batchSize });
            summary.claimed = intents.length;
            for (const intent of intents) {
                try {
                    await this.rewardService.dispatchClaimedIntent(intent, this.workerId);
                    summary.completed += 1;
                } catch (error) {
                    if (error?.committed === true) {
                        summary.committedAfterResponseLoss += 1;
                        continue;
                    }
                    const failed = await this.repository.failClaim(intent, this.workerId, error);
                    if (failed?.status === 'dead_letter') summary.deadLettered += 1;
                    else if (failed?.status === 'pending') summary.retried += 1;
                }
            }
            return summary;
        } finally {
            this.running = false;
        }
    }
}

module.exports = { RewardGrantDispatcher };
