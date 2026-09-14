import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createJiti } from "jiti";

const read = (name) => readFileSync(new URL(name, import.meta.url), "utf8");
const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { I18nProvider } = await jiti.import("@/hooks/useI18n");
const { PathContextMenu } = await jiti.import("./PathContextMenu.tsx");
const { TabBar } = await jiti.import("./TabBar.tsx");
const render = (component, props) => renderToStaticMarkup(React.createElement(I18nProvider, null, React.createElement(component, props)));

test("menu is dormant during SSR without accessing document", () => {
  assert.equal(render(PathContextMenu), "");
});

test("file tabs opt in with exact paths while terminal tabs remain native", () => {
  const path = String.raw`E:\项目\a & b.txt`;
  const html = render(TabBar, { tabs: [
    { id: "file", label: "a & b.txt", filePath: path },
    { id: "terminal", label: "Terminal", filePath: "E:\\project", kind: "terminal" },
  ], activeTabId: "file", onSelectTab() {}, onCloseTab() {} });
  assert.equal((html.match(/data-copy-path=/g) ?? []).length, 1);
  assert.ok(html.includes('data-copy-path="E:\\项目\\a &amp; b.txt"'));
});

test("integration stays opt-in and does not change session-row extension handling", () => {
  assert.match(read("./FileExplorer.tsx"), /data-copy-path=\{node.fullPath\}/);
  assert.equal((read("./FileViewer.tsx").match(/data-copy-path=\{filePath\}/g) ?? []).length, 5);
  const sidebar = read("./SessionSidebar.tsx");
  assert.match(sidebar, /onContextMenu=\{confirmDelete \|\| renaming \? undefined : handleContextMenu\}/);
  assert.match(sidebar, /data-copy-path=\{selectedCwd \?\? selectedCwdProp \?\? undefined\}/);
  const source = read("./PathContextMenu.tsx");
  assert.match(source, /window.addEventListener\("keydown", keyboard, true\)/);
  assert.match(source, /event.stopImmediatePropagation\(\)/);
  assert.doesNotMatch(source, /fetch\(|sendAgentCommand|allowFileRoot/);
  const explorer = read("./FileExplorer.tsx");
  assert.match(explorer, /registerPathMenuActions\(element/);
  assert.doesNotMatch(explorer, /onAtMention && hovered|hovered && !node.isDir|!hovered &&/);
  assert.match(source, /href=\{target.actions.downloadUrl\} download/);
});