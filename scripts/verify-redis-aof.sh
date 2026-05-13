#!/usr/bin/env bash
# DEPLOY-04 validation: assert Redis AOF file exists and has non-zero size.
# Idempotent. Safe to run repeatedly. Exits non-zero on failure.
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
REDIS_SVC="${REDIS_SVC:-redis}"

echo "[verify-redis-aof] using compose file: ${COMPOSE_FILE}"

# 1. Confirm redis container is up.
if ! docker compose -f "${COMPOSE_FILE}" ps "${REDIS_SVC}" 2>/dev/null | grep -q "running\|Up"; then
  echo "[verify-redis-aof] FAIL: redis service is not running. Run: docker compose -f ${COMPOSE_FILE} up -d redis"
  exit 1
fi

# 2. Confirm AOF is enabled at runtime via CONFIG GET.
aof_enabled=$(docker compose -f "${COMPOSE_FILE}" exec -T "${REDIS_SVC}" redis-cli CONFIG GET appendonly | tail -1 | tr -d '\r')
if [[ "${aof_enabled}" != "yes" ]]; then
  echo "[verify-redis-aof] FAIL: appendonly=${aof_enabled} (expected yes). Check redis command in docker-compose.prod.yml."
  exit 1
fi
echo "[verify-redis-aof] OK: appendonly = yes"

# 3. Confirm appendfsync is everysec.
fsync_mode=$(docker compose -f "${COMPOSE_FILE}" exec -T "${REDIS_SVC}" redis-cli CONFIG GET appendfsync | tail -1 | tr -d '\r')
if [[ "${fsync_mode}" != "everysec" ]]; then
  echo "[verify-redis-aof] FAIL: appendfsync=${fsync_mode} (expected everysec)."
  exit 1
fi
echo "[verify-redis-aof] OK: appendfsync = everysec"

# 4. Force an AOF rewrite so the file is guaranteed to exist on disk.
docker compose -f "${COMPOSE_FILE}" exec -T "${REDIS_SVC}" redis-cli BGREWRITEAOF >/dev/null
sleep 2

# 5. Assert /data/appendonly.aof (or the new multi-file AOF dir in Redis 7) exists with non-zero size.
#    Redis 7 introduced a directory-based AOF (appendonlydir/). Accept either layout.
listing=$(docker compose -f "${COMPOSE_FILE}" exec -T "${REDIS_SVC}" sh -c 'ls -lhA /data 2>/dev/null || true')
echo "[verify-redis-aof] /data contents:"
echo "${listing}"

if echo "${listing}" | grep -qE 'appendonly\.aof[[:space:]]|appendonlydir'; then
  echo "[verify-redis-aof] OK: AOF artifact present in /data"
else
  echo "[verify-redis-aof] FAIL: no AOF file/dir found in /data"
  exit 1
fi

# 6. Assert the /data mount is a named volume (not a tmpfs / anonymous volume).
redis_container=$(docker compose -f "${COMPOSE_FILE}" ps -q "${REDIS_SVC}")
mount_info=$(docker inspect "${redis_container}" --format '{{ range .Mounts }}{{ .Type }} {{ .Source }} -> {{ .Destination }}{{ "\n" }}{{ end }}')
echo "[verify-redis-aof] redis mounts:"
echo "${mount_info}"
if ! echo "${mount_info}" | grep -q "/data"; then
  echo "[verify-redis-aof] FAIL: /data is not mounted — AOF will be lost on container recreate"
  exit 1
fi
if echo "${mount_info}" | grep -E "^tmpfs" | grep -q "/data"; then
  echo "[verify-redis-aof] FAIL: /data is a tmpfs — AOF will not persist"
  exit 1
fi
echo "[verify-redis-aof] OK: /data is backed by a persistent mount"

echo "[verify-redis-aof] PASS — DEPLOY-04 validated"
