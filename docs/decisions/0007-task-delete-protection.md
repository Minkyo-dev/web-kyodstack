# 0007. Tasks with logged work cannot be hard-deleted
- Status: accepted
- Date: 2026-09-29

## Context
Spec §4.1 requires deleting tasks, while §2 and §75 say historical work data is the core asset.
`work_sessions.task_id` cascades on delete.

## Decision
`deleteTask` refuses (CONFLICT) when the task has any work session. The user can cancel the task
instead (status `cancelled`). Tasks without logged work can be hard-deleted.
