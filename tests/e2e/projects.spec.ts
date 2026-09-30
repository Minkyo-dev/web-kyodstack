import { expect, test } from "@playwright/test";
import { cleanup, dbAsUser, E2E_PREFIX, login } from "./helpers";

// Spec §49.4 flow 5 (up to the AI step, which arrives in Phase 5) + Phase 4 exit criteria.
test.describe("projects and milestones", () => {
  test.beforeAll(async () => cleanup(await dbAsUser()));
  test.afterAll(async () => cleanup(await dbAsUser()));

  test("project → milestones → task under milestone → progress → relink in scheduler", async ({ page }) => {
    const project = `${E2E_PREFIX} MLB Analytics ${Date.now()}`;
    const task = `${E2E_PREFIX} ESPN games ingestion`;
    await login(page);

    await page.getByRole("link", { name: "프로젝트" }).click();
    await expect(page).toHaveURL(/\/scheduler\/projects$/);
    const create = page.getByRole("form", { name: "새 프로젝트" });
    await create.getByLabel("프로젝트 이름").fill(project);
    await create.getByRole("button", { name: "만들기" }).click();
    await page.getByRole("link", { name: project }).click();
    await expect(page.getByRole("heading", { level: 1, name: project })).toBeVisible();

    const addMs = page.getByRole("form", { name: "새 마일스톤" });
    for (const name of ["M1 Data Ingestion", "M2 dbt Models"]) {
      await addMs.getByLabel("마일스톤 이름").fill(name);
      await addMs.getByRole("button", { name: "마일스톤 추가" }).click();
      await expect(page.getByRole("listitem", { name: `마일스톤 ${name}` })).toBeVisible();
    }

    const m1 = page.getByRole("listitem", { name: "마일스톤 M1 Data Ingestion" });
    await m1.getByLabel("M1 Data Ingestion 할 일").fill(task);
    await m1.getByLabel("예상 시간(분)").fill("70");
    await m1.getByRole("button", { name: "M1 Data Ingestion에 할 일 추가" }).click();
    await expect(m1).toContainText(task);
    await expect(m1).toContainText("완료 0/1");
    await expect(m1).toContainText("남은 예상 1h 10m");

    // Linked in the scheduler Today list, and relinkable from the drawer.
    await page.getByRole("link", { name: "스케줄러" }).click();
    const item = page.locator("[data-draggable-task]", { hasText: task });
    await expect(item).toContainText(`${project} › M1 Data Ingestion`);
    await page.getByRole("button", { name: task, exact: true }).click();
    const drawer = page.getByRole("dialog", { name: task });
    await drawer.getByLabel("마일스톤").selectOption({ label: "M2 dbt Models" });
    await drawer.getByRole("button", { name: "저장" }).click();
    await expect(item).toContainText(`${project} › M2 dbt Models`);
    await page.keyboard.press("Escape");

    // Completing updates project + milestone progress (understood without opening tasks).
    await page.getByRole("checkbox", { name: `${task} 완료로 표시` }).click();
    await expect(page.getByRole("checkbox", { name: `${task} 완료 취소` })).toBeVisible();
    await page.getByRole("link", { name: "프로젝트" }).click();
    const row = page.getByRole("link", { name: project });
    await expect(row).toContainText("완료 1/1");
    await expect(row).toContainText("다음 마일스톤: M1 Data Ingestion");

    const db = await dbAsUser();
    const { data } = await db
      .from("tasks")
      .select("status, project:projects!tasks_project_id_user_id_fkey(name), milestone:milestones!tasks_milestone_id_user_id_fkey(name)")
      .eq("title", task)
      .single();
    expect(data).toMatchObject({ status: "completed", project: { name: project }, milestone: { name: "M2 dbt Models" } });
  });
});
