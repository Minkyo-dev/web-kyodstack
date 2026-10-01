# 0020 — Direction layer (purpose, identities, missions, paths, protocols)

- Status: accepted
- Date: 2026-09-30
- Spec: docs/superpowers/specs/2026-09-30-direction-layer-g1-design.md (umbrella: …-direction-layer-architecture.md)

## Context
improve-requirements-3 adds Purpose → Identity → Goal → Strategy → Tactic above quests. The repo already has projects
and milestones ("Main Quest = project") and rule-generated daily quests.

## Decisions
1. **Mission ↔ project:** a project belongs to a mission (`projects.mission_id`, nullable). Projects stay as work
   bundles; missions are outcomes.
2. **Names in code:** `purpose`, `identity`, `mission`, `path`, `protocol` (not goal/strategy/tactic): `goal` collides
   with quest objectives and the UI says MISSION/PATH/PROTOCOL.
3. **Growth / Maintenance is derived:** effective mission = `task.mission_id ?? project.mission_id`; none → maintenance.
   Not stored, so it can't drift. Exposed as `task_plan_actual.effective_mission_id`.
4. **Agreement rule in the service, not a trigger:** a task's mission (direct or via its protocol) must equal its
   project's mission when both are set; a project can't move to a mission its tasks disagree with. The protocol ⇒
   mission part is a composite FK.
5. **One active path per mission, retired paths are read-only history** (partial unique index + triggers);
   `switch_path` retires and inserts atomically and archives the old path's protocols. Tasks keep their protocol links.
6. **Only new links must be active.** Closing a mission or retiring a path never breaks existing links or saves.
7. **Single active purpose** (partial unique index); setting a new one archives the old one.

## Consequences
- No backfill: every existing task starts as maintenance.
- Hard-deleting a mission/path/protocol with references is blocked (NO ACTION); the UI only closes/archives.
