# 0012. Missed blocks and rescheduling
- Status: accepted
- Date: 2026-09-30

## Decision
- `schedule_blocks.status` adds `missed`, set only by `mark_missed_blocks(user)` (on page load and in the nightly
  duration-profile job). A block is missed when it ended without a linked session or a same-task session starting
  in [start − 30 min, end). "Not started" (start + 15 min, before the end) is derived in the UI, never stored.
- Missed blocks are history: they can't be moved or reopened, only cancelled ("미배정으로"). Rescheduling before
  the end moves the block (revision); after the end it creates a new block.
- `unschedule_block` cancels a planned/missed block and returns an idle planned task to the inbox when no other
  planned block remains.
- The recommendation confirm is an action toast, not a card beside the block (requirements §7 deviation): no
  calendar-anchored positioning, and it works on mobile and with screen readers.
- On mobile the ▶/⋯ controls are always visible instead of opening a bottom sheet (spec deviation). Same actions,
  fewer layers.
- D must not count resizes made within 5 minutes of a block's creation as rescheduling ("keep my estimate").
