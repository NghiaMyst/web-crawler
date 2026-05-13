#!/usr/bin/env bash
# Preflight sanity check for docker-compose.prod.yml.
# Runs BEFORE first deploy and after any compose-file edits.
# Exits non-zero on any regression of the Phase 10 invariants.
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
fail=0

check() {
  local desc="$1"; shift
  if "$@"; then
    echo "  OK   ${desc}"
  else
    echo "  FAIL ${desc}"
    fail=1
  fi
}

echo "[preflight] validating ${COMPOSE_FILE}"
test -f "${COMPOSE_FILE}" || { echo "[preflight] FAIL: ${COMPOSE_FILE} not found"; exit 1; }

echo "[preflight] step 1 — YAML validity"
check "YAML parses (docker compose config)" bash -c "docker compose -f '${COMPOSE_FILE}' config --no-interpolate >/dev/null 2>&1"

echo "[preflight] step 2 — Phase 10 invariants (D-04, D-07, D-08)"
check "Redis command has --appendonly yes"          grep -q -- "--appendonly yes"          "${COMPOSE_FILE}"
check "Redis command has --appendfsync everysec"    grep -q -- "--appendfsync everysec"    "${COMPOSE_FILE}"
check "Redis command has --maxmemory-policy noeviction" grep -q -- "--maxmemory-policy noeviction" "${COMPOSE_FILE}"
check "redis_data:/data volume mount present"       grep -q "redis_data:/data"             "${COMPOSE_FILE}"
check "redis_data: declared in top-level volumes"   grep -qE "^[[:space:]]+redis_data:"    "${COMPOSE_FILE}"
check "letsencrypt volume declared as external"     grep -q "external: true"               "${COMPOSE_FILE}"
check "no dashboard service"                        bash -c "! grep -qE '^[[:space:]]*dashboard:' '${COMPOSE_FILE}'"
check "no top-level version key"                    bash -c "! grep -qE '^version:' '${COMPOSE_FILE}'"
check "postgres has no exposed host ports"          bash -c "! awk '/^  postgres:/,/^  [a-z]/' '${COMPOSE_FILE}' | grep -qE '\"5432:5432\"'"
check "redis has no exposed host ports"             bash -c "! awk '/^  redis:/,/^  [a-z]/' '${COMPOSE_FILE}' | grep -qE '\"6379:6379\"'"
check "nginx exposes 80:80"                         grep -q '"80:80"'                       "${COMPOSE_FILE}"
check "nginx exposes 443:443"                       grep -q '"443:443"'                     "${COMPOSE_FILE}"
check "five services use platform: linux/arm64"     bash -c "[[ \$(grep -c 'platform: linux/arm64' '${COMPOSE_FILE}') -eq 5 ]]"
check "five services use restart: always"           bash -c "[[ \$(grep -c 'restart: always' '${COMPOSE_FILE}') -eq 5 ]]"

echo "[preflight] step 3 — referenced files exist"
check "nginx/nginx.conf exists"                     test -f nginx/nginx.conf
check ".env.prod.example exists (template)"         test -f .env.prod.example
check "apps/api/.env.prod.example exists"           test -f apps/api/.env.prod.example
check "apps/crawler/.env.prod.example exists"       test -f apps/crawler/.env.prod.example

echo "[preflight] step 4 — Program.cs CORS env var rename"
check "Program.cs reads CORS_ALLOWED_ORIGINS"       grep -q "CORS_ALLOWED_ORIGINS" apps/api/Program.cs
check "Program.cs no longer reads CORS_ORIGINS"     bash -c "! grep -q '\"CORS_ORIGINS\"' apps/api/Program.cs"

if [[ "${fail}" -ne 0 ]]; then
  echo "[preflight] FAIL — fix regressions above before deploying"
  exit 1
fi

echo "[preflight] PASS — docker-compose.prod.yml + Program.cs satisfy Phase 10 invariants"
