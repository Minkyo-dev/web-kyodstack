# 0013. Classification axes, tags and estimator v2
- Status: accepted
- Date: 2026-09-30

## Context
Requirements (improve-requirements-2 §25, §39, §44–§46) group duration history by task type and similar work,
and ask for a range and a confidence instead of one number. Before this, learning was keyed by free-text templates
and complexity.

## Decision
- **Three axes:**
  - A fixed `task_type` list.
  - A user-owned hierarchical `practice_domains`.
  - Free `tags` (a table plus a `task_tags` join, not `text[]`, so renames, autocomplete and tag stats stay simple).
- **Tag names** are 1–100 characters without `#` or `,`. The inline `#token` syntax only matches
  `[\p{L}\p{N}_-]+`. Names with spaces (e.g. migrated template names) are attached through autocomplete chips or
  the drawer.
- **Templates** stay as presets (type, domain, tags, default estimate). Their names were migrated into tags on their
  tasks, so learning continues through the tag fallback before types are assigned.
- **Estimator v2:**
  - Groups type×domain → type → tag, with ≥ 3 samples each.
  - Estimate × median clamped ratio, or median actual when there is no estimate.
  - A p25–p75 range and a confidence (high/medium/low). Low confidence shows only the range.
  - Complexity is no longer part of grouping; F revisits it as an AI-proposed feature.
- `duration_groups` replaces `task_duration_profiles`. It is rebuilt in full per user (bounded to the 500 most
  recent completed tasks) after learning-relevant writes, and nightly.

## Consequences
- Reason texts name the group ("코딩 · Data Eng 비슷한 작업 9개", "#태그 태그 작업 N개").
- Stats (D2) are keyed by task type; tags are only a recommendation fallback and a filter.
- Rebuild cost grows with history but is bounded by the candidate limit.
