#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${TARGET_URL:-}" || -z "${AUTH_USER:-}" || -z "${AUTH_PASS:-}" ]]; then
  echo "Usage: TARGET_URL=... AUTH_USER=... AUTH_PASS=... ALLOW_MUTATING_SECURITY_TESTS=I_ACKNOWLEDGE_TEST_SIDE_EFFECTS $0"
  exit 1
fi

export TARGET_URL AUTH_USER AUTH_PASS

run_suite() {
  node scripts/security_test_bad_actor.js
  node scripts/security_test_blackhat_advanced.js
  node scripts/security_test_deep.js
  node scripts/security_test_duel_race.js
  node scripts/security_test_gift_real.js
  node scripts/security_test_money_attack.js
  node scripts/security_test_money_attack_advanced.js
  node scripts/security_test_quiz_exploit.js
  node scripts/security_test_quiz_regression.js
  node scripts/security_test_stone_flip_race.js
  node scripts/security_test_tamper.js
  node scripts/security_test_unauth.js
  node scripts/smoke_play_all_games.js
  node scripts/smoke_play_all_games_plus.js
  node scripts/test_concurrency_gifts.js
  node scripts/test_concurrency_stone_flip.js
  node scripts/test_flip_flow.js
  node scripts/test_multi_actor.js
  node scripts/test_wish_flow.js
}

run_suite
