"use client";

import { useState, useSyncExternalStore } from "react";
import { ChevronDown, ChevronRight, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActionRunner } from "@/hooks/use-action-runner";
import { QUEST_META } from "../domain/quest.types";
import { swapQuestObjectiveAction } from "../actions/quest.actions";
import { objectiveText, type QuestView } from "../utils/quest-view";
import { TERMS } from "@/lib/terms";

const KEY = "kyod.quests.collapsed";
const listeners = new Set<() => void>();
const readCollapsed = () => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

/** Quests above the Today sections (E2 spec §5). Symbols + text, never color alone. */
export function QuestPanel({ quests }: { quests: QuestView[] }) {
  const { run, pending } = useActionRunner();
  // Server and first client render: expanded; then the stored preference.
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, () => false);
  const [open, setOpen] = useState<string | null>(null);
  const toggle = () => {
    try {
      localStorage.setItem(KEY, collapsed ? "0" : "1");
    } catch {
      // Storage blocked: the panel just stays expanded.
    }
    listeners.forEach((l) => l());
  };
  // Habits are 습관 (ADR 0038); the metric daily quest is the DAILY QUEST.
  const label = (type: QuestView["type"]) => (type === "daily" ? TERMS.systemQuest : QUEST_META[type].label);
  const daily = quests.find((q) => q.type === "daily");
  const others = quests.filter((q) => q.type !== "daily");

  return (
    <section aria-label="퀘스트" className="mx-4 mb-2 rounded-md border border-border text-xs">
      <button type="button" onClick={toggle} aria-expanded={!collapsed} className="flex w-full items-center gap-1.5 px-3 py-2 font-mono tracking-wider">
        {collapsed ? <ChevronRight className="size-3.5" aria-hidden /> : <ChevronDown className="size-3.5" aria-hidden />}
        {TERMS.systemQuests}
        <span className="ml-auto text-muted-foreground">
          {quests.filter((q) => q.status === "cleared").length}/{quests.length} CLEARED
        </span>
      </button>
      {!collapsed && (
        <div className="space-y-2 border-t border-border px-3 py-2">
          {daily && <QuestBlock quest={daily} expanded />}
          {others.map((q) => (
            <div key={q.id}>
              <button type="button" onClick={() => setOpen(open === q.id ? null : q.id)} aria-expanded={open === q.id} className="flex w-full items-center gap-1.5 text-left">
                <span className="font-mono tracking-wider">{label(q.type)}</span>
                <span className="text-muted-foreground">· {q.title}</span>
                <span className="ml-auto tabular-nums text-muted-foreground">
                  {q.status === "cleared" ? "CLEARED" : `${q.objectives.filter((o) => o.done).length}/${q.objectives.length}`}
                </span>
              </button>
              {open === q.id && <QuestBlock quest={q} />}
            </div>
          ))}
        </div>
      )}
    </section>
  );

  function QuestBlock({ quest, expanded = false }: { quest: QuestView; expanded?: boolean }) {
    return (
      <div aria-label={`${label(quest.type)} ${quest.title}`} className="space-y-1">
        {expanded && (
          <p className="flex items-baseline gap-1.5">
            <span className="font-mono tracking-wider">{label(quest.type)}</span>
            <span className="text-muted-foreground">· {quest.title} · +{quest.rewardXp} XP</span>
            {quest.status === "cleared" && <span className="ml-auto font-mono">CLEARED</span>}
          </p>
        )}
        {expanded && quest.reason && (
          <p className="text-muted-foreground">
            <span className="font-mono tracking-wider">SYSTEM 추천</span> · {quest.reason}
          </p>
        )}
        <ul className="space-y-0.5">
          {quest.objectives.map((o) => (
            <li key={o.id} className="flex items-center gap-2">
              <span aria-hidden>{o.done ? "☑" : "☐"}</span>
              <span className="min-w-0 flex-1 tabular-nums">
                <span className="sr-only">{o.done ? "완료: " : "진행 중: "}</span>
                {objectiveText(o)}
              </span>
              {quest.canSwap && !o.done && (
                <Button size="xs" variant="ghost" disabled={pending} aria-label={`${objectiveText(o)} 교체`}
                  onClick={() => run(() => swapQuestObjectiveAction({ objectiveId: o.id }), { success: "목표를 바꿨습니다." })}>
                  <Repeat aria-hidden /> 교체
                </Button>
              )}
            </li>
          ))}
        </ul>
        {quest.type === "daily" && quest.swapUsed && <p className="text-muted-foreground">교체 사용함</p>}
      </div>
    );
  }
}
