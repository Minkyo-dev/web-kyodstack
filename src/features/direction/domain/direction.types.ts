import type { Tables } from "@/types/database";

export const MISSION_STATUSES = ["active", "achieved", "dropped"] as const;
export type MissionStatus = (typeof MISSION_STATUSES)[number];
export const PATH_STATUSES = ["active", "retired"] as const;
export type PathStatus = (typeof PATH_STATUSES)[number];
export const ARCHIVABLE_STATUSES = ["active", "archived"] as const;
export type ArchivableStatus = (typeof ARCHIVABLE_STATUSES)[number];
export const CRITERION_KINDS = ["check", "numeric"] as const;
export type CriterionKind = (typeof CRITERION_KINDS)[number];

export const MISSION_STATUS_LABEL: Record<MissionStatus, string> = {
  active: "진행 중",
  achieved: "달성",
  dropped: "중단",
};

export type Purpose = Omit<Tables<"purposes">, "status"> & { status: ArchivableStatus };
export type Identity = Omit<Tables<"identities">, "status"> & { status: ArchivableStatus };
export type Mission = Omit<Tables<"missions">, "status"> & { status: MissionStatus };
export type MissionCriterion = Omit<Tables<"mission_criteria">, "kind"> & { kind: CriterionKind };
export type Path = Omit<Tables<"paths">, "status"> & { status: PathStatus };
export type Protocol = Omit<Tables<"protocols">, "status"> & { status: ArchivableStatus };

/** Embedded mission/path shape on tasks and projects (TASK_SELECT). */
export type DirectionRef = { id: string; title: string; status: string };

/** Picker option: an active mission with the active protocols of its active path. */
export type MissionOption = { id: string; title: string; protocols: { id: string; title: string }[] };

export type MissionSummary = Mission & { identityIds: string[]; criteriaMet: number; criteriaTotal: number };

export type DirectiveView = { purpose: Purpose | null; identities: Identity[]; missions: MissionSummary[] };

export type MissionDetail = {
  mission: Mission & { identityIds: string[] };
  criteria: MissionCriterion[];
  activePath: Path | null;
  retiredPaths: Path[];
  protocols: Protocol[];
  projects: { id: string; name: string; status: string }[];
};
