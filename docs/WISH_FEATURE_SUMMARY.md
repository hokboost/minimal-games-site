# Wish Feature Reference

This file describes the current implementation. The authoritative private
runtime configuration is `domain/games/configuration.js`. Routes, templates,
browser code, preview tooling, economics tests, and profile presentation consume
the registry or its sanitized public projection; they must not copy prices or
probabilities.

## Current configurations

| Type | Display name | Cost | Base success rate | Guarantee draw | Reward value |
| --- | --- | ---: | ---: | ---: | ---: |
| `deepsea_singer` | 梦幻游乐园 | 487 | 1.40% | 148 | 30000 |
| `sky_throne` | 飞天转椅 | 251 | 2.02% | 83 | 10000 |
| `proposal` | 原地求婚 | 209 | 3.25% | 52 | 5200 |
| `wonderland` | 梦游仙境 | 151 | 4.05% | 41 | 3000 |
| `white_bride` | 纯白花嫁 | 77 | 4.60% | 34 | 1314 |
| `crystal_ball` | 水晶球 | 67 | 5.50% | 32 | 1000 |
| `bobo` | 啵啵 | 51 | 10.40% | 16 | 399 |

The UI may also show a guarantee-adjusted long-run rate. That number is not the
base random probability for an individual non-guaranteed draw.
Startup rejects any configured redeemable wish tier outside the 98%–99% RTP
policy interval. The current tier values are approximately 98.15%–98.60%.

## Settlement rules

- Progress is independent per user and gift type.
- A normal draw succeeds with the configured base rate. The configured
  guarantee draw succeeds regardless of the random result.
- Success resets consecutive failures; failure increments them.
- Single and ten-draw requests lock the user's balance and progress in one
  PostgreSQL transaction. Cost, ledger entries, results, inventory, progress,
  session summary, and HTTP idempotency snapshot commit together.
- Rewards are stored in `wish_inventory`. Delivery is a separate durable task;
  missing or ambiguous Bilibili confirmation never causes an automatic refund.
- Client-supplied user names, costs, rates, rewards, balances, and results are
  not trusted.

## Interfaces

- `POST /api/wish/play`: one draw.
- `POST /api/wish-batch`: exactly ten draws.
- `GET /api/wish/progress`: progress for one configured gift type.
- `GET /api/wish/history`: paginated settled history.
- `GET /api/wish/backpack`: stored and delivery-pending rewards.
- `POST /api/wish/backpack/send`: enqueue one stored reward.
- `POST /api/wish/simulate`: administrator-only statistical simulation; it
  does not settle money or rewards.

All write interfaces require login, authorization, CSRF validation,
`Idempotency-Key`, shared PostgreSQL rate limits, and paid-action concurrency
protection where money is involved.

## Database and deployment

Schema changes are applied only through tracked files in `migrations/` and
`npm run migrate`. Do not restore the removed one-off `setup-wish-tables.js`
workflow. Fresh-schema, historical-upgrade, idempotency, browser, concurrency,
and process-failure tests are part of the repository test suite.
