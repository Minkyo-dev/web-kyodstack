"use client";

import { Label } from "@/components/ui/label";
import { useTerms } from "@/hooks/use-terms";
import type { BreadcrumbInput } from "../domain/breadcrumb";
import type { MissionOption } from "../domain/direction.types";

const selectClass = "h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30";

export function parseDirection(value: string): { missionId: string | null; protocolId: string | null } {
  if (value.startsWith("p:")) return { missionId: null, protocolId: value.slice(2) };
  if (value.startsWith("m:")) return { missionId: value.slice(2), protocolId: null };
  return { missionId: null, protocolId: null };
}

/** Mission → protocol picker. Keeps the current link selectable even when it is closed or retired now. */
export function DirectionPicker({
  task,
  options,
}: {
  task: BreadcrumbInput & { mission_id: string | null; protocol_id: string | null };
  options: MissionOption[];
}) {
  const terms = useTerms();
  const all = options.map((m) => ({ ...m, protocols: [...m.protocols] }));
  if (task.mission && !all.some((m) => m.id === task.mission!.id)) {
    all.push({ id: task.mission.id, title: task.mission.title, protocols: [] });
  }
  if (task.protocol && task.mission_id) {
    const owner = all.find((m) => m.id === task.mission_id);
    if (owner && !owner.protocols.some((p) => p.id === task.protocol!.id)) owner.protocols.push({ id: task.protocol.id, title: task.protocol.title });
  }
  const current = task.protocol_id ? `p:${task.protocol_id}` : task.mission_id ? `m:${task.mission_id}` : "";
  return (
    <div className="space-y-1">
      <Label htmlFor="task-direction" className="text-xs text-muted-foreground">{`${terms.mission} / ${terms.protocol}`}</Label>
      <select id="task-direction" name="direction" defaultValue={current} className={selectClass}>
        <option value="">연결 안 함</option>
        {all.map((m) => (
          <optgroup key={m.id} label={m.title}>
            <option value={`m:${m.id}`}>{m.title}</option>
            {m.protocols.map((p) => (
              <option key={p.id} value={`p:${p.id}`}>{`${m.title} › ${p.title}`}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}
