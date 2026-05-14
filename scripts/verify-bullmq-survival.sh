#!/usr/bin/env bash
# SC-5 validation: `docker compose restart crawler` does not duplicate or lose in-flight BullMQ jobs.
# Idempotent. Requires the crawler to have at least one active queue (Plan 10-05 prerequisite).
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
REDIS_SVC="${REDIS_SVC:-redis}"
CRAWLER_SVC="${CRAWLER_SVC:-crawler}"
BULL_KEY_PREFIX="${BULL_KEY_PREFIX:-bull:}"

echo "[verify-bullmq] using compose file: ${COMPOSE_FILE}"

# 1. Snapshot bull:* keys pre-restart. Capture id sets per queue to detect duplication.
pre_keys=$(docker compose -f "${COMPOSE_FILE}" exec -T "${REDIS_SVC}" redis-cli --no-raw KEYS "${BULL_KEY_PREFIX}*" | sort | tr -d '\r')
pre_count=$(printf '%s\n' "${pre_keys}" | grep -c . || true)

if [[ "${pre_count}" -eq 0 ]]; then
  echo "[verify-bullmq] FAIL: no BullMQ keys matching ${BULL_KEY_PREFIX}* exist. Trigger a crawl first."
  exit 1
fi
echo "[verify-bullmq] pre-restart: ${pre_count} bull keys present"

# Capture all job IDs from every queue's :id key (BullMQ counter).
pre_id_snapshot=$(mktemp)
while read -r key; do
  [[ -z "${key}" ]] && continue
  # Sample key value (string keys); SMEMBERS / LRANGE / ZRANGE depending on type — use TYPE then read.
  key_type=$(docker compose -f "${COMPOSE_FILE}" exec -T "${REDIS_SVC}" redis-cli TYPE "${key}" | tr -d '\r')
  case "${key_type}" in
    string)  val=$(docker compose -f "${COMPOSE_FILE}" exec -T "${REDIS_SVC}" redis-cli GET "${key}" | tr -d '\r') ;;
    list)    val=$(docker compose -f "${COMPOSE_FILE}" exec -T "${REDIS_SVC}" redis-cli LRANGE "${key}" 0 -1 | tr -d '\r') ;;
    set)     val=$(docker compose -f "${COMPOSE_FILE}" exec -T "${REDIS_SVC}" redis-cli SMEMBERS "${key}" | sort | tr -d '\r') ;;
    zset)    val=$(docker compose -f "${COMPOSE_FILE}" exec -T "${REDIS_SVC}" redis-cli ZRANGE "${key}" 0 -1 | tr -d '\r') ;;
    hash)    val=$(docker compose -f "${COMPOSE_FILE}" exec -T "${REDIS_SVC}" redis-cli HGETALL "${key}" | tr -d '\r') ;;
    *)       val="<type=${key_type}>" ;;
  esac
  printf '%s\t%s\n' "${key}" "${val}" >> "${pre_id_snapshot}"
done <<< "${pre_keys}"

# 2. Restart crawler (BullMQ workers exit; jobs in-flight should be re-queued by BullMQ stall-recovery).
echo "[verify-bullmq] restarting crawler..."
docker compose -f "${COMPOSE_FILE}" restart "${CRAWLER_SVC}" >/dev/null

# Wait for crawler health.
for i in $(seq 1 60); do
  status=$(docker compose -f "${COMPOSE_FILE}" ps "${CRAWLER_SVC}" --format json 2>/dev/null | grep -oE '"Health":"[^"]*"' | head -1 || true)
  if echo "${status}" | grep -q '"Health":"healthy"' || docker compose -f "${COMPOSE_FILE}" ps "${CRAWLER_SVC}" | grep -q "running"; then
    break
  fi
  sleep 1
  if [[ "${i}" -eq 60 ]]; then
    echo "[verify-bullmq] FAIL: crawler did not return to healthy within 60s"
    exit 1
  fi
done
echo "[verify-bullmq] crawler back online"

# 3. Snapshot post-restart.
post_keys=$(docker compose -f "${COMPOSE_FILE}" exec -T "${REDIS_SVC}" redis-cli --no-raw KEYS "${BULL_KEY_PREFIX}*" | sort | tr -d '\r')
post_count=$(printf '%s\n' "${post_keys}" | grep -c . || true)

# 4. Assertion A: key count does not DECREASE (no job-loss). Increase is allowed (new jobs may have been queued).
if [[ "${post_count}" -lt "${pre_count}" ]]; then
  echo "[verify-bullmq] FAIL: bull key count decreased across restart (pre=${pre_count}, post=${post_count}) — possible job loss"
  diff <(printf '%s\n' "${pre_keys}") <(printf '%s\n' "${post_keys}") || true
  exit 1
fi

# 5. Assertion B: per-queue :id counter is monotonic (non-decreasing). Detects ID reset = duplication risk.
while read -r line; do
  key=$(printf '%s' "${line}" | cut -f1)
  pre_val=$(printf '%s' "${line}" | cut -f2-)
  # Only check :id keys (BullMQ job id counter is a string).
  if [[ "${key}" != *":id" ]]; then
    continue
  fi
  post_val=$(docker compose -f "${COMPOSE_FILE}" exec -T "${REDIS_SVC}" redis-cli GET "${key}" | tr -d '\r')
  if [[ -z "${post_val}" ]]; then
    echo "[verify-bullmq] FAIL: ${key} disappeared after restart"
    exit 1
  fi
  if [[ "${post_val}" -lt "${pre_val}" ]]; then
    echo "[verify-bullmq] FAIL: ${key} regressed (pre=${pre_val}, post=${post_val}) — duplicate IDs possible"
    exit 1
  fi
done < "${pre_id_snapshot}"

rm -f "${pre_id_snapshot}"

echo "[verify-bullmq] PASS — ${post_count} bull keys present, all :id counters monotonic (no job loss / no ID reset)"
