---
status: partial
phase: 08-next-js-dashboard-alerts-charts
source: [08-VERIFICATION.md]
started: 2026-05-05T00:00:00Z
updated: 2026-05-05T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Condition type selector — conditional field reveal
expected: Switching "New item" → "Field changed" shows a "Field path" input; switching to "Threshold" shows both "Field path" and "Threshold value" inputs; switching back to "New item" hides both extra inputs
result: [pending]

### 2. Edit mode pre-population with discriminated union
expected: Opening the edit modal on a threshold rule pre-populates the condition type selector as "Threshold", the fieldPath input with the stored value, and the threshold number input with the stored value
result: [pending]

### 3. Source selector disabled in edit mode
expected: The Source dropdown is visually disabled (greyed out / not interactive) when editing an existing alert rule; it is enabled when adding a new rule
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
