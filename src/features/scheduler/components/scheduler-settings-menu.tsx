"use client";

import { Settings } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useActionRunner } from "@/hooks/use-action-runner";
import { updateSchedulerSettingsAction } from "../actions/schedule.actions";

/** User defaults for the scheduler view (calendar-planning design §2). */
export function SchedulerSettingsMenu({ showActualDefault }: { showActualDefault: boolean }) {
  const { run } = useActionRunner();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="스케줄러 설정"
        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Settings className="size-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuCheckboxItem
          checked={showActualDefault}
          onCheckedChange={(checked) =>
            run(() => updateSchedulerSettingsAction({ showActualDefault: Boolean(checked) }), {
              success: "기본 설정을 저장했습니다.",
            })
          }
        >
          실제 작업을 기본으로 표시
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
