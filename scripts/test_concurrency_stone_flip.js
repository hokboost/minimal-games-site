// 并发测试：石头 add + 翻牌 start/flip
// 用法：BASE_URL=http://localhost:3000 SESSION_COOKIE="minimal_games_sid=xxx" CSRF_TOKEN=yourtoken node scripts/test_concurrency_stone_flip.js
// 可选：STONE_REQUESTS=5 FLIP_REQUESTS=5
const axios = require('axios');

const baseURL = process.env.BASE_URL || 'http://localhost:3000';
const sessionCookie = process.env.SESSION_COOKIE;
const csrfToken = process.env.CSRF_TOKEN;
const stoneRequests = Number(process.env.STONE_REQUESTS || 5);
const flipRequests = Number(process.env.FLIP_REQUESTS || 5);

if (!sessionCookie || !csrfToken) {
  console.error('请提供 SESSION_COOKIE 与 CSRF_TOKEN 环境变量');
  process.exit(1);
}

const client = axios.create({
  baseURL,
  validateStatus: () => true,
  headers: {
    Cookie: sessionCookie,
    'X-CSRF-Token': csrfToken,
    'Content-Type': 'application/json'
  }
});

async function testStoneAdd() {
  console.log(`并发发送 ${stoneRequests} 个 /api/stone/add 请求`);
  const results = await Promise.all(
    Array.from({ length: stoneRequests }).map((_, idx) =>
      client.post('/api/stone/add', {}).then((resp) => ({
        idx,
        status: resp.status,
        data: resp.data
      })).catch((err) => ({
        idx,
        status: err.response?.status || 0,
        data: err.response?.data || err.message
      }))
    )
  );
  results.forEach((r) => {
    console.log(`[stone add #${r.idx}] status=${r.status} success=${r.data?.success} msg=${r.data?.message || ''}`);
  });
}

async function testFlip() {
  console.log('先启动一轮翻牌 /api/flip/start');
  const startResp = await client.post('/api/flip/start', {});
  console.log(`start status=${startResp.status} success=${startResp.data?.success} prevReward=${startResp.data?.previousReward || 0}`);
  if (!startResp.data?.success) return;

  console.log(`并发发送 ${flipRequests} 个 /api/flip/flip 请求（索引随机 0-8）`);
  const results = await Promise.all(
    Array.from({ length: flipRequests }).map((_, idx) => {
      const cardIndex = Math.floor(Math.random() * 9);
      return client.post('/api/flip/flip', { cardIndex }).then((resp) => ({
        idx,
        status: resp.status,
        data: resp.data,
        cardIndex
      })).catch((err) => ({
        idx,
        status: err.response?.status || 0,
        data: err.response?.data || err.message,
        cardIndex
      }));
    })
  );
  results.forEach((r) => {
    console.log(`[flip #${r.idx}] card=${r.cardIndex} status=${r.status} success=${r.data?.success} ended=${r.data?.ended} msg=${r.data?.message || ''}`);
  });
}

async function run() {
  await testStoneAdd();
  await testFlip();
}

run().catch((err) => {
  console.error('测试运行失败', err);
  process.exit(1);
});
