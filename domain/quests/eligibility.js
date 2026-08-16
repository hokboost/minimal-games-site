'use strict';

const USERNAME_PATTERN = /^[\p{L}\p{N}_-]{3,32}$/u;

function normalizeUsername(value) {
    return typeof value === 'string' ? value.normalize('NFKC').trim() : '';
}

function taskCardPilotUsers(environment = process.env) {
    const configured = String(environment.TASK_CARDS_ENABLED_USERS || 'hokboost')
        .split(',')
        .map(normalizeUsername)
        .filter((username) => USERNAME_PATTERN.test(username));
    return new Set(configured.length > 0 ? configured : ['hokboost']);
}

function isTaskCardPilotUser(username, environment = process.env) {
    return taskCardPilotUsers(environment).has(normalizeUsername(username));
}

module.exports = { isTaskCardPilotUser, normalizeUsername, taskCardPilotUsers, USERNAME_PATTERN };
