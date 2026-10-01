import type { Category, CategoryType } from "./finance.types";

export type CategoryNode = Category & { children: Category[] };

const bySort = (a: Category, b: Category) => a.sort_order - b.sort_order || a.name.localeCompare(b.name);

/** Two-level tree (spec §7) of one type, siblings in sort order. Orphans (parent missing) are shown at the top level. */
export function buildCategoryTree(categories: Category[], type: CategoryType): CategoryNode[] {
  const ofType = categories.filter((c) => c.type === type);
  const ids = new Set(ofType.map((c) => c.id));
  return ofType
    .filter((c) => !c.parent_id || !ids.has(c.parent_id))
    .sort(bySort)
    .map((parent) => ({
      ...parent,
      children: ofType.filter((c) => c.parent_id === parent.id).sort(bySort),
    }));
}

export type CategoryOption = { id: string; label: string; depth: 0 | 1 };

/**
 * Picker options for a transaction (spec §25): active categories only, except `keepId` (the transaction's current
 * category stays selectable after it is archived). A child of an archived parent is still offered.
 */
export function categoryOptions(categories: Category[], type: CategoryType, keepId?: string | null): CategoryOption[] {
  const visible = (c: Category) => c.is_active || c.id === keepId;
  const options: CategoryOption[] = [];
  for (const node of buildCategoryTree(categories, type)) {
    if (visible(node)) options.push({ id: node.id, label: node.name, depth: 0 });
    for (const child of node.children) {
      if (visible(child)) options.push({ id: child.id, label: `${node.name} > ${child.name}`, depth: 1 });
    }
  }
  return options;
}

/** Moves `id` one step up or down among `siblings` (already in order); returns the new id order or null at an edge. */
export function moveInOrder(siblingIds: string[], id: string, direction: -1 | 1): string[] | null {
  const i = siblingIds.indexOf(id);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= siblingIds.length) return null;
  const next = [...siblingIds];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** Drag & drop: puts `id` where `targetId` is, shifting the rest. */
export function dropInOrder(siblingIds: string[], id: string, targetId: string): string[] | null {
  if (id === targetId) return null;
  const from = siblingIds.indexOf(id);
  const to = siblingIds.indexOf(targetId);
  if (from < 0 || to < 0) return null;
  const next = [...siblingIds];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}
