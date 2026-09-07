# 前端验收缺陷修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复验收中确认的 10 项前端缺陷，并补齐代理离线、页面缓存、推荐复习和恢复后的状态一致性。

**Architecture:** 保留现有 React、FastAPI 和 IndexedDB 双队列架构。HTTP 代理故障统一归类为网络错误；学习页缓存独立存放在 IndexedDB；日期页通过显式复习路由打开既有页面；同步引擎订阅 outbox 变更并主动尝试刷新。

**Tech Stack:** React 18、TypeScript、Vite、Vitest、Testing Library、IndexedDB、FastAPI、pytest。

## Global Constraints

- 每项修复必须先增加失败测试并确认失败原因，再写最小实现。
- 离线遗忘继续使用 `forget_count_delta`，标熟和完成继续使用 API 重放，不改变同步幂等语义。
- 历史快照不可变，推荐学习不创建新的页面，只完成既有页面的新会话。
- 第二、第三次学习隐藏“熟”按钮，只允许“遗忘”和“完成本页”。
- 不提交 `.env`、密码、Token、私钥、数据库文件或个人隐私。

---

### Task 1: 代理网络错误与生产 Service Worker

**Files:**
- Modify: `frontend/src/lib/apiClient.ts`
- Modify: `frontend/src/main.tsx`
- Test: `frontend/src/tests/api-client.test.ts`
- Test: `frontend/src/tests/pwa.test.ts`

- [ ] 增加测试：`502/503/504` 和非 JSON `5xx` 响应应抛出 `kind: 'network'`，消息为“网络不可用，请稍后重试”。
- [ ] 运行 `npm test -- src/tests/api-client.test.ts`，确认新增断言因当前分类为 `http` 而失败。
- [ ] 最小实现代理故障分类，并保留 JSON 业务错误的原始详情。
- [ ] 增加测试验证开发环境不触发 Service Worker 注册，生产环境才注册。
- [ ] 运行 `npm test -- src/tests/api-client.test.ts src/tests/pwa.test.ts`，确认全部通过。
- [ ] 运行 `npm run typecheck` 并提交 `fix: classify proxy failures as offline`。

### Task 2: 当前学习页缓存与主动同步

**Files:**
- Modify: `frontend/src/lib/offline/db.ts`
- Create: `frontend/src/lib/offline/studyPageCache.ts`
- Modify: `frontend/src/lib/offline/outbox.ts`
- Modify: `frontend/src/lib/sync/syncEngine.ts`
- Modify: `frontend/src/features/learning/LearningPage.tsx`
- Test: `frontend/src/tests/outbox.test.ts`
- Test: `frontend/src/tests/sync-engine.test.ts`
- Test: `frontend/src/tests/learning-offline.test.tsx`

- [ ] 增加 IndexedDB 缓存测试：在线加载写入当前页面，网络失败时读取缓存并显示“离线快照”。
- [ ] 运行学习离线测试，确认当前实现显示加载错误而失败。
- [ ] 将数据库版本升级并新增 `study_pages` store，提供按缓存键读写学习页的窄接口。
- [ ] 学习页在线加载及乐观变更后更新缓存；仅网络错误回退缓存，404 仍显示无新词。
- [ ] 增加同步测试：outbox 新条目应触发一次主动 `flush`，重复启动不得重复订阅。
- [ ] 让同步引擎订阅 `onOutboxChange`，入队后通知状态并立即尝试刷新；网络失败沿用退避重试。
- [ ] 运行 `npm test -- src/tests/learning-offline.test.tsx src/tests/outbox.test.ts src/tests/sync-engine.test.ts src/tests/sync-status.test.tsx`。
- [ ] 运行 `npm run typecheck` 并提交 `fix: cache study pages for offline use`。

### Task 3: 推荐页面第二和第三次学习入口

**Files:**
- Modify: `backend/app/services/forgetting_service.py`
- Test: `backend/tests/test_forgetting.py`
- Modify: `frontend/src/app/router.tsx`
- Modify: `frontend/src/features/history/HistoryView.tsx`
- Modify: `frontend/src/features/learning/LearningPage.tsx`
- Test: `frontend/src/tests/history.test.tsx`
- Test: `frontend/src/tests/learning.test.tsx`

- [ ] 增加后端测试：已完成普通页在显式复习期间可记录遗忘，非法页面或非活动词仍拒绝。
- [ ] 运行 `python -m pytest tests/test_forgetting.py -q`，确认因已完成页状态校验而失败。
- [ ] 最小放宽普通已完成页的遗忘上下文，不改变专攻页和单词归属校验。
- [ ] 增加前端测试：推荐且当日未完成的页面显示“开始第 k 次学习”，点击后进入 `/review/:pageId`。
- [ ] 增加学习页测试：复习路由使用 `getStudyPage`，隐藏“熟”，允许遗忘和完成；完成后不再重复操作。
- [ ] 用固定系统时间修复日期滑动和前后按钮测试，不再依赖运行当天。
- [ ] 运行 `python -m pytest tests/test_forgetting.py -q` 和 `npm test -- src/tests/history.test.tsx src/tests/learning.test.tsx src/tests/learning-offline.test.tsx`。
- [ ] 运行类型检查并提交 `feat: add recommended review entry`。

### Task 4: 遗忘搜索竞态与临时成功提示

**Files:**
- Modify: `frontend/src/features/forgotten/ForgottenView.tsx`
- Modify: `frontend/src/features/vocabularies/VocabulariesView.tsx`
- Test: `frontend/src/tests/forgotten.test.tsx`
- Test: `frontend/src/tests/vocabularies.test.tsx`

- [ ] 增加测试：较早请求后返回时不得覆盖较新搜索结果。
- [ ] 运行遗忘页测试，确认旧响应会覆盖新结果。
- [ ] 以递增请求序号忽略过期响应，并保留现有防抖行为。
- [ ] 增加假定时器测试：词库成功提示在 4 秒后自动消失，组件卸载清理计时器。
- [ ] 实现统一 `showMessage` 临时提示。
- [ ] 运行两个测试文件和类型检查并提交 `fix: prevent stale forgotten search results`。

### Task 5: 动态主题色与备份恢复刷新

**Files:**
- Modify: `frontend/src/lib/appearance.ts`
- Modify: `frontend/src/features/settings/SettingsView.tsx`
- Test: `frontend/src/tests/appearance.test.ts`
- Test: `frontend/src/tests/settings.test.tsx`

- [ ] 增加主题测试：每个 accent 应同步更新 `<meta name="theme-color">` 的颜色值。
- [ ] 运行主题测试，确认固定墨绿色导致失败。
- [ ] 在主题预设中维护状态栏颜色并由 `applyAppearance` 同步 meta 标签。
- [ ] 增加备份测试：导入成功后调用 `window.location.reload()`，失败时不得刷新。
- [ ] 实现恢复成功后的整页刷新，避免旧页面对象继续调用已替换数据。
- [ ] 运行两个测试文件和类型检查并提交 `fix: refresh appearance and restored state`。

### Task 6: 文档与全量验证

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/AI_CONTEXT.md`
- Modify: `docs/DECISIONS.md`

- [ ] 更新变更记录、当前实现状态和测试结果。
- [ ] 记录离线页面缓存、代理错误归类、主动同步和推荐复习入口的业务决策。
- [ ] 运行 `python -m pytest -q`。
- [ ] 运行 `npm test`、`npm run typecheck`、`npm run build`。
- [ ] 运行 `git diff --check`，检查敏感文件和仓库状态。
- [ ] 提交 `docs: record frontend reliability fixes`。
- [ ] 审查完整分支，合并到 `main` 并在凭据可用时推送 `origin/main`。
