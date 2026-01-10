// 并发礼物兑换测试脚本
// 用法（示例）：BASE_URL=http://localhost:3000 SESSION_COOKIE="minimal_games_sid=xxx" CSRF_TOKEN=yourtoken node scripts/test_concurrency_gifts.js
// 可选：GIFT_TYPE=heartbox GIFT_COST=150 GIFT_QTY=1 REQUESTS=5
const axios = require('axios');

const baseURL = process.env.BASE_URL || 'http://localhost:3000';
const sessionCookie = process.env.SESSION_COOKIE;
const csrfToken = process.env.CSRF_TOKEN;
const giftType = process.env.GIFT_TYPE || 'heartbox';
const giftCost = Number(process.env.GIFT_COST || 150);
const giftQty = Number(process.env.GIFT_QTY || 1);
const requests = Number(process.env.REQUESTS || 5);

if (!sessionCookie || !csrfToken) {
  console.error('请提供 SESSION_COOKIE 与 CSRF_TOKEN 环境变量');
  process.exit(1);
}

async function run() {
  const client = axios.create({
    baseURL,
    validateStatus: () => true,
    headers: {
      Cookie: sessionCookie,
      'X-CSRF-Token': csrfToken,
      'Content-Type': 'application/json'
    }
  });

  const idem = `test-${Date.now()}`;
  const payload = {
    giftType,
    cost: giftCost * giftQty,
    quantity: giftQty,
    idempotencyKey: idem
  };

  console.log(`并发发送 ${requests} 个兑换请求，礼物=${giftType} cost=${payload.cost} qty=${giftQty}`);
  const results = await Promise.all(
    Array.from({ length: requests }).map((_, idx) =>
      client.post('/api/gifts/exchange', payload).then((resp) => ({
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
    console.log(`#${r.idx} status=${r.status} success=${r.data?.success} message=${r.data?.message || ''} exchangeId=${r.data?.exchangeId || ''}`);
  });
}

run().catch((err) => {
  console.error('测试运行失败', err);
  process.exit(1);
});
