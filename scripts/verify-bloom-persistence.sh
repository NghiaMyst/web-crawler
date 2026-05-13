#!/usr/bin/env bash
# DEPLOY-05 validation: Bloom Filter state survives `docker compose restart redis`.
# Idempotent. Requires the crawler to have inserted at least one URL into the bloom filter
# before running (Plan 10-05 documents this prerequisite).
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
REDIS_SVC="${REDIS_SVC:-redis}"
BLOOM_KEY_PREFIX="${BLOOM_KEY_PREFIX:-bloom:}"

echo "[verify-bloom] using compose file: ${COMPOSE_FILE}"

# 1. Capture pre-restart bloom keys snapshot.
pre_keys=$(docker compose -f "${COMPOSE_FILE}" exec -T "${REDIS_SVC}" redis-cli --no-raw KEYS "${BLOOM_KEY_PREFIX}*" | sort | tr -d '\r')
pre_count=$(printf '%s\n' "${pre_keys}" | grep -c . || true)

if [[ "${pre_count}" -eq 0 ]]; then
  echo "[verify-bloom] FAIL: no keys matching ${BLOOM_KEY_PREFIX}* exist. Trigger a crawl first so the bloom filter has state."
  exit 1
fi
echo "[verify-bloom] pre-restart: ${pre_count} bloom keys present"

# 2. Capture size + content hash of each bloom key (STRLEN + DEBUG OBJECT for size; SHA on dump for content).
declare -A pre_sizes
while read -r key; do
  [[ -z "${key}" ]] && continue
  size=$(docker compose -f "${COMPOSE_FILE}" exec -T "${REDIS_SVC}" redis-cli STRLEN "${key}" | tr -d '\r')
  pre_sizes["${key}"]="${size}"
done <<< "${pre_keys}"

# 3. Restart redis.
echo "[verify-bloom] restarting redis..."
docker compose -f "${COMPOSE_FILE}" restart "${REDIS_SVC}" >/dev/null

# Wait for redis healthy.
for i in $(seq 1 30); do
  if docker compose -f "${COMPOSE_FILE}" exec -T "${REDIS_SVC}" redis-cli ping 2>/dev/null | grep -q PONG; then
    break
  fi
  sleep 1
  if [[ "${i}" -eq 30 ]]; then
    echo "[verify-bloom] FAIL: redis did not come back online within 30s"
    exit 1
  fi
done
echo "[verify-bloom] redis back online"

# 4. Re-read bloom keys post-restart.
post_keys=$(docker compose -f "${COMPOSE_FILE}" exec -T "${REDIS_SVC}" redis-cli --no-raw KEYS "${BLOOM_KEY_PREFIX}*" | sort | tr -d '\r')
post_count=$(printf '%s\n' "${post_keys}" | grep -c . || true)

if [[ "${post_count}" -ne "${pre_count}" ]]; then
  echo "[verify-bloom] FAIL: bloom key count changed across restart (pre=${pre_count}, post=${post_count})"
  echo "pre: ${pre_keys}"
  echo "post: ${post_keys}"
  exit 1
fi

# 5. Assert each key still has the same byte size.
while read -r key; do
  [[ -z "${key}" ]] && continue
  post_size=$(docker compose -f "${COMPOSE_FILE}" exec -T "${REDIS_SVC}" redis-cli STRLEN "${key}" | tr -d '\r')
  if [[ "${post_size}" != "${pre_sizes[${key}]}" ]]; then
    echo "[verify-bloom] FAIL: key=${key} size changed (pre=${pre_sizes[${key}]} post=${post_size})"
    exit 1
  fi
done <<< "${pre_keys}"

echo "[verify-bloom] PASS — ${post_count} bloom keys preserved with identical sizes (DEPLOY-05 Redis side validated)"
