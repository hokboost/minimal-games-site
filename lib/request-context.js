const { AsyncLocalStorage } = require('node:async_hooks');

const storage = new AsyncLocalStorage();

function requestContextMiddleware(req, res, next) {
    storage.run({ requestId: null }, next);
}

function setRequestId(requestId) {
    const context = storage.getStore();
    if (context) context.requestId = requestId || null;
}

function getRequestId() {
    return storage.getStore()?.requestId || null;
}

module.exports = {
    getRequestId,
    requestContextMiddleware,
    setRequestId
};
