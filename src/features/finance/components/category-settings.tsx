"use client";

import { useState } from "react";
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useActionRunner } from "@/hooks/use-action-runner";
import { cn } from "@/lib/utils";
import {
  createCategoryAction,
  deleteCategoryAction,
  reorderCategoriesAction,
  setCategoryActiveAction,
  updateCategoryAction,
} from "../actions/finance.actions";
import { buildCategoryTree, dropInOrder, moveInOrder } from "../domain/category-tree";
import { CATEGORY_TYPES, CATEGORY_TYPE_LABEL, type Category, type CategoryType } from "../domain/finance.types";
import { useFinance } from "./finance-provider";
import { Field, selectClass } from "./transaction-form";

const ICONS = ["🍽️", "🛒", "☕", "🏠", "💡", "🚇", "🚗", "🛍️", "🎬", "🏥", "📚", "✈️", "🎁", "👶", "🐶", "📦", "💼", "📈", "💰", "🧑‍💻"];

function CategoryForm({
  type,
  category,
  parentId,
  onDone,
}: {
  type: CategoryType;
  category?: Category;
  parentId: string | null;
  onDone: () => void;
}) {
  const f = useFinance();
  const { run, pending } = useActionRunner();
  const [icon, setIcon] = useState(category?.icon ?? "");
  const p = category ? `cat-${category.id.slice(0, 8)}` : `cat-new-${parentId?.slice(0, 8) ?? type}`;
  const hasChildren = !!category && f.categories.some((c) => c.parent_id === category.id);
  const parents = f.categories.filter((c) => c.type === type && !c.parent_id && c.id !== category?.id && c.is_active);
  return (
    <form
      aria-label={category ? `${category.name} 수정` : "새 카테고리"}
      className="space-y-3 rounded-lg border border-border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const name = String(fd.get("name") ?? "");
        const parent = category ? String(fd.get("parentId") ?? "") || null : parentId;
        run(
          () =>
            category
              ? updateCategoryAction({ categoryId: category.id, name, icon, parentId: parent })
              : createCategoryAction({ type, name, icon, parentId: parent }),
          { success: category ? "카테고리를 수정했습니다." : "카테고리를 추가했습니다.", onSuccess: onDone },
        );
      }}
    >
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <Field label="이름" htmlFor={`${p}-name`}>
          <Input id={`${p}-name`} name="name" defaultValue={category?.name} required maxLength={100} autoFocus />
        </Field>
        <Field label="아이콘 (선택)" htmlFor={`${p}-icon`}>
          <Input id={`${p}-icon`} value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={8} className="w-20 text-center" />
        </Field>
      </div>
      <div className="flex flex-wrap gap-1" role="group" aria-label="아이콘 고르기">
        {ICONS.map((i) => (
          <button
            key={i}
            type="button"
            aria-label={`아이콘 ${i}`}
            aria-pressed={icon === i}
            onClick={() => setIcon(icon === i ? "" : i)}
            className={cn("size-7 rounded-md text-base hover:bg-muted", icon === i && "bg-accent ring-1 ring-ring")}
          >
            {i}
          </button>
        ))}
      </div>
      {category && (
        <Field label="위치" htmlFor={`${p}-parent`}>
          <select id={`${p}-parent`} name="parentId" defaultValue={category.parent_id ?? ""} className={selectClass} disabled={hasChildren}>
            <option value="">최상위</option>
            {parents.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} 아래
              </option>
            ))}
          </select>
          {hasChildren && <p className="text-xs text-muted-foreground">하위 카테고리가 있어 옮길 수 없습니다.</p>}
        </Field>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone} disabled={pending}>
          취소
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          저장
        </Button>
      </div>
    </form>
  );
}

/** Logical delete (ADR 0027), confirmed first: unlike archive it cannot be undone from the UI. */
function DeleteCategoryButton({ category, childCount }: { category: Category; childCount: number }) {
  const { run, pending } = useActionRunner();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`${category.name} 삭제`}
        className="text-muted-foreground hover:text-destructive"
        onClick={() => setOpen(true)}
      >
        <Trash2 aria-hidden />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>‘{category.name}’ 카테고리를 삭제할까요?</DialogTitle>
            <DialogDescription>
              설정과 카테고리 선택지에서 사라지며 되돌릴 수 없습니다. 이미 기록된 거래는 그대로 남고, 거래에는 이
              카테고리 이름이 계속 표시됩니다.
              {childCount > 0 && ` 하위 카테고리 ${childCount}개도 함께 삭제됩니다.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              취소
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                run(() => deleteCategoryAction({ id: category.id }), {
                  success: "카테고리를 삭제했습니다.",
                  onSuccess: () => setOpen(false),
                })
              }
            >
              <Trash2 aria-hidden />
              삭제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CategoryItem({
  category,
  siblings,
  depth,
  childCount = 0,
  dragging,
  setDragging,
  onAddChild,
}: {
  category: Category;
  siblings: string[];
  depth: 0 | 1;
  childCount?: number;
  dragging: string | null;
  setDragging: (id: string | null) => void;
  onAddChild?: () => void;
}) {
  const { run, pending } = useActionRunner();
  const [editing, setEditing] = useState(false);
  const [over, setOver] = useState(false);
  const i = siblings.indexOf(category.id);
  const reorder = (ids: string[] | null) => ids && run(() => reorderCategoriesAction({ ids }));
  const canDrop = !!dragging && dragging !== category.id && siblings.includes(dragging);

  if (editing) {
    return (
      <div className={cn("py-2", depth === 1 && "pl-6")}>
        <CategoryForm type={category.type as CategoryType} category={category} parentId={category.parent_id} onDone={() => setEditing(false)} />
      </div>
    );
  }
  return (
    <div
      draggable={category.is_active}
      onDragStart={(e) => {
        e.stopPropagation();
        e.dataTransfer.effectAllowed = "move";
        setDragging(category.id);
      }}
      onDragEnd={() => setDragging(null)}
      onDragOver={(e) => {
        if (!canDrop) return;
        e.preventDefault();
        e.stopPropagation();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        if (canDrop) reorder(dropInOrder(siblings, dragging!, category.id));
        setDragging(null);
      }}
      className={cn(
        "flex items-center gap-1.5 py-1.5",
        depth === 1 && "pl-6",
        over && "border-t-2 border-ring",
        dragging === category.id && "opacity-50",
        !category.is_active && "text-muted-foreground",
      )}
    >
      {category.is_active ? (
        <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground" aria-hidden />
      ) : (
        <span className="w-4" />
      )}
      <span className="w-6 text-center" aria-hidden>
        {category.icon}
      </span>
      <span className={cn("min-w-0 flex-1 truncate text-sm", depth === 0 && "font-medium")}>
        {category.name}
        {!category.is_active && <span className="ml-2 rounded-sm border border-border px-1 text-[10px]">보관됨</span>}
      </span>
      {category.is_active && (
        <>
          <Button variant="ghost" size="icon-xs" aria-label={`${category.name} 위로`} disabled={pending || i <= 0} onClick={() => reorder(moveInOrder(siblings, category.id, -1))}>
            <ArrowUp aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`${category.name} 아래로`}
            disabled={pending || i < 0 || i >= siblings.length - 1}
            onClick={() => reorder(moveInOrder(siblings, category.id, 1))}
          >
            <ArrowDown aria-hidden />
          </Button>
          {onAddChild && (
            <Button variant="ghost" size="icon-xs" aria-label={`${category.name}에 하위 카테고리 추가`} onClick={onAddChild}>
              <Plus aria-hidden />
            </Button>
          )}
          <Button variant="ghost" size="icon-xs" aria-label={`${category.name} 수정`} onClick={() => setEditing(true)}>
            <Pencil aria-hidden />
          </Button>
        </>
      )}
      <Button
        variant="ghost"
        size="xs"
        disabled={pending}
        aria-label={`${category.name} ${category.is_active ? "보관" : "복원"}`}
        onClick={() =>
          run(() => setCategoryActiveAction({ id: category.id, active: !category.is_active }), {
            success: category.is_active ? "보관했습니다. 기존 거래에는 계속 표시됩니다." : "복원했습니다.",
          })
        }
      >
        {category.is_active ? <Archive aria-hidden /> : <ArchiveRestore aria-hidden />}
        <span className="hidden sm:inline">{category.is_active ? "보관" : "복원"}</span>
      </Button>
      <DeleteCategoryButton category={category} childCount={childCount} />
    </div>
  );
}

/**
 * Categories (spec §25): shared by the household; two levels; drag & drop or arrows to reorder; archive, or delete
 * logically (ADR 0027).
 */
export function CategorySettings() {
  const f = useFinance();
  const [type, setType] = useState<CategoryType>("EXPENSE");
  const [adding, setAdding] = useState<{ parentId: string | null } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const tree = buildCategoryTree(f.categories, type);
  const topIds = tree.filter((c) => c.is_active).map((c) => c.id);

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="카테고리 종류" className="flex w-fit rounded-lg border border-border p-0.5">
        {CATEGORY_TYPES.map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={type === t}
            onClick={() => {
              setType(t);
              setAdding(null);
            }}
            className={cn("rounded-md px-3 py-1 text-sm", type === t ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            {CATEGORY_TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      <ul role="tabpanel" aria-label={`${CATEGORY_TYPE_LABEL[type]} 카테고리`} className="divide-y divide-border border-y border-border">
        {tree.map((node) => {
          const childIds = node.children.filter((c) => c.is_active).map((c) => c.id);
          return (
            <li key={node.id} className="py-1">
              <CategoryItem
                category={node}
                siblings={topIds}
                depth={0}
                childCount={node.children.length}
                dragging={dragging}
                setDragging={setDragging}
                onAddChild={() => setAdding({ parentId: node.id })}
              />
              {node.children.length > 0 && (
                <ul aria-label={`${node.name} 하위 카테고리`}>
                  {node.children.map((child) => (
                    <li key={child.id}>
                      <CategoryItem category={child} siblings={childIds} depth={1} dragging={dragging} setDragging={setDragging} />
                    </li>
                  ))}
                </ul>
              )}
              {adding?.parentId === node.id && (
                <div className="py-2 pl-6">
                  <CategoryForm type={type} parentId={node.id} onDone={() => setAdding(null)} />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {adding?.parentId === null ? (
        <CategoryForm type={type} parentId={null} onDone={() => setAdding(null)} />
      ) : (
        <Button variant="outline" onClick={() => setAdding({ parentId: null })}>
          <Plus aria-hidden />
          {CATEGORY_TYPE_LABEL[type]} 카테고리 추가
        </Button>
      )}
    </div>
  );
}
