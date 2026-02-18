const { spawn } = require('child_process');
const path = require('path');

const processes = new Map();

const defaultScriptPath = 'C:/Users/user/Desktop/jiaobenbili/checkpk.py';
const defaultConfigPath = 'C:/Users/user/Desktop/jiaobenbili/config_gift_only.json';

function buildEnv() {
    return {
        ...process.env,
        BILIPK_CONFIG: process.env.BILIPK_CONFIG || defaultConfigPath,
        PK_REPORT_URL: process.env.PK_REPORT_URL || 'http://127.0.0.1:3000/api/pk/report',
        PK_REPORT_KEY: process.env.WINDOWS_API_KEY || '',
        PK_REPORT_USERNAME: process.env.PK_REPORT_USERNAME || ''
    };
}

function getScriptPath() {
    return process.env.BILIPK_SCRIPT || defaultScriptPath;
}

function getPythonPath() {
    return process.env.BILIPK_PYTHON || 'python';
}

function startPk(username, roomId) {
    const existing = processes.get(username);
    if (existing && !existing.killed) {
        return { started: false, message: '已在运行', pid: existing.pid };
    }

    const scriptPath = getScriptPath();
    const scriptDir = path.dirname(scriptPath);
    const pythonPath = getPythonPath();
    const env = {
        ...buildEnv(),
        PK_REPORT_USERNAME: username
    };
    const child = spawn(pythonPath, [scriptPath, String(roomId)], {
        cwd: scriptDir,
        env,
        windowsHide: true
    });

    child.stdout.on('data', (data) => {
        console.log(`[PK:${username}] ${data.toString().trim()}`);
    });
    child.stderr.on('data', (data) => {
        console.error(`[PK:${username}][ERR] ${data.toString().trim()}`);
    });
    child.on('close', (code) => {
        console.log(`[PK:${username}] exit code=${code}`);
        const current = processes.get(username);
        if (current === child) {
            processes.delete(username);
        }
    });
    child.on('error', (error) => {
        console.error(`[PK:${username}] spawn error:`, error);
        const current = processes.get(username);
        if (current === child) {
            processes.delete(username);
        }
    });

    processes.set(username, child);
    return { started: true, pid: child.pid };
}

function stopPk(username) {
    const child = processes.get(username);
    if (!child || child.killed) {
        processes.delete(username);
        return { stopped: false, message: '未在运行' };
    }
    try {
        child.kill('SIGTERM');
    } catch (error) {
        console.error(`[PK:${username}] stop error:`, error);
        return { stopped: false, message: '停止失败' };
    }
    processes.delete(username);
    return { stopped: true };
}

function isRunning(username) {
    const child = processes.get(username);
    return !!(child && !child.killed);
}

module.exports = {
    startPk,
    stopPk,
    isRunning
};
