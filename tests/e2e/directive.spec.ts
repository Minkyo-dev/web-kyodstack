import { expect, test } from "@playwright/test";
import { cleanup, dbAsUser, E2E_PREFIX, login } from "./helpers";

// ADR 0038: 습관 tab — vision, roles (reorder, rename) → new-change wizard (criterion, process, rule + habit) →
// blueprint edits → task link + breadcrumb → process switch keeps history → close the change.
test.describe("direction layer", () => {
  test.beforeAll(async () => cleanup(await dbAsUser()));
  test.afterAll(async () => cleanup(await dbAsUser()));

  test("hierarchy, task breadcrumb, path switch", async ({ page }) => {
    const db = await dbAsUser();
    const uid = (await db.auth.getUser()).data.user!.id;
    const { data: before } = await db.from("player_profiles").select("gamification_enabled").maybeSingle();
    const { data: realPurpose } = await db.from("purposes").select("id").eq("status", "active").maybeSingle();
    // Plain terms for stable labels.
    if (before?.gamification_enabled) await db.from("player_profiles").update({ gamification_enabled: false }).eq("user_id", uid);
    try {
      const stamp = Date.now();
      const mission = `${E2E_PREFIX} Speak English ${stamp}`;
      const task = `${E2E_PREFIX} Shadow 5 sentences ${stamp}`;
      await login(page);

      const nav = () => page.getByRole("navigation", { name: "플래너" }).getByRole("link", { name: "습관", exact: true });
      await nav().click();
      await expect(page).toHaveURL(/\/scheduler\/directive$/);

      // Vision (inline; open the editor when one is already set)
      const editVision = page.getByRole("button", { name: "비전 편집" });
      if (await editVision.isVisible()) await editVision.click();
      const purposeForm = page.getByRole("form", { name: "비전 편집" });
      await purposeForm.getByLabel("비전 문장", { exact: true }).fill(`${E2E_PREFIX} Build an independent life`);
      await purposeForm.getByRole("button", { name: "저장" }).click();
      await expect(page.getByRole("group", { name: "비전" })).toContainText("Build an independent life");

      // Roles: add two, move the second to the front (it becomes the 주 역할), rename it inline
      const addRole = async (name: string) => {
        const open = page.getByRole("button", { name: "역할 추가" });
        if (await open.isVisible()) await open.click();
        const form = page.getByRole("form", { name: "새 역할" });
        await form.getByLabel("역할 이름", { exact: true }).fill(name);
        await form.getByRole("button", { name: "추가" }).click();
        await expect(page.getByRole("list", { name: "역할 목록" })).toContainText(name);
      };
      await addRole(`${E2E_PREFIX} English Speaker`);
      await addRole(`${E2E_PREFIX} Builder`);
      const ids = page.getByRole("list", { name: "역할 목록" }).getByRole("listitem");
      await page.getByRole("button", { name: `${E2E_PREFIX} Builder 앞으로` }).click();
      await expect(ids.first()).toContainText("Builder");
      await expect(ids.first()).toContainText("주 역할");
      await page.getByRole("button", { name: `${E2E_PREFIX} Builder 이름 바꾸기` }).click();
      const rename = page.getByRole("form", { name: `${E2E_PREFIX} Builder 이름 바꾸기` });
      await rename.getByLabel("역할 이름", { exact: true }).fill(`${E2E_PREFIX} Maker`);
      await rename.getByRole("button", { name: "저장" }).click();
      await expect(ids.first()).toContainText("Maker");

      // Wizard: change → criterion → process → rule + habit, in one go
      await page.getByRole("button", { name: "새 변화" }).click();
      const wizard = page.getByRole("dialog", { name: "새 변화 설계" });
      await wizard.getByLabel("변화 이름", { exact: true }).fill(mission);
      await wizard.getByRole("button", { name: `${E2E_PREFIX} Maker` }).click();
      await wizard.getByRole("button", { name: "다음" }).click();
      await wizard.getByLabel("기준 1", { exact: true }).fill("Mock interviews");
      await wizard.getByLabel("형태", { exact: true }).selectOption("numeric");
      await wizard.getByLabel("목표값", { exact: true }).fill("3");
      await wizard.getByRole("button", { name: "다음" }).click();
      await wizard.getByLabel("프로세스 이름", { exact: true }).fill("Input first");
      await wizard.getByLabel("어떻게 반복하나요?", { exact: true }).fill("Listen a lot");
      await wizard.getByLabel("포기하는 것 (선택)", { exact: true }).fill("Grammar drills");
      await wizard.getByRole("button", { name: "다음" }).click();
      await wizard.getByLabel("언제 (신호)", { exact: true }).fill("After coffee");
      await wizard.getByLabel("어디서 (선택)", { exact: true }).fill("Desk");
      await wizard.getByLabel("무엇을", { exact: true }).fill(`${E2E_PREFIX} Shadowing`);
      await wizard.getByLabel("몇 분 (선택)", { exact: true }).fill("20");
      await expect(wizard).toContainText(`“After coffee, Desk에서 ${E2E_PREFIX} Shadowing”`);
      await wizard.getByRole("button", { name: "만들기" }).click();
      await expect(page).toHaveURL(/\?mission=/);
      const rule = `After coffee, Desk에서 ${E2E_PREFIX} Shadowing`;

      const detail = page.getByRole("region", { name: "변화 상세" });
      await expect(detail.getByRole("heading", { level: 2, name: mission })).toBeVisible();
      await expect(detail).toContainText("설계 5/5 단계");
      await expect(detail.getByRole("region", { name: "변화", exact: true })).toContainText(`${E2E_PREFIX} Maker`);
      await expect(detail.getByRole("listitem", { name: `실행 규칙 ${rule}` })).toBeVisible();
      await expect(detail.getByRole("region", { name: "습관", exact: true }).getByRole("listitem", { name: `습관 ${E2E_PREFIX} Shadowing` })).toContainText("평일");

      // Criteria progress in place
      const item = detail.getByRole("listitem", { name: "기준 Mock interviews" });
      await item.getByLabel("Mock interviews 현재값").fill("3");
      await item.getByRole("button", { name: "갱신" }).click();
      await expect(item).toContainText("(달성)");
      const crit = detail.getByRole("form", { name: "새 기준" });
      await crit.getByLabel("새 기준", { exact: true }).fill("Pass exam");
      await crit.getByRole("button", { name: "기준 추가" }).click();
      const exam = detail.getByRole("listitem", { name: "기준 Pass exam" });
      await exam.getByLabel("Pass exam 달성").check();
      await expect(exam).toContainText("(달성)");
      await expect(detail.getByRole("region", { name: "달성 기준", exact: true })).toContainText("2/2 달성");

      // A second rule through the sentence builder
      const newRule = detail.getByRole("form", { name: "새 실행 규칙" });
      await newRule.getByLabel("언제 (신호)", { exact: true }).fill("Before lunch");
      await newRule.getByLabel("무엇을", { exact: true }).fill("Read aloud");
      await newRule.getByRole("button", { name: "규칙 추가" }).click();
      await expect(detail.getByRole("listitem", { name: "실행 규칙 Before lunch, Read aloud" })).toBeVisible();

      // Task → rule link in the drawer
      await page.getByRole("link", { name: "스케줄러" }).click();
      await page.getByLabel("새 할 일").fill(task);
      await page.getByRole("button", { name: "할 일 추가" }).click();
      await page.getByRole("button", { name: task, exact: true }).click();
      const drawer = page.getByRole("dialog", { name: task });
      await expect(drawer.getByText("유지", { exact: true })).toBeVisible();
      await drawer.getByLabel("변화 / 실행 규칙").selectOption({ label: `${mission} › ${rule}` });
      await drawer.getByRole("button", { name: "저장" }).click();
      const crumbs = drawer.getByRole("navigation", { name: "연결 경로" });
      await expect(crumbs).toContainText(mission);
      await expect(crumbs).toContainText("Input first");
      await expect(crumbs).toContainText("Shadowing");
      await expect
        .poll(async () => (await db.from("tasks").select("mission_id, protocol_id").eq("title", task).single()).data?.protocol_id)
        .not.toBeNull();
      await page.keyboard.press("Escape");

      // Switch the process: old one goes to history, its rules are archived, the task keeps its link
      await nav().click();
      await page.getByRole("link", { name: mission }).click();
      const detail2 = page.getByRole("region", { name: "변화 상세" });
      await detail2.getByRole("button", { name: "프로세스 교체" }).click();
      const swap = detail2.getByRole("form", { name: "프로세스 교체" });
      await swap.getByLabel("이름", { exact: true }).fill("Output first");
      await swap.getByLabel("어떻게 반복하나요?", { exact: true }).fill("Speak daily");
      await swap.getByRole("button", { name: "교체" }).click();
      await expect(detail2.getByRole("group", { name: "현재 프로세스" })).toContainText("Output first");
      const history = detail2.getByRole("group", { name: "이전 프로세스" });
      await history.locator("summary").click();
      await expect(history).toContainText("Input first");
      await expect(detail2.getByRole("listitem", { name: `실행 규칙 ${rule}` })).toHaveCount(0);
      await expect(detail2.getByRole("region", { name: "실행 규칙", exact: true })).toContainText("다음 단계");

      // Existing link survives a save after the switch
      await page.getByRole("link", { name: "스케줄러" }).click();
      await page.getByRole("button", { name: task, exact: true }).click();
      const drawer2 = page.getByRole("dialog", { name: task });
      await expect(drawer2.getByRole("navigation", { name: "연결 경로" })).toContainText("RETIRED");
      await drawer2.getByRole("button", { name: "저장" }).click();
      await expect(page.getByText("교체된", { exact: false })).toHaveCount(0);
      await expect
        .poll(async () => (await db.from("tasks").select("protocol_id").eq("title", task).single()).data?.protocol_id)
        .not.toBeNull();

      // Close the change through its settings (save_mission update path).
      await page.keyboard.press("Escape");
      await nav().click();
      await page.getByRole("link", { name: mission }).click();
      const detail3 = page.getByRole("region", { name: "변화 상세" });
      await detail3.getByRole("button", { name: "변화 설정" }).click();
      const settings = detail3.getByRole("form", { name: "변화 설정" });
      await settings.getByLabel("상태", { exact: true }).selectOption("achieved");
      await settings.getByRole("button", { name: "저장" }).click();
      await expect
        .poll(async () => (await db.from("missions").select("status, closed_at").eq("title", mission).single()).data)
        .toMatchObject({ status: "achieved", closed_at: expect.any(String) });
    } finally {
      await db.from("player_profiles").update({ gamification_enabled: before?.gamification_enabled ?? false }).eq("user_id", uid);
      await cleanup(db);
      // Review Focus 1: the owner's real directive is active again.
      if (realPurpose) {
        const { data: after } = await db.from("purposes").select("id").eq("status", "active").maybeSingle();
        expect(after?.id).toBe(realPurpose.id);
      }
    }
  });
});
