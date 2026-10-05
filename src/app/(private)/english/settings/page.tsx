import { requireUserOrRedirect } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { NotionPageRef } from "@/lib/notion/types";
import { ConnectCard } from "@/features/vocab/components/connect-card";
import { ConnectionPanel } from "@/features/vocab/components/connection-panel";
import { DatabaseSetup } from "@/features/vocab/components/database-setup";
import { ReauthBanner } from "@/features/vocab/components/reauth-banner";
import { ReminderForm, StudySettingsForm, WritebackStatus } from "@/features/vocab/components/study-settings-form";
import { connectErrorMessage, setupState } from "@/features/vocab/domain/connection";
import { getConnectionView } from "@/features/vocab/services/connection.service";
import { pendingWritebacks } from "@/features/vocab/services/outbox.service";
import { getStudySettings } from "@/features/vocab/services/settings.service";
import { inspectSchema, listParentPages, type SchemaState } from "@/features/vocab/services/setup.service";

export default async function EnglishSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; setup?: string }> }) {
  const user = await requireUserOrRedirect();
  const supabase = await createClient();
  const ctx = { user, supabase };
  const { error } = await searchParams;
  const errorMessage = connectErrorMessage(error);
  const view = await getConnectionView(supabase, user.id);
  const state = setupState(view);

  let pages: NotionPageRef[] | "error" = [];
  if (state === "pick_page") pages = await listParentPages(ctx).catch(() => "error" as const);
  let schema: SchemaState | "unknown" = "unknown";
  if (state === "ready") schema = await inspectSchema(ctx).catch(() => "unknown" as const);
  const [settings, writebacks] = await Promise.all([getStudySettings(supabase, user.id), state === "ready" ? pendingWritebacks(ctx) : null]);

  return (
    <div className="max-w-xl space-y-4">
      {errorMessage && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          {errorMessage}
        </p>
      )}
      <section className="space-y-3">
        <h2 className="font-semibold">Notion 연결</h2>
        {state === "not_connected" && <ConnectCard />}
        {state === "reauth" && <ReauthBanner />}
        {state === "pick_page" && (
          <div className="space-y-3 rounded-lg border bg-card p-5">
            <p className="text-sm">
              <span className="text-muted-foreground">워크스페이스</span> {view?.workspaceName ?? "이름 없음"}
            </p>
            <DatabaseSetup pages={pages} />
          </div>
        )}
        {state === "ready" && (
          <div className="space-y-4 rounded-lg border bg-card p-5">
            <ConnectionPanel workspaceName={view?.workspaceName ?? null} databaseUrl={view?.databaseUrl ?? null} schema={schema} />
            {writebacks && <WritebackStatus pending={writebacks.pending} stuck={writebacks.stuck} />}
          </div>
        )}
      </section>
      <section className="space-y-3">
        <h2 className="font-semibold">학습</h2>
        <div className="rounded-lg border bg-card p-5">
          <StudySettingsForm settings={settings} />
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="font-semibold">알림</h2>
        <div className="rounded-lg border bg-card p-5">
          <ReminderForm enabled={settings.reminderEnabled} time={settings.reminderTime} />
        </div>
      </section>
    </div>
  );
}
