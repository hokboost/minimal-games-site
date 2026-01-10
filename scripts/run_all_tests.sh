#!/usr/bin/env bash
set -euo pipefail

TARGET_URL=${TARGET_URL:-https://wuguijiang.com}
export TARGET_URL
export CSRF_AUTO_FILL=true

run_for_user() {
  local u="$1"
  export AUTH_USER="$u" AUTH_PASS="$u"
  echo "=== Running as $u ==="
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
  node scripts/security_test_wish_guarantee_race.js
  node scripts/smoke_play_all_games.js
  node scripts/smoke_play_all_games_plus.js
  node scripts/test_concurrency_gifts.js
  node scripts/test_concurrency_stone_flip.js
  node scripts/test_flip_flow.js
  node scripts/test_multi_actor.js
  node scripts/test_wish_flow.js
}

run_for_user 333333
run_for_user 444444
