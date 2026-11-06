import { expect, test } from "@playwright/test";

test("renders the product dashboard empty state", async ({ page }) => {
  const response = await page.request.get("http://127.0.0.1:4443/api/projects");
  if (response.ok()) {
    const body = (await response.json()) as { items?: Array<{ id: string }> };
    for (const project of body.items ?? []) {
      await page.request.delete(`http://127.0.0.1:4443/api/projects/${project.id}`);
    }
  }

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "GG" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "No projects yet" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Project" }).first()).toBeVisible();
});
