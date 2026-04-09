---
status: partial
phase: 02-full-url-frontier-crawl-hardening
source: [02-VERIFICATION.md]
started: 2026-04-09T00:00:00Z
updated: 2026-04-09T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Five sources produce non-empty raw data
expected: When schedulers trigger, all five sources (football-data.org, HoYoWiki, Riot/u.gg, AniList, MangaDex) log non-empty crawl results
result: [pending]

### 2. Bloom Filter blocks duplicate enqueue
expected: Submitting the same URL twice results in exactly one job — second call logs 'URL already seen' and creates no second BullMQ job
result: [pending]

### 3. robots.txt disallow skips without consuming retry budget
expected: A URL disallowed by robots.txt transitions to `completed` (not `failed`) in BullMQ — confirming the policy skip does not use retry attempts
result: [pending]

### 4. Three-failure retry exhaustion → dead-letter state
expected: A crawl job that fails three times transitions to `status='failed'` dead-letter state visible in BullMQ failed set
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
