import { PlannerNav } from "@/components/layout/planner-nav";
import { requireUserOrRedirect } from "@/lib/auth";
import { log } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { getSchedulerContext } from "@/features/scheduler/queries/schedule.queries";
import { localWeek, todayLocalDate } from "@/features/scheduler/utils/timezone";
import { ChatPanel } from "@/features/assistant/components/chat-panel";
import { loadChatPanel } from "@/features/assistant/queries/chat.queries";

/** Planner shell: the tabs, and the 비서 chat (ADR 0042) on every tab. A chat load failure only hides the button. */
export default async function PlannerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUserOrRedirect();
  const supabase = await createClient();
  let chat: (Awaited<ReturnType<typeof loadChatPanel>> & { currentWeek: string }) | null = null;
  try {
    const [{ timezone, settings }, panel] = await Promise.all([getSchedulerContext(supabase, user.id), loadChatPanel(supabase, user.id)]);
    chat = { ...panel, currentWeek: localWeek(todayLocalDate(timezone), timezone, settings.week_starts_on).startDate };
  } catch (error) {
    log({ action: "assistant.chat.load", userId: user.id, success: false, errorCode: "INTERNAL_ERROR", detail: String(error) });
  }
  return (
    <>
      <header className="border-b border-border px-2 pt-3 sm:px-4 md:px-6">
        <div className="flex items-center gap-2 px-2 sm:px-0">
          <h1 className="text-lg font-semibold">플래너</h1>
          {chat && (
            <div className="ml-auto">
              <ChatPanel messages={chat.messages} proposals={chat.proposals} currentWeek={chat.currentWeek} />
            </div>
          )}
        </div>
        <div className="h-10">
          <PlannerNav />
        </div>
      </header>
      {children}
    </>
  );
}
