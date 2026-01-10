#!/usr/bin/env node
'use strict';

const { URL } = require('url');

const baseUrl = process.env.TARGET_URL || 'https://www.wuguijiang.com';
const username = process.env.AUTH_USER;
const password = process.env.AUTH_PASS;

if (!username || !password) {
  console.error('Missing AUTH_USER or AUTH_PASS env vars.');
  process.exit(1);
}

const jar = new Map();
function setCookie(res) {
  const sc = res.headers.get('set-cookie');
  if (!sc) return;
  sc.split(',').forEach((p) => {
    const kv = p.split(';')[0];
    const [k, v] = kv.split('=');
    if (k && v !== undefined) jar.set(k.trim(), v.trim());
  });
}
function cookieHeader() {
  return jar.size ? { cookie: [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ') } : {};
}
async function request(path, options = {}) {
  const url = new URL(path, baseUrl);
  const depth = options._depth || 0;
  const res = await fetch(url, {
    redirect: 'manual',
    ...options,
    headers: { ...(options.headers || {}), ...cookieHeader() }
  });
  setCookie(res);
  const status = res.status;
  const location = res.headers.get('location');
  const shouldFollow = [301, 302, 303, 307, 308].includes(status) && location && depth < 3;
  if (shouldFollow) {
    const nextMethod = ['GET', 'HEAD', 'OPTIONS'].includes((options.method || 'GET').toUpperCase())
      ? 'GET'
      : options.method;
    return request(location, { ...options, method: nextMethod, _depth: depth + 1 });
  }
  return res;
}

async function loginAndGetCsrf() {
  const lp = await request('/login');
  const html = await lp.text();
  const csrfLogin = html.match(/name="_csrf" value="([^"]+)"/)?.[1];
  if (!csrfLogin) throw new Error('login csrf missing');
  await request('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username, password, _csrf: csrfLogin }).toString()
  });
  const qp = await request('/quiz');
  const qHtml = await qp.text();
  const csrfQuiz = qHtml.match(/data-csrf-token="([^"]+)"/)?.[1]
    || qHtml.match(/name="csrfToken" value="([^"]+)"/)?.[1]
    || qHtml.match(/name="_csrf" value="([^"]+)"/)?.[1];
  if (!csrfQuiz) throw new Error('quiz csrf missing');
  return csrfQuiz;
}

async function fetchBalance() {
  const resp = await request('/api/user-info');
  const data = await resp.json().catch(() => ({}));
  return Number(data.balance) || 0;
}

function makeHeaders(csrf) {
  return { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf };
}

async function runTests() {
  console.log(`Target=${baseUrl}`);
  console.log(`User=${username}`);
  const csrf = await loginAndGetCsrf();
  console.log(`CSRF=${csrf}`);
  const balanceTrajectory = [];
  balanceTrajectory.push({ label: 'start', balance: await fetchBalance() });

  // Quiz: 先 start 建立会话
  const quizStart = await request('/api/quiz/start', {
    method: 'POST',
    headers: makeHeaders(csrf),
    body: JSON.stringify({ username })
  });
  const quizStartBody = await quizStart.json().catch(() => ({}));
  console.log('quiz_start', quizStart.status, quizStartBody);
  if (quizStartBody.newBalance !== undefined) {
    balanceTrajectory.push({ label: 'quiz_start', balance: quizStartBody.newBalance });
  }

  // Quiz: normal submit then replay same answers
  const answers = [{ token: 't1', answerIndex: 0 }];
  const submit1 = await request('/api/quiz/submit', {
    method: 'POST',
    headers: makeHeaders(csrf),
    body: JSON.stringify({ username, answers })
  });
  console.log('quiz_submit_once', submit1.status, await submit1.text());
  const submit2 = await request('/api/quiz/submit', {
    method: 'POST',
    headers: makeHeaders(csrf),
    body: JSON.stringify({ username, answers })
  });
  console.log('quiz_submit_replay', submit2.status, await submit2.text());

  // Slot: 并发多次（默认2次，可通过 SLOT_RUNS 设置）
  const slotRuns = Number(process.env.SLOT_RUNS || 10);
  const slotPayload = JSON.stringify({ username, betAmount: 5 });
  const slotHeaders = makeHeaders(csrf);
  const slotPromises = Array.from({ length: slotRuns }, () =>
    request('/api/slot/play', { method: 'POST', headers: slotHeaders, body: slotPayload })
  );
  const slotResults = await Promise.all(slotPromises);
  const slotStatuses = [];
  let slotPayoutSum = 0;
  for (const r of slotResults) {
    slotStatuses.push(r.status);
    try {
      const body = await r.clone().json();
      slotPayoutSum += Number(body.payout || body.reward || 0);
      if (body.newBalance !== undefined) {
        balanceTrajectory.push({ label: 'slot', balance: body.newBalance });
      } else if (body.finalBalance !== undefined) {
        balanceTrajectory.push({ label: 'slot', balance: body.finalBalance });
      }
    } catch (_) { /* ignore */ }
  }
  const slotCost = 5 * slotRuns;
  console.log('slot_runs', slotRuns, slotStatuses);

  // Scratch: 并发多次（默认2次，可通过 SCRATCH_RUNS 设置）
  const scratchRuns = Number(process.env.SCRATCH_RUNS || 10);
  const scratchPayload = JSON.stringify({ username, tier: 5, winCount: 5 });
  const scratchHeaders = makeHeaders(csrf);
  const scratchPromises = Array.from({ length: scratchRuns }, () =>
    request('/api/scratch/play', { method: 'POST', headers: scratchHeaders, body: scratchPayload })
  );
  const scratchResults = await Promise.all(scratchPromises);
  const scratchStatuses = [];
  let scratchPayoutSum = 0;
  for (const r of scratchResults) {
    scratchStatuses.push(r.status);
    try {
      const body = await r.clone().json();
      scratchPayoutSum += Number(body.reward || body.payout || 0);
      if (body.balance !== undefined) {
        balanceTrajectory.push({ label: 'scratch', balance: body.balance });
      }
    } catch (_) { /* ignore */ }
  }
  const scratchCost = 5 * scratchRuns;
  console.log('scratch_runs', scratchRuns, scratchStatuses);

  const balanceAfter = await fetchBalance();
  balanceTrajectory.push({ label: 'after', balance: balanceAfter });
  console.log(`Balance after=${balanceAfter}`);
  console.log(`Expected delta≈ -${slotCost + scratchCost} + payouts(${slotPayoutSum + scratchPayoutSum})`);
  console.log('Balance trajectory:', balanceTrajectory);
}

runTests().catch((e) => {
  console.error('error', e.message);
  process.exit(1);
});
