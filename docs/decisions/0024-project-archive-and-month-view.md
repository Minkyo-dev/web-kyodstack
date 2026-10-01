# 0024 — Project archive folder and the scheduler month view

- Status: accepted
- Date: 2026-10-01

## Context
The user asked for (1) a place to put projects that are no longer used, (2) a month view next to the week view, and
(3) in-page help on each private page.

## Decisions
1. **Archive is a separate flag, not a status.** `projects.archived_at timestamptz` (null = not archived). A project
   keeps its status (a completed project can be archived, an archived one can be restored as it was). Archived projects
   are listed in a collapsed "아카이브" folder under the project list and leave the task pickers
   (`listProjectOptions`); a task already linked to one keeps the link (the drawer still offers its current project).
2. **Month view** is `/scheduler?view=month&month=yyyy-MM` (FullCalendar `dayGridMonth`, `@fullcalendar/daygrid`
   pinned). It loads blocks for the whole weeks around the month, shows plans only (no sessions), and lets a planned
   block move to another day keeping its time; creating and resizing stay in the week view. A day number opens that
   week. The week/month switch and navigation are links, so the view is in the URL.
3. **Help** text for the five pages lives in one dictionary (`src/lib/page-help.ts`) and uses the active
   terminology; `PageHelp` opens on hover and on click/focus (keyboard, touch).

## Consequences
- Archiving never touches tasks, blocks or stats.
- The month view does not show actual work; the week view stays the place for plan vs actual.
