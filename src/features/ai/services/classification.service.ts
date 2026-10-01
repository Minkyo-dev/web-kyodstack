import "server-only";
import type { ActionContext } from "@/lib/action";
import { fromDbError } from "@/lib/errors";
import { CLASSIFY_PROMPT_VERSION, CLASSIFY_SYSTEM, classifyPrompt } from "../prompts/classify.prompt";
import { ClassifyOutputSchema } from "../schemas/classify.schema";
import { proposalRows, validateClassification, type FeatureType } from "../utils/classify";
import { sanitizeForPrompt } from "../utils/prompt-input";
import { callAi } from "./budget.service";

/** Ask for features of up to 20 tasks and store them as proposals. Returns the number of proposal rows. */
export async function classifyTasks(ctx: ActionContext, taskIds: string[]): Promise<number> {
  const ids = taskIds.slice(0, 20);
  if (ids.length === 0) return 0;
  const uid = ctx.user.id;
  const [tasks, domains, tags, taskTags, rejected] = await Promise.all([
    ctx.supabase.from("tasks").select("id, title, description, task_type, practice_domain_id, complexity").eq("user_id", uid).in("id", ids),
    ctx.supabase.from("practice_domains").select("id, name, parent_id").eq("user_id", uid),
    ctx.supabase.from("tags").select("id, name").eq("user_id", uid),
    ctx.supabase.from("task_tags").select("task_id, tag_id").eq("user_id", uid).in("task_id", ids),
    // Superseded proposals are closed by the system; only the user's rejections block a type.
    ctx.supabase.from("task_features").select("task_id, feature_type").eq("user_id", uid).eq("status", "rejected").neq("source", "system").in("task_id", ids),
  ]);
  for (const r of [tasks, domains, tags, taskTags, rejected]) if (r.error) throw fromDbError(r.error);
  if (!tasks.data!.length) return 0;

  const domainName = new Map(domains.data!.map((d) => [d.id, d.name]));
  const tagName = new Map(tags.data!.map((t) => [t.id, t.name]));
  const result = await callAi(ctx, "classify", {
    task: "classify_tasks",
    system: CLASSIFY_SYSTEM,
    prompt: classifyPrompt({
      tasks: tasks.data!.map((t) => ({ id: t.id, title: sanitizeForPrompt(t.title, 200), description: sanitizeForPrompt(t.description, 500) })),
      domains: domains.data!.map((d) => ({ id: d.id, name: d.name, parent: d.parent_id ? (domainName.get(d.parent_id) ?? null) : null })),
      tags: tags.data!.map((t) => t.name).slice(0, 200),
    }),
    schema: ClassifyOutputSchema,
    effort: "low",
  });
  const items = validateClassification(result.data, {
    taskIds: new Set(tasks.data!.map((t) => t.id)),
    domainIds: new Set(domains.data!.map((d) => d.id)),
  });

  const rows = items.flatMap((item) => {
    const t = tasks.data!.find((x) => x.id === item.taskId)!;
    return proposalRows(item, {
      task_type: t.task_type,
      practice_domain_id: t.practice_domain_id,
      complexity: t.complexity,
      tagNames: taskTags.data!.filter((x) => x.task_id === t.id).map((x) => tagName.get(x.tag_id) ?? ""),
      rejected: new Set(rejected.data!.filter((r) => r.task_id === t.id).map((r) => r.feature_type as FeatureType)),
    }).map((r) => ({
      user_id: uid,
      task_id: t.id,
      feature_type: r.feature_type,
      feature_value: r.feature_value as never,
      source: "ai",
      status: "proposed",
      confidence: item.confidence,
      model: result.model,
      prompt_version: CLASSIFY_PROMPT_VERSION,
    }));
  });
  if (rows.length === 0) return 0;
  // Replace open proposals of the same types.
  for (const t of new Set(rows.map((r) => r.task_id))) {
    const types = rows.filter((r) => r.task_id === t).map((r) => r.feature_type);
    const del = await ctx.supabase.from("task_features").update({ status: "rejected", decided_at: new Date().toISOString(), source: "system" })
      .eq("user_id", uid).eq("task_id", t).eq("status", "proposed").in("feature_type", types);
    if (del.error) throw fromDbError(del.error);
  }
  const ins = await ctx.supabase.from("task_features").insert(rows);
  if (ins.error) throw fromDbError(ins.error);
  return rows.length;
}
