import "server-only";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { fromDbError } from "@/lib/errors";
import type {
  DirectionRef,
  DirectiveView,
  Identity,
  Mission,
  MissionCriterion,
  MissionDetail,
  MissionOption,
  MissionSummary,
  Path,
  Protocol,
  Purpose,
} from "../domain/direction.types";

export async function loadDirective(supabase: SupabaseServerClient, userId: string): Promise<DirectiveView> {
  const [purpose, identities, missions, links, criteria] = await Promise.all([
    supabase.from("purposes").select("*").eq("user_id", userId).eq("status", "active").maybeSingle(),
    supabase.from("identities").select("*").eq("user_id", userId).order("sort_order").order("created_at"),
    supabase.from("missions").select("*").eq("user_id", userId).order("deadline", { nullsFirst: false }).order("created_at"),
    supabase.from("mission_identities").select("mission_id, identity_id").eq("user_id", userId),
    supabase.from("mission_criteria").select("mission_id, met_at").eq("user_id", userId),
  ]);
  for (const r of [purpose, identities, missions, links, criteria]) if (r.error) throw fromDbError(r.error);
  const summaries: MissionSummary[] = (missions.data as Mission[]).map((m) => {
    const own = criteria.data!.filter((c) => c.mission_id === m.id);
    return {
      ...m,
      identityIds: links.data!.filter((l) => l.mission_id === m.id).map((l) => l.identity_id),
      criteriaMet: own.filter((c) => c.met_at !== null).length,
      criteriaTotal: own.length,
    };
  });
  return {
    purpose: (purpose.data as Purpose | null) ?? null,
    identities: identities.data as Identity[],
    missions: summaries,
  };
}

export async function getMissionDetail(
  supabase: SupabaseServerClient,
  userId: string,
  missionId: string,
): Promise<MissionDetail | null> {
  const [mission, links, criteria, paths, protocols, projects] = await Promise.all([
    supabase.from("missions").select("*").eq("id", missionId).eq("user_id", userId).maybeSingle(),
    supabase.from("mission_identities").select("identity_id").eq("mission_id", missionId).eq("user_id", userId),
    supabase.from("mission_criteria").select("*").eq("mission_id", missionId).eq("user_id", userId).order("position").order("created_at"),
    supabase.from("paths").select("*").eq("mission_id", missionId).eq("user_id", userId).order("started_at", { ascending: false }),
    supabase.from("protocols").select("*").eq("mission_id", missionId).eq("user_id", userId).order("sort_order"),
    supabase.from("projects").select("id, name, status").eq("mission_id", missionId).eq("user_id", userId).order("name"),
  ]);
  for (const r of [mission, links, criteria, paths, protocols, projects]) if (r.error) throw fromDbError(r.error);
  if (!mission.data) return null;
  const allPaths = paths.data as Path[];
  const activePath = allPaths.find((p) => p.status === "active") ?? null;
  return {
    mission: { ...(mission.data as Mission), identityIds: links.data!.map((l) => l.identity_id) },
    criteria: criteria.data as MissionCriterion[],
    activePath,
    retiredPaths: allPaths.filter((p) => p.status === "retired"),
    protocols: (protocols.data as Protocol[]).filter((p) => p.path_id === activePath?.id && p.status === "active"),
    projects: projects.data!,
  };
}

/** Active missions with the active protocols of their active path (task drawer picker). */
export async function listMissionOptions(supabase: SupabaseServerClient, userId: string): Promise<MissionOption[]> {
  const [missions, protocols] = await Promise.all([
    supabase.from("missions").select("id, title").eq("user_id", userId).eq("status", "active").order("title"),
    supabase
      .from("protocols")
      .select("id, title, mission_id, sort_order, path:paths!protocols_path_id_mission_id_fkey(status)")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("sort_order"),
  ]);
  if (missions.error) throw fromDbError(missions.error);
  if (protocols.error) throw fromDbError(protocols.error);
  return missions.data.map((m) => ({
    id: m.id,
    title: m.title,
    protocols: protocols.data
      .filter((p) => p.mission_id === m.id && p.path?.status === "active")
      .map((p) => ({ id: p.id, title: p.title })),
  }));
}

export async function getMissionRef(
  supabase: SupabaseServerClient,
  userId: string,
  missionId: string,
): Promise<DirectionRef | null> {
  const { data, error } = await supabase
    .from("missions")
    .select("id, title, status")
    .eq("id", missionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw fromDbError(error);
  return data;
}
