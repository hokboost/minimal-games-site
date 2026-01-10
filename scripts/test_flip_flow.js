#!/usr/bin/env node
'use strict';

// 翻牌专用测试脚本：
// - 登录
// - 拉取状态
// - 若未开始或已结束则 start
// - 翻指定索引（默认0）
// - 输出翻牌结果与最新状态

const fetch = require('node-fetch');
const { URL } = require('url');

const base = process.env.TARGET_URL || 'https://www.wuguijiang.com';
const username = process.env.AUTH_USER || '尧顺宇';
const password = process.env.AUTH_PASS || 'yaoshunyu';
const flipIndex = Number(process.env.FLIP_INDEX || 0);

const jar = new Map();
const setCookie = (res) => {
    const sc = res.headers.get('set-cookie');
    if (!sc) return;
    sc.split(',').forEach((p) => {
        const kv = p.split(';')[0];
        const [k, v] = kv.split('=');
        if (k && v !== undefined) jar.set(k.trim(), v.trim());
    });
};
const hdr = () => (jar.size ? { cookie: [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ') } : {});

async function req(path, opt = {}) {
    const u = new URL(path, base);
    const res = await fetch(u, { redirect: 'follow', ...opt, headers: { ...(opt.headers || {}), ...hdr() } });
    setCookie(res);
    return res;
}

(async () => {
    console.log(`Target=${base} user=${username} flipIndex=${flipIndex}`);
    const lp = await req('/login');
    const csrf = (await lp.text()).match(/name="_csrf" value="([^"]+)"/)?.[1];
    if (!csrf) throw new Error('No login CSRF');

    await req('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username, password, _csrf: csrf }).toString()
    });

    const qp = await req('/quiz');
    const csrfQ = (await qp.text()).match(/data-csrf-token="([^"]+)"/)?.[1];
    if (!csrfQ) throw new Error('No quiz CSRF');

    let r = await req('/api/flip/state');
    const state = await r.json().catch(() => ({}));
    console.log('state', r.status, state);

    if (state.ended || (state.goodCount + state.badCount === 0)) {
        const start = await req('/api/flip/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfQ }
        });
        const sp = await start.json().catch(() => ({}));
        console.log('start', start.status, sp);
    }

    r = await req('/api/flip/flip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfQ },
        body: JSON.stringify({ cardIndex: flipIndex })
    });
    const fp = await r.json().catch(() => ({}));
    console.log('flip', r.status, fp);

    r = await req('/api/flip/state');
    const state2 = await r.json().catch(() => ({}));
    console.log('state after', r.status, state2);

    // 如需 cashout，解除注释
    // const cash = await req('/api/flip/cashout', { method:'POST', headers:{'Content-Type':'application/json','X-CSRF-Token':csrfQ} });
    // console.log('cashout', cash.status, await cash.json().catch(()=>({})));
})().catch((e) => {
    console.error('error', e.message);
    process.exit(1);
});
