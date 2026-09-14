import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const base = process.env.PI_WEB_TEST_URL || "http://127.0.0.1:30141";
const cwd = String.raw`E:\菜单测试 & 100%\项目`;
const filePath = `${cwd}\\文档 #1.txt`;
const browser = await chromium.launch({ channel: process.env.PI_WEB_TEST_BROWSER || undefined });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 }, locale: "zh-CN", hasTouch: true });
page.setDefaultTimeout(20_000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.addInitScript(() => {
  localStorage.clear();
  localStorage.setItem("pi-locale", "zh-CN");
  window.__copies = [];
  window.__copyReject = false;
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
    writeText: async (text) => {
      if (window.__copyReject) throw new Error("Permission denied");
      window.__copies.push(text);
    },
  } });
});
// Never let this regression touch user files, credentials, agents or sessions.
await page.route("**/api/**", async (route) => {
  const url = new URL(route.request().url());
  let data = {};
  if (url.pathname === "/api/cwd/validate") data = { success: true, cwd, projectRoot: cwd, projectKey: cwd };
  else if (url.pathname === "/api/sessions") data = { sessions: [] };
  else if (url.pathname === "/api/agent/running") data = { sessionIds: [], sessions: [] };
  else if (url.pathname === "/api/models") data = { models: [], modelList: [], defaultModel: null };
  else if (url.pathname === "/api/home") data = { home: "E:\\" };
  else if (url.pathname === "/api/worktrees") data = { isGitRepo: false, worktrees: [] };
  else if (url.pathname.startsWith("/api/files/")) {
    if (url.searchParams.get("type") === "list" || !url.searchParams.has("type")) {
      data = { entries: [
        { name: "文档 #1.txt", isDir: false, size: 28, modified: "2026-09-14T00:00:00Z" },
        { name: "目录 空格", isDir: true, size: 0, modified: "2026-09-14T00:00:00Z" },
      ] };
    } else if (url.searchParams.get("type") === "read") {
      data = { content: "Path menu regression fixture", language: "text" };
    } else if (url.searchParams.get("type") === "download") {
      await route.fulfill({ headers: { "Content-Disposition": 'attachment; filename="fixture.txt"' }, contentType: "text/plain", body: "download fixture" });
      return;
    }
  }
  await route.fulfill({ json: data });
});

try {
  await page.goto(`${base}/?cwd=${encodeURIComponent(cwd)}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  const project = page.locator("[data-copy-path]").filter({ hasText: "项目" }).first();
  await project.waitFor();
  await project.click({ button: "right" });
  const menu = page.getByRole("menu");
  await menu.waitFor();
  assert.equal(await menu.getByRole("menuitem").count(), 1);
  await menu.getByRole("menuitem", { name: "复制路径", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "路径已复制" }).waitFor();
  assert.equal(await page.evaluate(() => window.__copies.at(-1)), cwd);

  const fileName = page.getByText("文档 #1.txt", { exact: true });
  if (!(await fileName.isVisible())) await page.getByRole("button", { name: "文件浏览器", exact: true }).click();
  await fileName.waitFor();
  const treePath = await fileName.evaluate((element) => element.closest("[data-copy-path]").dataset.copyPath);
  await fileName.click({ button: "right" });
  assert.deepEqual(await menu.getByRole("menuitem").locator("span:last-child").allTextContents(), ["提及", "复制路径", "下载文件"]);
  const assertCompactMenu = async () => {
    const sizes = await menu.getByRole("menuitem").evaluateAll((items) => items.map((item) => ({
      height: item.getBoundingClientRect().height,
      paddingLeft: getComputedStyle(item).paddingLeft,
      paddingRight: getComputedStyle(item).paddingRight,
      fontSize: getComputedStyle(item).fontSize,
    })));
    assert.deepEqual(sizes, Array.from({ length: 3 }, () => ({ height: 32, paddingLeft: "12px", paddingRight: "12px", fontSize: "13px" })));
    assert.equal(await menu.evaluate((element) => getComputedStyle(element).minWidth), "140px");
    const layout = await menu.getByRole("menuitem").evaluateAll((items) => items.map((item) => ({
      iconWidth: item.firstElementChild.getBoundingClientRect().width,
      iconHidden: item.firstElementChild.getAttribute("aria-hidden"),
      labelLeft: item.lastElementChild.getBoundingClientRect().left,
    })));
    assert.ok(layout.every((item) => item.iconWidth === 14 && item.iconHidden === "true" && item.labelLeft === layout[0].labelLeft));
  };
  await assertCompactMenu();
  await page.keyboard.press("ArrowDown");
  assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), "复制路径");
  await page.keyboard.press("Enter");
  await page.waitForFunction((path) => window.__copies.at(-1) === path, treePath);
  assert.equal(await page.getByRole("tab", { name: "文档 #1.txt", exact: true }).count(), 0, "Right-click must not open a file tab");
  await fileName.click({ button: "right" });
  const downloadItem = menu.getByRole("menuitem", { name: "下载文件", exact: true });
  const downloadHref = await downloadItem.getAttribute("href");
  assert.equal(new URL(downloadHref, base).searchParams.get("type"), "download");
  assert.ok(decodeURIComponent(downloadHref).includes("文档 #1.txt"));
  // Chromium downloads can bypass page.route. Use a data fixture after verifying
  // the real endpoint, so no download request reaches the user's filesystem API.
  await downloadItem.evaluate((element) => {
    element.href = "data:text/plain,download%20fixture";
    element.download = "fixture.txt";
  });
  const downloadPromise = page.waitForEvent("download");
  await downloadItem.click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), "fixture.txt");
  await fileName.click({ button: "right" });
  await menu.getByRole("menuitem", { name: "提及", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".chat-input-textarea")?.value.includes('@"文档 #1.txt"'));
  await page.waitForFunction(() => document.activeElement?.classList.contains("chat-input-textarea"));
  const folder = page.getByText("目录 空格", { exact: true });
  await folder.click({ button: "right" });
  assert.deepEqual(await menu.getByRole("menuitem").locator("span:last-child").allTextContents(), ["提及", "复制路径"]);
  await page.keyboard.press("Escape");

  // Chromium's actual touch input pipeline, not synthetic PointerEvent dispatch.
  const cdp = await page.context().newCDPSession(page);
  const fileBox = await fileName.boundingBox();
  const point = { x: Math.round(fileBox.x + 10), y: Math.round(fileBox.y + fileBox.height / 2) };
  const touch = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  await touch("touchStart", [point]);
  await menu.waitFor();
  await assertCompactMenu();
  await touch("touchEnd", []);
  await page.waitForTimeout(100);
  assert.equal(await menu.count(), 1, "Release leaves the menu open");
  assert.equal(await page.getByRole("tab", { name: "文档 #1.txt", exact: true }).count(), 0);
  await menu.getByRole("menuitem", { name: "复制路径", exact: true }).tap();
  await menu.waitFor({ state: "detached" });
  await touch("touchStart", [point]);
  await touch("touchMove", [{ ...point, y: point.y + 40 }]);
  await page.waitForTimeout(600);
  assert.equal(await menu.count(), 0, "Scrolling cancels long press");
  await touch("touchCancel", []);
  await cdp.detach();
  await fileName.click();
  const fileTab = page.getByRole("tab", { name: "文档 #1.txt", exact: true });
  await fileTab.waitFor();
  await fileTab.click({ button: "right" });
  await menu.getByRole("menuitem").click();
  await page.waitForFunction((path) => window.__copies.at(-1) === path, treePath);
  const previewPath = page.locator(".file-viewer-path[data-copy-path]");
  await previewPath.waitFor();
  await previewPath.click({ button: "right" });
  await menu.getByRole("menuitem").click();
  await page.waitForFunction((path) => window.__copies.at(-1) === path, treePath);

  // Isolate menu lifecycle/keyboard behavior with a marked path and an abort sentinel.
  await page.evaluate((path) => {
    const button = document.createElement("button");
    button.id = "path-fixture";
    button.dataset.copyPath = path;
    button.textContent = "Path fixture";
    Object.assign(button.style, { position: "fixed", right: "0", bottom: "0", zIndex: "1000" });
    button.onclick = () => { window.__leftClicks = (window.__leftClicks || 0) + 1; };
    document.body.appendChild(button);
    const native = document.createElement("button");
    native.id = "native-fixture";
    native.textContent = "Native fixture";
    Object.assign(native.style, { position: "fixed", left: "0", bottom: "0", zIndex: "1000" });
    document.body.appendChild(native);
    window.__aborts = 0;
    window.addEventListener("keydown", (event) => { if (event.key === "Escape") window.__aborts++; });
  }, filePath);
  const fixture = page.locator("#path-fixture");
  await fixture.focus();
  await fixture.click({ button: "right" });
  await menu.waitFor();
  const box = await menu.boundingBox();
  assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= 1100 && box.y + box.height <= 800);
  assert.equal(await page.evaluate(() => window.__leftClicks || 0), 0);
  await page.keyboard.press("Escape");
  await menu.waitFor({ state: "detached" });
  assert.equal(await page.evaluate(() => window.__aborts), 0, "Escape must not reach abort handlers");
  assert.equal(await page.evaluate(() => document.activeElement.id), "path-fixture");
  await fixture.click({ button: "right" });
  await menu.waitFor();
  await page.keyboard.press("Enter");
  await page.waitForFunction((path) => window.__copies.at(-1) === path, filePath);

  await page.evaluate(() => { window.__copyReject = true; });
  await fixture.click({ button: "right" });
  await menu.getByRole("menuitem").click();
  await page.getByRole("status").filter({ hasText: "复制路径失败" }).waitFor();
  await fixture.click({ button: "right" });
  await menu.waitFor();
  await page.locator("#native-fixture").click();
  await menu.waitFor({ state: "detached" });
  await page.locator("#native-fixture").click({ button: "right" });
  assert.equal(await menu.count(), 0);

  await fixture.click({ button: "right" });
  await menu.waitFor();
  await fixture.evaluate((element) => { element.dataset.copyPath = "/new/project"; });
  await menu.waitFor({ state: "detached" });
  await fixture.click({ button: "right" });
  await menu.waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await menu.waitFor({ state: "detached" });
  await fixture.click({ button: "right" });
  await menu.waitFor();
  await page.keyboard.press("Tab");
  await menu.waitFor({ state: "detached" });
  assert.deepEqual(errors, []);
  console.log("PASS: ordered actions, file/folder menus, mention focus, native download, touch hold/release/scroll, copy errors, keyboard and stale targets");
} catch (error) {
  mkdirSync(new URL("../test-results/", import.meta.url), { recursive: true });
  await page.screenshot({ path: fileURLToPath(new URL("../test-results/path-menu-failure.png", import.meta.url)), fullPage: true });
  throw error;
} finally {
  await browser.close();
}