#!/usr/bin/env bash
# Quick wrapper to run key security simulations with common env flags.
set -euo pipefail

if [[ -z "${TARGET_URL:-}" || -z "${AUTH_USER:-}" || -z "${AUTH_PASS:-}" ]]; then
  echo "Usage: TARGET_URL=... AUTH_USER=... AUTH_PASS=... [CSRF_AUTO_FILL=true] [CSRF_TEST_MODE=true] $0"
  exit 1
fi

export CSRF_AUTO_FILL="${CSRF_AUTO_FILL:-true}"

echo "== simulation_smart_farmer =="
node scripts/simulation_smart_farmer.js

echo "== simulation_race_condition =="
node scripts/simulation_race_condition.js

echo "== security_test_blackhat_advanced =="
node scripts/security_test_blackhat_advanced.js
