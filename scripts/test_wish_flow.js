#!/usr/bin/env node
'use strict';

// 祈愿专用测试脚本：
// - 登录
// - 获取当前进度
// - 单次祈愿（默认 giftType=bobo）
// - 输出结果/余额

const fetch = require('node-fetch');
const { URL } = require('url');

const base = process.env.TARGET_URL || 'https://www.wuguijiang.com';
const username = process.env.AUTH_USER || '尧顺宇';
const password = process.env.AUTH_PASS || 'yaoshunyu';
const giftType = process.env.WISH_GIFT || 'bobo';

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
    const res = await fetch(u, { redirect: 'manual', ...opt, headers: { ...(opt.headers || {}), ...hdr() } });
    setCookie(res);
    return res;
}

(async () => {
    console.log(`Target=${base} user=${username} gift=${giftType}`);
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

    // 查看进度
    let r = await req(`/api/wish/progress?giftType=${encodeURIComponent(giftType)}`);
    const prog = await r.json().catch(() => ({}));
    console.log('progress', r.status, prog);

    // 祈愿一次
    r = await req('/api/wish/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfQ },
        body: JSON.stringify({ giftType })
    });
    const wp = await r.json().catch(() => ({}));
    console.log('play', r.status, wp);

    // 再看进度
    r = await req(`/api/wish/progress?giftType=${encodeURIComponent(giftType)}`);
    const prog2 = await r.json().catch(() => ({}));
    console.log('progress after', r.status, prog2);
})().catch((e) => {
    console.error('error', e.message);
    process.exit(1);
});
