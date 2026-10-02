"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useActionRunner } from "@/hooks/use-action-runner";
import {
  createDomainAction,
  deleteDomainAction,
  deleteTagAction,
  updateDomainAction,
  updateTagAction,
  updateTemplateClassificationAction,
} from "../actions/classification.actions";
import { TAG_COLORS, type DomainRef, type TagColor, type TagRef } from "../domain/classification.types";
import type { TemplateWithClassification } from "../queries/classification.queries";
import { DomainSelect, TypeSelect } from "./classification-fields";
import { nativeSelectClass } from "@/components/ui/native-select";
import { TERMS } from "@/lib/terms";

const COLOR_LABEL: Record<TagColor, string> = {
  gray: "회색",
  red: "빨강",
  orange: "주황",
  yellow: "노랑",
  green: "초록",
  blue: "파랑",
  purple: "보라",
  pink: "분홍",
};
const selectClass = nativeSelectClass;

/** Tags, practice domains and templates in one place (D1 spec §3). */
export function ClassificationDialog({
  open,
  onOpenChange,
  tags,
  domains,
  templates,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tags: TagRef[];
  domains: DomainRef[];
  templates: TemplateWithClassification[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>분류 관리</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="tags">
          <TabsList>
            <TabsTrigger value="tags">태그</TabsTrigger>
            <TabsTrigger value="domains">영역</TabsTrigger>
            <TabsTrigger value="templates">템플릿</TabsTrigger>
          </TabsList>
          <TabsContent value="tags" className="space-y-2 pt-3">
            {tags.length === 0 && <p className="text-sm text-muted-foreground">아직 태그가 없습니다. {TERMS.task}에 #태그를 붙여 보세요.</p>}
            {tags.map((t) => (
              <TagRow key={t.id} tag={t} />
            ))}
          </TabsContent>
          <TabsContent value="domains" className="space-y-2 pt-3">
            <DomainCreate domains={domains} />
            {domains.map((d) => (
              <DomainRow key={d.id} domain={d} domains={domains} />
            ))}
          </TabsContent>
          <TabsContent value="templates" className="space-y-3 pt-3">
            {templates.length === 0 && <p className="text-sm text-muted-foreground">템플릿이 없습니다.</p>}
            {templates.map((t) => (
              <TemplateRow key={t.id} template={t} tags={tags} domains={domains} />
            ))}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function TagRow({ tag }: { tag: TagRef }) {
  const { run, pending } = useActionRunner();
  const [confirm, setConfirm] = useState(false);
  return (
    <form
      aria-label={`태그 ${tag.name}`}
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const color = String(fd.get("color") ?? "");
        run(
          () => updateTagAction({ tagId: tag.id, name: String(fd.get("name") ?? ""), color: color || null }),
          { success: "저장했습니다." },
        );
      }}
    >
      <label htmlFor={`tag-name-${tag.id}`} className="sr-only">
        태그 이름
      </label>
      <Input id={`tag-name-${tag.id}`} name="name" defaultValue={tag.name} maxLength={100} required />
      <label htmlFor={`tag-color-${tag.id}`} className="sr-only">
        색
      </label>
      <select id={`tag-color-${tag.id}`} name="color" defaultValue={tag.color ?? ""} className={selectClass}>
        <option value="">색 없음</option>
        {TAG_COLORS.map((c) => (
          <option key={c} value={c}>
            {COLOR_LABEL[c]}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        저장
      </Button>
      {confirm ? (
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={pending}
          onClick={() => run(() => deleteTagAction({ tagId: tag.id }))}
        >
          삭제 확인
        </Button>
      ) : (
        <Button type="button" size="sm" variant="ghost" onClick={() => setConfirm(true)}>
          삭제
        </Button>
      )}
    </form>
  );
}

function DomainCreate({ domains }: { domains: DomainRef[] }) {
  const { run, pending } = useActionRunner();
  const [key, setKey] = useState(0);
  return (
    <form
      key={key}
      aria-label="새 영역"
      className="flex items-center gap-2 border-b border-border pb-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run(
          () =>
            createDomainAction({
              name: String(fd.get("name") ?? ""),
              parentId: String(fd.get("parentId") ?? "") || null,
            }),
          { success: "영역을 만들었습니다.", onSuccess: () => setKey((k) => k + 1) },
        );
      }}
    >
      <label htmlFor="new-domain-name" className="sr-only">
        새 영역 이름
      </label>
      <Input id="new-domain-name" name="name" placeholder="새 영역 이름" maxLength={60} required />
      <label htmlFor="new-domain-parent" className="sr-only">
        상위 영역
      </label>
      <div className="w-44 shrink-0">
        <DomainSelect id="new-domain-parent" name="parentId" domains={domains} />
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        추가
      </Button>
    </form>
  );
}

function DomainRow({ domain, domains }: { domain: DomainRef; domains: DomainRef[] }) {
  const { run, pending } = useActionRunner();
  const [confirm, setConfirm] = useState(false);
  return (
    <form
      aria-label={`영역 ${domain.name}`}
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run(
          () =>
            updateDomainAction({
              domainId: domain.id,
              name: String(fd.get("name") ?? ""),
              parentId: String(fd.get("parentId") ?? "") || null,
            }),
          { success: "저장했습니다." },
        );
      }}
    >
      <label htmlFor={`domain-name-${domain.id}`} className="sr-only">
        영역 이름
      </label>
      <Input id={`domain-name-${domain.id}`} name="name" defaultValue={domain.name} maxLength={60} required />
      <label htmlFor={`domain-parent-${domain.id}`} className="sr-only">
        상위 영역
      </label>
      <div className="w-44 shrink-0">
        <DomainSelect
          id={`domain-parent-${domain.id}`}
          name="parentId"
          domains={domains}
          defaultValue={domain.parent_id}
          exclude={domain.id}
        />
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        저장
      </Button>
      {confirm ? (
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={pending}
          onClick={() => run(() => deleteDomainAction({ domainId: domain.id }))}
        >
          삭제 확인
        </Button>
      ) : (
        <Button type="button" size="sm" variant="ghost" onClick={() => setConfirm(true)}>
          삭제
        </Button>
      )}
    </form>
  );
}

function TemplateRow({
  template,
  tags,
  domains,
}: {
  template: TemplateWithClassification;
  tags: TagRef[];
  domains: DomainRef[];
}) {
  const { run, pending } = useActionRunner();
  const [tagIds, setTagIds] = useState(template.tags.map((t) => t.id));
  return (
    <form
      aria-label={`템플릿 ${template.name}`}
      className="space-y-2 rounded-md border border-border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const est = String(fd.get("estimate") ?? "").trim();
        run(
          () =>
            updateTemplateClassificationAction({
              templateId: template.id,
              taskType: String(fd.get("taskType") ?? "") || null,
              domainId: String(fd.get("domainId") ?? "") || null,
              tagIds,
              defaultEstimateMinutes: est ? Number(est) : null,
              applyToTasks: fd.get("apply") === "on",
            }),
          { success: "저장했습니다." },
        );
      }}
    >
      <p className="font-medium">{template.name}</p>
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <label htmlFor={`tpl-type-${template.id}`} className="text-xs text-muted-foreground">
            유형
          </label>
          <TypeSelect id={`tpl-type-${template.id}`} name="taskType" defaultValue={template.task_type} />
        </div>
        <div className="space-y-1">
          <label htmlFor={`tpl-domain-${template.id}`} className="text-xs text-muted-foreground">
            영역
          </label>
          <DomainSelect
            id={`tpl-domain-${template.id}`}
            name="domainId"
            domains={domains}
            defaultValue={template.practice_domain_id}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={`tpl-est-${template.id}`} className="text-xs text-muted-foreground">
            기본 추정(분)
          </label>
          <Input
            id={`tpl-est-${template.id}`}
            name="estimate"
            type="number"
            min={5}
            max={720}
            step={5}
            defaultValue={template.default_estimate_minutes ?? ""}
          />
        </div>
      </div>
      {tags.length > 0 && (
        <fieldset className="flex flex-wrap gap-2 text-xs">
          <legend className="mb-1 text-muted-foreground">태그</legend>
          {tags.map((t) => (
            <label key={t.id} className="inline-flex items-center gap-1">
              <input
                type="checkbox"
                checked={tagIds.includes(t.id)}
                onChange={(e) =>
                  setTagIds((ids) => (e.target.checked ? [...ids, t.id] : ids.filter((x) => x !== t.id)))
                }
              />
              #{t.name}
            </label>
          ))}
        </fieldset>
      )}
      <div className="flex items-center justify-between gap-2">
        <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" name="apply" defaultChecked />
          값이 비어 있는 {TERMS.task} {template.emptyTaskCount}개에도 적용
        </label>
        <Button type="submit" size="sm" disabled={pending}>
          저장
        </Button>
      </div>
    </form>
  );
}
