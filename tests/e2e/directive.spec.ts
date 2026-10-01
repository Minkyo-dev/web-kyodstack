import { expect, test } from "@playwright/test";
import { cleanup, dbAsUser, E2E_PREFIX, login } from "./helpers";

// G1: directive → identity → mission + criterion → path → protocol → task link + breadcrumb → path switch keeps history.
test.describe("direction layer", () => {
  test.beforeAll(async () => cleanup(await dbAsUser()));
  test.afterAll(async () => cleanup(await dbAsUser()));

  test("hierarchy, task breadcrumb, path switch", async ({ page }) => {
    const db = await dbAsUser();
    const uid = (await db.auth.getUser()).data.user!.id;
    const { data: before } = await db.from("player_profiles").select("gamification_enabled, quest_terminology").maybeSingle();
    const { data: realPurpose } = await db.from("purposes").select("id").eq("status", "active").maybeSingle();
    // Plain terms for stable labels.
    if (before?.gamification_enabled) await db.from("player_profiles").update({ gamification_enabled: false }).eq("user_id", uid);
    try {
      const stamp = Date.now();
      const mission = `${E2E_PREFIX} Speak English ${stamp}`;
      const task = `${E2E_PREFIX} Shadow 5 sentences ${stamp}`;
      await login(page);

      await page.getByRole("link", { name: "방향" }).click();
      await expect(page).toHaveURL(/\/scheduler\/directive$/);

      // Directive
      const directive = page.getByRole("region", { name: "목적" });
      await directive.getByRole("button", { name: /^(설정|편집)$/ }).click();
      const purposeForm = page.getByRole("form", { name: "목적 편집" });
      await purposeForm.getByLabel("문장").fill(`${E2E_PREFIX} Build an independent life`);
      await purposeForm.getByRole("button", { name: "저장" }).click();
      await expect(directive).toContainText("Build an independent life");

      // Identity
      const idForm = page.getByRole("form", { name: "새 정체성" });
      await idForm.getByLabel("이름").fill(`${E2E_PREFIX} English Speaker`);
      await idForm.getByRole("button", { name: "추가" }).click();
      await expect(page.getByRole("list", { name: "정체성 목록" })).toContainText("English Speaker");
      // Second identity, then move it to the front: it becomes the class (first item).
      await idForm.getByLabel("이름").fill(`${E2E_PREFIX} Builder`);
      await idForm.getByRole("button", { name: "추가" }).click();
      const ids = page.getByRole("list", { name: "정체성 목록" }).getByRole("listitem");
      await expect(ids.last()).toContainText("Builder");
      await page.getByRole("button", { name: `${E2E_PREFIX} Builder 앞으로` }).click();
      await expect(ids.first()).toContainText("Builder");

      // Mission
      const missionForm = page.getByRole("form", { name: "새 목표" });
      await missionForm.getByLabel("목표 이름").fill(mission);
      await missionForm.getByRole("button", { name: "만들기" }).click();
      await expect(page).toHaveURL(/\?mission=/);
      const detail = page.getByRole("region", { name: "목표 상세" });
      await expect(detail.getByRole("heading", { level: 2, name: mission })).toBeVisible();

      // Criterion
      const crit = detail.getByRole("form", { name: "새 기준" });
      await crit.getByLabel("기준").fill("Mock interviews");
      await crit.getByLabel("종류").selectOption("numeric");
      await crit.getByLabel("목표값").fill("3");
      await crit.getByRole("button", { name: "기준 추가" }).click();
      const item = detail.getByRole("listitem", { name: "기준 Mock interviews" });
      await expect(item).toBeVisible();
      await item.getByLabel("Mock interviews 현재값").fill("3");
      await item.getByRole("button", { name: "갱신" }).click();
      await expect(item).toContainText("(달성)");
      // A check criterion ticks at once (optimistic) and stays ticked.
      await crit.getByLabel("기준").fill("Pass exam");
      await crit.getByRole("button", { name: "기준 추가" }).click();
      const exam = detail.getByRole("listitem", { name: "기준 Pass exam" });
      await exam.getByLabel("Pass exam 달성").check();
      await expect(exam).toContainText("(달성)");
      await expect(detail.getByRole("heading", { name: /성공 기준/ })).toContainText("2/2");

      // Path
      const setPath = detail.getByRole("form", { name: "전략 설정" });
      await setPath.getByLabel("이름").fill("Input first");
      await setPath.getByLabel("접근 방식").fill("Listen a lot");
      await setPath.getByLabel("포기하는 것").fill("Grammar drills");
      await setPath.getByRole("button", { name: "설정" }).click();
      const current = detail.getByRole("region", { name: "현재 전략" });
      await expect(current).toContainText("Input first");

      // Protocol
      const proto = detail.getByRole("form", { name: "새 실행 방식" });
      await proto.getByLabel("이름").fill("Shadowing");
      await proto.getByLabel("의도 시간(분)").fill("20");
      await proto.getByLabel("단계 (한 줄에 하나)").fill("Listen\nRepeat");
      await proto.getByRole("button", { name: "추가" }).click();
      await expect(detail.getByRole("listitem", { name: "실행 방식 Shadowing" })).toBeVisible();

      // Task → protocol link in the drawer
      await page.getByRole("link", { name: "스케줄러" }).click();
      await page.getByLabel("새 할 일").fill(task);
      await page.getByRole("button", { name: "할 일 추가" }).click();
      await page.getByRole("button", { name: task, exact: true }).click();
      const drawer = page.getByRole("dialog", { name: task });
      await expect(drawer.getByText("유지", { exact: true })).toBeVisible();
      await drawer.getByLabel("목표 / 실행 방식").selectOption({ label: `${mission} › Shadowing` });
      await drawer.getByRole("button", { name: "저장" }).click();
      const crumbs = drawer.getByRole("navigation", { name: "연결 경로" });
      await expect(crumbs).toContainText(mission);
      await expect(crumbs).toContainText("Input first");
      await expect(crumbs).toContainText("Shadowing");
      await expect
        .poll(async () => (await db.from("tasks").select("mission_id, protocol_id").eq("title", task).single()).data?.protocol_id)
        .not.toBeNull();
      await page.keyboard.press("Escape");

      // Switch the path: old one goes to history, the task keeps its link
      await page.getByRole("link", { name: "방향" }).click();
      await page.getByRole("link", { name: mission }).click();
      const detail2 = page.getByRole("region", { name: "목표 상세" });
      await detail2.getByText("전략 교체", { exact: true }).click();
      const swap = detail2.getByRole("form", { name: "전략 교체" });
      await swap.getByLabel("이름").fill("Output first");
      await swap.getByLabel("접근 방식").fill("Speak daily");
      await swap.getByRole("button", { name: "교체" }).click();
      await expect(detail2.getByRole("region", { name: "현재 전략" })).toContainText("Output first");
      const history = detail2.getByRole("group", { name: "이전 전략" });
      await history.locator("summary").click();
      await expect(history).toContainText("Input first");
      await expect(detail2.getByRole("listitem", { name: "실행 방식 Shadowing" })).toHaveCount(0);

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

      // Close the mission through the settings form (save_mission update path).
      await page.keyboard.press("Escape");
      await page.getByRole("link", { name: "방향" }).click();
      await page.getByRole("link", { name: mission }).click();
      const detail3 = page.getByRole("region", { name: "목표 상세" });
      await detail3.getByText("목표 설정", { exact: true }).click();
      const settings = detail3.getByRole("form", { name: "목표 설정" });
      await settings.getByLabel("상태").selectOption("achieved");
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
