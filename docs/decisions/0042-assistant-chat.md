# 0042 — Assistant P3: chat as one grounded call per message

- Status: accepted
- Date: 2026-10-02
- Spec: docs/superpowers/specs/2026-10-02-assistant-p3-chat-design.md

## Context
P3 adds a chat assistant. The umbrella design described read tools and write tools. The AI now runs on the Gemini
free tier (ADR 0041, 5 requests per minute) under a 30-calls-per-day budget, so a multi-step tool loop would spend
the budget quickly and fail on rate limits.

## Decisions
1. **No tool loop.** The server builds a bounded snapshot (`chat-context-v1`) from code. It covers today's tasks and
   habits, active changes with progress, next step and diagnosis layers, active projects, this week's figures, the
   coaching focus and the last 10 messages. One structured call answers. A message therefore costs exactly one call
   (`ai_calls.kind = chat`).
2. **The only write is a proposal.** The output may contain up to 3 `create_task` proposals. Code drops unknown
   change ids, clears past dates and removes duplicate titles, then stores them in `assistant_proposals`
   (`rules_version = chat-v1`). They are applied through `createTask`, so its validation and ownership checks hold.
   The model never writes rows.
3. **The weekly coaching check counts only coach rows.** `ensureWeeklyCoaching` checks for existing
   `rule_minutes` / `habit_days` / `review` rows, so a chat proposal made earlier in the week cannot block the
   week's coaching.
4. **Conversation storage.** `assistant_messages` has own select, insert and delete, and no update. [새 대화]
   deletes the owner's messages. Proposals made from them stay in the inbox.
5. **Failure handling.** When the budget is exceeded or the provider fails, the user's message is kept, an error is
   shown, and no assistant message is stored.
6. **Where proposals show.** Chat proposals appear in the chat, under the message that made them. The 주간 회고
   "코칭" section lists only the coach kinds. Both kinds share the same table and the same apply/dismiss path.
7. **Tone.** The prompt requires neutral, non-judging wording and answers drawn from the snapshot only. Replies are
   long, so they are not dropped by `DENY_LIST` the way the one-line brief is; the prompt carries that rule.

## Consequences
- The assistant cannot look up data outside the snapshot, such as older weeks or a single task's full history. That
  is a deliberate limit of v1. A tool loop can be added later behind the same panel if the budget allows.
- E2E covers the UI with seeded rows. The live LLM path is covered by unit tests of the normaliser and by a smoke
  check.
