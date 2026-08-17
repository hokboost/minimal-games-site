'use strict';

class QuestV2MaintenanceWorker {
    constructor({ questV2Service, enabled }) {
        if (!questV2Service?.expireDueAssignments || !questV2Service?.materializeWeeklyBoards) {
            throw new TypeError('Quest maintenance worker requires Quest V2 lifecycle service');
        }
        this.questV2Service = questV2Service;
        this.enabled = enabled === true;
        this.expiryRun = null;
        this.scheduleRun = null;
    }

    expire() {
        if (!this.enabled) return Promise.resolve({ processed: 0, assignmentIds: [] });
        if (!this.expiryRun) {
            this.expiryRun = this.questV2Service.expireDueAssignments({ limit: 100 })
                .finally(() => { this.expiryRun = null; });
        }
        return this.expiryRun;
    }

    materialize() {
        if (!this.enabled) {
            return Promise.resolve({ timezones: 0, inserted: 0, current: 0, future: 0 });
        }
        if (!this.scheduleRun) {
            this.scheduleRun = this.questV2Service.materializeWeeklyBoards({ horizonWeeks: 12 })
                .finally(() => { this.scheduleRun = null; });
        }
        return this.scheduleRun;
    }
}

module.exports = { QuestV2MaintenanceWorker };
