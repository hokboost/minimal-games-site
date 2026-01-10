#!/usr/bin/env node
'use strict';

const { URL } = require('url');

const baseUrl = process.argv[2] || process.env.TARGET_URL || 'https://www.wuguijiang.com';
const username = process.env.AUTH_USER;
const password = process.env.AUTH_PASS;
const questionsToFetch = Number(process.env.QUESTIONS || 5);

if (!username || !password) {
    console.error('Missing AUTH_USER or AUTH_PASS env vars.');
    process.exit(1);
}

const cookieJar = new Map();

function setCookieFromResponse(response) {
    const setCookie = response.headers.get('set-cookie');
    if (!setCookie) return;
    const parts = setCookie.split(',');
    for (const part of parts) {
        const first = part.split(';')[0];
        const [name, value] = first.split('=');
        if (name && value !== undefined) {
            cookieJar.set(name.trim(), value.trim());
        }
    }
}

function cookieHeader() {
    if (cookieJar.size === 0) return '';
    return Array.from(cookieJar.entries())
        .map(([name, value]) => `${name}=${value}`)
        .join('; ');
}

async function request(path, options = {}) {
    const url = new URL(path, baseUrl);
    const headers = {
        ...(options.headers || {})
    };
    const cookies = cookieHeader();
    if (cookies) {
        headers.cookie = cookies;
    }
    const response = await fetch(url, {
        redirect: 'follow',
        ...options,
        headers
    });
    setCookieFromResponse(response);
    return response;
}

function logResult(name, pass, info) {
    const status = pass ? 'PASS' : 'FAIL';
    const detail = info ? ` - ${info}` : '';
    console.log(`[${status}] ${name}${detail}`);
}

async function login() {
    const loginPage = await request('/login');
    const pageText = await loginPage.text();
    const csrfMatch = pageText.match(/name="_csrf" value="([^"]+)"/);
    const csrfToken = csrfMatch ? csrfMatch[1] : null;

    logResult('Login page reachable', loginPage.status === 200, `status=${loginPage.status}`);
    logResult('Login CSRF token found', !!csrfToken, csrfToken ? 'ok' : 'missing');

    if (!csrfToken) return null;

    const body = new URLSearchParams({
        username,
        password,
        _csrf: csrfToken
    }).toString();

    const response = await request('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
    });

    const pass = response.status === 302 || response.status === 303;
    const location = response.headers.get('location') || '';
    logResult('Login submit', pass, `status=${response.status} location=${location}`);
    return pass ? csrfToken : null;
}

async function fetchQuizCsrf() {
    const response = await request('/quiz');
    const text = await response.text();
    const match = text.match(/data-csrf-token="([^"]+)"/);
    return match ? match[1] : null;
}

async function startQuiz(csrfToken) {
    const response = await request('/api/quiz/start', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken
        },
        body: JSON.stringify({ username })
    });
    const payload = await response.json().catch(() => ({}));
    return { status: response.status, payload };
}

async function fetchQuestion(csrfToken, seen, questionIndex) {
    const response = await request('/api/quiz/next', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken
        },
        body: JSON.stringify({ username, seen, questionIndex })
    });
    if (response.status !== 200) {
        return { ok: false, status: response.status };
    }
    const payload = await response.json();
    return { ok: payload.success, payload, status: response.status };
}

async function submitAnswers(csrfToken, answers, overrideUsername) {
    const response = await request('/api/quiz/submit', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken
        },
        body: JSON.stringify({ username: overrideUsername || username, answers })
    });
    const payload = await response.json().catch(() => ({}));
    return { status: response.status, payload };
}

async function collectQuestions(csrfToken, count) {
    const answers = [];
    const seen = [];
    for (let i = 0; i < count; i += 1) {
        const result = await fetchQuestion(csrfToken, seen, i);
        if (!result.ok) {
            return { ok: false, status: result.status, answers };
        }
        const question = result.payload.question;
        seen.push(question.id);
        // 猜答案，无关紧要，只看是否允许提交
        const answerIndex = Math.floor(Math.random() * (question.options?.length || 1));
        answers.push({ token: result.payload.token, answerIndex });
    }
    return { ok: true, answers };
}

async function main() {
    console.log(`Target: ${baseUrl}`);
    console.log(`Questions per run: ${questionsToFetch}`);

    console.log('--- Login ---');
    const loginOk = await login();
    if (!loginOk) {
        console.log('Login failed; aborting.');
        process.exit(1);
    }

    const csrfToken = await fetchQuizCsrf();
    logResult('Quiz CSRF found', !!csrfToken, csrfToken ? 'ok' : 'missing');
    if (!csrfToken) {
        process.exit(1);
    }

    console.log('--- Start session A ---');
    const startA = await startQuiz(csrfToken);
    logResult('Quiz start A', startA.status === 200 && startA.payload?.success, `status=${startA.status}`);

    const collectedA = await collectQuestions(csrfToken, questionsToFetch);
    logResult('Collect questions A', collectedA.ok, `status=${collectedA.status || 200}, count=${collectedA.answers.length}`);

    const submitA = await submitAnswers(csrfToken, collectedA.answers);
    logResult('Submit A first time', submitA.status === 200 && submitA.payload?.success, `status=${submitA.status} reward=${submitA.payload?.reward}`);

    const replayA = await submitAnswers(csrfToken, collectedA.answers);
    logResult('Replay submit A (should be blocked)', replayA.status !== 200, `status=${replayA.status} reward=${replayA.payload?.reward}`);

    console.log('--- Start session B ---');
    const startB = await startQuiz(csrfToken);
    logResult('Quiz start B', startB.status === 200 && startB.payload?.success, `status=${startB.status}`);

    const collectedB = await collectQuestions(csrfToken, 1);
    logResult('Collect questions B', collectedB.ok, `status=${collectedB.status || 200}, count=${collectedB.answers.length}`);

    const reuseOldTokens = await submitAnswers(csrfToken, collectedA.answers);
    logResult('Submit with old tokens in new session (should fail)', reuseOldTokens.status !== 200, `status=${reuseOldTokens.status} reward=${reuseOldTokens.payload?.reward}`);

    const wrongUser = await submitAnswers(csrfToken, collectedB.answers, 'attacker');
    logResult('Submit with mismatched username (should fail)', wrongUser.status !== 200, `status=${wrongUser.status}`);
}

main().catch((error) => {
    console.error('Test error:', error.message);
    process.exit(1);
});
