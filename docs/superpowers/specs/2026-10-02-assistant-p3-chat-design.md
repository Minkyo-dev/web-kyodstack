# Assistant P3 — chat assistant (비서)

- Date: 2026-10-02
- Status: accepted
- Umbrella: `2026-10-02-assistant-architecture.md`. Decisions: ADR 0042. Builds on P1 (brief), P2 (proposal inbox)
  and ADR 0041 (Gemini).

## 1. Goal
The owner can ask the planner in plain words, for example "오늘 뭐부터 하지?" or "영어 변화가 왜 안 나아가지?",
and get an answer grounded in their own data. The owner can also say "내일 보고서 2시간 잡아줘". Any change still
arrives as a proposal card in the chat and is applied with one click.

## 2. Shape: one call per message, with a precomputed snapshot
The umbrella design described read tools. P3 builds the snapshot those tools would have read **before** the call,
and sends it with the message in a **single** structured call. The reasons:
- The Gemini free tier allows 5 requests per minute, and the AI budget is 30 calls per day. An agent loop would
  spend 2–4 calls per message.
- Every number in the snapshot comes from code (umbrella principle 1). The model only reads it.

### Snapshot `chat-context-v1` (sanitised titles, ≤ ~6k chars)
- now: the local date and time, the phase, and the weekday.
- today: open tasks (≤ 30) with id, title, priority (1 = most important), due date, today's scheduled time and
  linked 변화; habits due today with their done status; yesterday's check-in (win, blocker).
- changes: active 변화 (≤ 5) with title, 달성 기준 progress, the next blueprint step, deadline and diagnosis signal
  layers.
- projects: active, unarchived projects (≤ 10) with name, progress % and target date.
- week: this week's planned and actual minutes, completed tasks, and the open coaching focus.
- history: the last 10 messages of the conversation.

## 3. Output (`chat-v1`)
```
{ reply: string ≤ 1200,
  proposals: [{ kind: "create_task", title ≤ 200, targetDate: "YYYY-MM-DD" | null,
                estimateMinutes: 5..600 | null, changeId: <id from snapshot> | null, why ≤ 120 }] ≤ 3 }
```
Code normalises the proposals:
- A `changeId` that is not in the snapshot is dropped.
- A past `targetDate` becomes null.
- Duplicate titles are removed.

Each proposal is stored in `assistant_proposals` with:
- kind `create_task`;
- `rules_version` `chat-v1`;
- `target_key` `chat:<message id>:<n>`;
- the current week as `week_start`.

The proposal card shows `why` as its reason. [적용] calls the existing `createTask` service, which does its own
ownership and validation checks.

## 4. Conversation
- Messages are stored in `assistant_messages` (user_id, role user | assistant, content ≤ 4000, proposal ids,
  created_at). Own select, insert and delete. There is no update.
- [새 대화] deletes the owner's messages. Proposals made from them stay in the inbox.
- Budget: each message is one `callAi` call of kind `chat`. Over the cap, the user sees `AI_BUDGET_EXCEEDED` and the
  user message is kept. A provider failure also keeps the user message and shows an error bubble.

## 5. UI
- A "비서" button sits at the right end of the planner tab bar on every tab (in `scheduler/layout.tsx`). It is in
  the header rather than floating, so it never covers the focus bar or other bottom controls. It opens a right-hand
  sheet, which is full width on mobile, containing:
  - the conversation;
  - proposal cards with [적용] / [넘기기] and their status;
  - an input box (Enter sends, Shift+Enter makes a new line);
  - when the conversation is empty, suggestion chips: "오늘 뭐부터 할까?", "이번 주 어땠어?", "막힌 변화 점검해줘".
- Replies are plain text with line breaks. No markdown is rendered.

## 6. Code
- `features/assistant/domain/chat.ts`: the pure `chatContextText(snapshot)`, the output schema and
  `normalizeChatProposals`.
- `features/assistant/queries/chat.queries.ts`: `loadChatSnapshot` and `listMessages`.
- `features/assistant/services/chat.service.ts`: `sendChatMessage` and `clearChat`.
- `features/ai/prompts/chat.prompt.ts`.
- `proposal.service`: `applyProposal` handles `create_task`, and `ensureWeeklyCoaching` counts only coach kinds.
- `features/assistant/components/chat-panel.tsx`.

## 7. Testing
- **Unit:** the normaliser (unknown change, past date, duplicates, cap), the context text (sanitised and bounded) and
  the schema.
- **SQL:** `assistant.sql` is extended for messages (own-only, no update) and the `create_task` kind.
- **E2E `assistant-chat.spec.ts`:** a seeded conversation and a `create_task` proposal appear in the panel;
  [적용] creates the task; [새 대화] clears the conversation. E2E never calls the LLM; the send path is covered by
  unit tests and a live smoke check.
