# Pi Web Fork 维护说明

本 Fork 在保留上游实现的基础上做小范围交互增强。使用方式与架构请先阅读原始 README 和 AGENTS.md；本文只记录差异，不替代上游文档。

## 仓库与基线

- Fork / `origin`：https://github.com/a690089735/pi-web
- 上游 / `upstream`：https://github.com/agegr/pi-web
- 本轮定制起点：`135517b26c9f74a1a796569c3c8d2a9cf65b3b43`（Align new session branding with chat input）。
- 包版本：`0.9.1`；此前的版本提交是 `8366762`。
- 最近主动合并上游：尚无记录。上述起点是本地已有提交，不代表已核对最新上游；维护时先 fetch 再比较。

不要将起点已有的品牌布局调整误记成本 Fork 的菜单补丁。

## 差异清单

### 右键 / 触屏长按路径菜单

文件树（含搜索结果）用统一菜单替代悬浮「@ 提及」和下载按钮，不增加每行 `⋯`。文件菜单依次为「@ 提及」「复制路径」「下载文件」，目录没有下载项；无法提及时保留禁用项，复制始终在第二行。其他路径入口仍只显示复制。复制目标完整路径，不改写斜杠、大小写或特殊字符。

入口：文件树的文件/目录、项目选择器及项目选项、worktree 选择器及选项、文件浏览器标题（当前工作目录）、文件标签、各类文件预览顶部路径、会话详情中的会话文件/项目/worktree 路径。

- 提及沿用原回调，写入当前聊天草稿，移动端关闭侧栏返回输入框；下载沿用原生链接与现有鉴权接口。不新增 API、不打开系统应用、不扩大文件访问权限。
- 不改原来的左键行为；不接管会话列表行扩展、终端和聊天正文右键。
- Esc 关闭菜单，不触发停止智能体；支持 Shift+F10/菜单键打开、上下箭头/Home/End 导航、Tab 离开、Enter 激活。文件树没有可用聊天界面时禁用提及。
- 点击外部、滚动、窗口变化或目标失效时关闭；显示复制成功或失败提示。
- 鼠标右键或触屏单指长按 500ms 打开；位移超过 10px、滚动、多指、取消或目标失效时取消计时。长按松手不执行动作，再点菜单项才执行；鼠标和触屏统一使用紧凑菜单：项目最小高度 32px、左右内边距 12px、菜单最小宽度 140px、字号 13px，不单独放大触屏点击区域。
- 仅对标记的路径元素关闭触屏选字/系统长按菜单，不对正文、输入框、终端禁用原生菜单，也不全局禁用滚动缩放。触屏复制/关闭不强行恢复输入框焦点，以免误唤起软键盘。
- 桌面提及/下载现在需要右键后选择，比原来多一步。文件预览工具栏（含选中行提及）和输入框内 @ 自动完成不在这次改动范围。
- 剪贴板现代 API 被拒绝时明确报错；旧浏览器回退检查复制结果，并清理临时节点、恢复焦点和选区。

补丁结构（下列路径均相对于仓库根目录）：

| 文件 | 职责 / 合并时注意 |
| --- | --- |
| `components/PathContextMenu.tsx` | 单实例菜单，监听显式标记的路径元素；与会话运行状态隔离 |
| `components/AppShell.tsx` | 挂载菜单、会话详情路径标记 |
| `components/FileExplorer.tsx` | 注册节点提及/下载能力，移除悬浮按钮，保留 Git 状态标记；搜索结果复用同一节点 |
| `components/FileViewer.tsx`、`components/TabBar.tsx`、`components/SessionSidebar.tsx` | `data-copy-path` 标记，尽量保留上游布局 |
| `lib/path-menu-actions.ts` | DOM 节点 WeakMap 能力注册，不用数据属性传可执行逻辑 |
| `lib/path-menu-gesture.ts`、`lib/path-menu-gesture.test.mjs` | 长按计时、取消条件、兼容点击抑制及测试 |
| `app/globals.css` | 仅路径元素的触屏选字规则与菜单样式 |
| `lib/clipboard.ts` | 剪贴板失败处理及临时 DOM 清理；其他复制入口也复用它 |
| `lib/i18n/messages/` | `pathMenu.*` 三种语言文案 |
| `lib/clipboard.test.mjs`、`components/PathContextMenu.test.mjs` | 单元/集成约束测试 |
| `e2e/path-context-menu.mjs` | 独立浏览器回归（不调用模型） |

上游若提供等价功能，先比较入口覆盖、Esc 行为、复制失败处理及扩展兼容性，再删除重复菜单与标记，不保留两套右键监听。

## 迭代约定

1. 一个功能一个主题提交，测试和差异说明随实现一起更新。
2. 不夹带全量格式化、品牌替换、依赖升级或无关重构。
3. 优先独立文件，在上游大组件中只保留最小接入点。
4. 新差异记录状态、理由、涉及文件、验证结果；未完成的功能不要标为已实现。
5. 遵守 AGENTS.md 的路径、会话生命周期和安全约束；保留 MIT 许可与上游署名。

## 同步上游

先提交或自行妥善保存本地修改，不对脏工作区执行合并。不自动修改 remotes，不强推共享 main。

```bash
git status --short --branch
git remote -v
git fetch upstream
git log --oneline main..upstream/main
git diff --stat main...upstream/main
```

确认 `upstream` 地址正确后，创建一个未使用过的集成分支名，例如：

```bash
git switch main
git switch -c sync/upstream-review
git merge upstream/main
```

逐项处理冲突，不对整个文件盲目选择 ours/theirs。重点复查上表标记位置是否仍是正确路径、菜单是否被重复挂载、三种语言文案是否齐全。解决后运行下列验证，通过 PR 合并回 Fork main。默认使用 merge，避免 rebase 改写共享历史；需要放弃尚未完成的合并时使用 `git merge --abort`。

同步完成后，更新本文“最近主动合并上游”的完整提交 ID、日期、差异取舍与实际验证结果。

## 开发与验证

Node.js >= 22.19.0。以下命令在仓库根目录执行：

```bash
npm ci
node node_modules/typescript/bin/tsc --noEmit
npm run lint
npm test
```

独立菜单回归在已有开发服务器上运行，先启动或复用 `npm run dev`（默认 30141），再运行：

```bash
node e2e/path-context-menu.mjs
```

该脚本用模拟会话 API 和浏览器剪贴板替身验证 UI，不发送模型请求、不写用户会话、不创建项目目录。可以通过 `PI_WEB_TEST_URL` 指向另一实例；需要可直接访问且未启用登录的测试实例。

首次使用 Playwright 需要 `npx playwright install chromium`；也可设置 `PI_WEB_TEST_BROWSER=chrome` 使用本机 Chrome（PowerShell：`$env:PI_WEB_TEST_BROWSER = "chrome"`）。

上游完整 `npm run test:e2e` 会启动自己的服务，必须在没有活动开发服务器的独立 checkout 中执行，避免争用 Next.js 锁。

**日常开发不要执行 `next build` / `npm run build`。** 不提交 `.next`、node_modules、test-results、本地凭据或会话数据。

### 初版复制菜单验证记录（2026-09-14）

- Windows / Node.js 22.23.2：类型检查、ESLint 通过。
- 菜单、剪贴板、侧边栏兼容性和国际化的定向测试：30 项通过。
- 浏览器回归：通过；使用模拟 API 与剪贴板，不代表已测试所有浏览器真实剪贴板权限设置。
- 全量测试：1028 项，1006 通过、17 失败、5 跳过。
- 未修改的 `135517b` 基线使用相同依赖复跑：1020 项，998 通过、17 失败、5 跳过；17 个失败名称完全一致，无新增失败。
- 基线失败涉及已有源码断言、图片预览断言、扩展发现、符号链接、shell 环境及 PTY 测试，未在菜单补丁中顺带修改。以后同步上游需重新跑测试，不应将这些失败永久忽略。
- 未执行 production build、完整上游 E2E、提交或推送。

### 长按与多操作菜单验证（2026-09-14）

- 类型检查、ESLint、43 项定向测试通过。
- Chromium 浏览器回归通过：文件/目录菜单顺序、复制位于第二项、提及与输入焦点、下载链接与原生下载触发、真实 CDP 触摸长按/松手/滑动取消、键盘与目标失效。
- 下载测试先检查实际接口地址，再改用 data fixture 验证下载手势，避免 Chromium 下载绕过 page.route 后访问真实文件 API；这不等同于重新验证后端下载鉴权。
- 全量测试 1041 项：1019 通过、17 失败、5 跳过；失败名称与上述未修改基线完全相同。
- iOS Safari / Android 真机长按与软键盘尚未验证，桌面 Chromium 触摸注入不替代真机验收。移动端系统下载位置由浏览器决定，不由菜单保证。

## 发布边界

当前 package.json 仍保留上游包名和发布脚本，方便同步。不要直接执行 `npm run release` 或向上游 npm 包发布；独立发布前必须单独审查包名、仓库链接、版本策略及发布权限。本文不授权任何自动提交、推送或发布操作。