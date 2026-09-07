# AI 项目接手上下文

## 项目目标

移动端优先英语记单词 PWA：多 CSV 独立词库、可配置分页（默认 15 词）、纸笔背诵后整页记录、日期历史、遗忘排序与导出、离线同步、REST/OpenAPI。

## 当前状态

- 当前阶段：前端重写后的可靠性缺陷已修复并通过全量测试
- 最近完成：2026-09-07 按 TDD 修复代理离线识别、学习页离线缓存、主动同步、推荐复习入口、搜索竞态、提示时限、动态状态栏主题色、备份恢复重载，以及 Excel 打开 CSV 中文乱码
- 当前任务：等待真实浏览器与代理断网场景验收
- 阻塞问题：无
- 最后更新：2026-09-07

## 关键文档

- 产品规格：`docs/superpowers/specs/2026-09-02-english-word-memory-design.md`
- 实施计划：`docs/superpowers/plans/2026-09-02-english-word-memory.md`
- 开发总提示词：`docs/AI_DEVELOPMENT_PROMPT.md`
- 接手模板：`docs/AI_CONTEXT_TEMPLATE.md`
- 架构：`docs/ARCHITECTURE.md`
- 数据库：`docs/DATABASE.md`
- API：`docs/API.md`、`docs/openapi.json`
- 同步：`docs/SYNC.md`
- 决策：`docs/DECISIONS.md`
- 变更：`docs/CHANGELOG.md`

## 当前技术状态

- 后端启动：`cd backend && uvicorn app.main:app --reload`
- 前端启动：`cd frontend && npm run dev`
- 测试命令：`cd backend && python -m pytest -q`（62 个用例）；`cd frontend && npm test`（Vitest 单次运行，124 个用例）；`cd frontend && npm run typecheck`；`cd frontend && npm run build`
- Docker 启动：`docker compose up --build`，当前机器未检测到 Docker CLI
- 本地地址：后端 `http://127.0.0.1:8000`；前端 `http://127.0.0.1:5173`
- 数据库迁移版本：`202609040006_auth_tokens`

## 已实现接口与页面

- `GET /api/v1/health`：返回 `{ "status": "ok", "version": string }`，测试位置 `backend/tests/test_health.py`。
- `POST /api/v1/vocabularies/import`：multipart CSV 导入，返回词库摘要、有效行数和行级错误，测试位置 `backend/tests/test_vocabulary_import.py`。
- `GET /api/v1/vocabularies`、`GET /api/v1/vocabularies/{id}`、`PATCH /api/v1/vocabularies/{id}`、`PATCH /api/v1/vocabularies/{id}/active`、`PATCH /api/v1/vocabularies/{id}/priority`、`DELETE /api/v1/vocabularies/{id}`：词库管理接口，测试位置 `backend/tests/test_vocabulary_import.py`。
- `GET /api/v1/study-pages/next`：复用当前未完成页或生成下一页，测试位置 `backend/tests/test_study_pages.py`。
- `GET /api/v1/study-pages/{id}`：查询学习页详情，测试位置 `backend/tests/test_study_pages.py`。
- `POST /api/v1/study-pages/{id}/words/{word_id}/master`：首次学习标记熟并补词，测试位置 `backend/tests/test_study_pages.py`。
- `POST /api/v1/study-pages/{id}/complete`：完成页面并写入快照和学习事件，测试位置 `backend/tests/test_study_pages.py`。
- `POST /api/v1/study-pages/{id}/undo-complete`：撤销完成页增量并追加撤销事件，测试位置 `backend/tests/test_study_pages.py`。
- 学习页无候选词时返回 404 且不落空页；最后一个词标熟后页面转为 `exhausted`；熟词替换、完成与撤销均在异常时回滚。
- `GET /api/v1/history/calendar?month=YYYY-MM`：返回整月实际完成、推荐日期和灰色空白日期。
- `GET /api/v1/history?date=YYYY-MM-DD`：返回当天实际或推荐页面、学习轮次及第二/第三次完成状态。
- `GET /api/v1/history/pages/{session_id}`：返回不可变完成快照及前后完成会话。
- `POST /api/v1/study-pages/{id}/words/{word_id}/forget`：完成会话或未完成页立即记录遗忘。
- `GET /api/v1/forgotten-words`、`GET /api/v1/forgotten-words/export`：遗忘排序、筛选、搜索和 CSV 导出。
- `POST /api/v1/forgotten-words/{word_id}/undo`、`POST /api/v1/forgotten-words/{word_id}/restore`：撤销最近遗忘与恢复熟词。
- `POST /api/v1/forgotten-words/special-page`、`POST /api/v1/forgotten-words/special-pages/{page_id}/complete`：专攻页创建和逐词结果。
- `GET /api/v1/stats/today`、`GET /api/v1/stats/today/repeated-forgetting`：服务端今日统计和再次遗忘明细。
- `GET/PUT /api/v1/settings`：页大小、推荐间隔、主题、字号和词库优先级。
- `GET/POST /api/v1/backup/json`：版本化完整备份与事务恢复。
- `GET /api/v1/vocabularies/{id}/export`：保留源字段和释义换行的词库 CSV。
- 前端提供学习、日期、遗忘、统计、设置五个移动端入口与专攻页、词库管理二级页；`src/lib/apiClient.ts` 统一映射 `/api/v1` 并携带 Bearer Token。
- 学习页：释义默认隐藏、点击行后在单词右侧显示；行内信息极简（无词库名/源页/掩码占位，学习/遗忘次数仅非零时小字显示）；首次学习显示“熟”、任意时刻可“遗忘”；“完成本页”二次确认后可撤销（5 分钟窗口）并可点“下一页”；成功加载的当前页写入 IndexedDB，断网刷新时显示离线快照；离线时遗忘走同步事件、标熟/完成走 API 重放队列并乐观更新。
- 日期页：整月日历以灰色/浅色推荐/深色完成三态渲染，展示第 k 次学习、第二/第三次完成与待完成轮次；推荐未完成轮次可进入原页面复习，复习时仅允许遗忘与完成；快照弹窗支持前后会话切换；支持左右滑动与前后一天按钮切换日期。
- 遗忘页：按服务端遗忘次数降序渲染，支持搜索（防抖且丢弃过期响应）、词库/状态/最近遗忘自筛选、CSV 导出、撤销遗忘（成功后刷新）、批量勾选生成专攻页并自动跳转。
- 专攻页：逐词选择记得/遗忘/熟，未选齐禁止提交，完成后返回遗忘列表。
- 统计页：今日学习/遗忘/再次遗忘（可展开明细）/连续学习天数与累计学习、学习中、熟词、遗忘词卡片，数据全部来自服务端。
- 设置页：页大小、推荐间隔、主题、字号、词库优先级（显示词库名）保存到服务端；主题与字号即时应用到 `<html>` 并持久化到 localStorage；主题颜色提供墨绿/靛蓝/青紫/暖橙/玫红五种预设（`data-accent` + CSS 变量，深浅色各自适配，仅存本地），同时更新移动端状态栏颜色；提供服务器模式登录/退出与 JSON 备份导出/导入，恢复成功后整页重载。
- 词库管理页：CSV 导入（展示导入统计与行级错误）、激活/停用、优先级、重命名、导出与按名称确认删除；成功操作提示 4 秒后自动消失。
- `POST /api/v1/sync/push`：幂等批量应用进度/设置事件，非法批次回滚并记录 LWW 冲突。
- `GET /api/v1/sync/pull`：按同步记录 ID 游标拉取已处理事件和冲突。
- 前端 IndexedDB（`wordmaster-offline`，版本 2）持久化当前学习页缓存、API 重放与同步事件两类队列：遗忘为 `forget_count_delta` 增量事件；标熟、完成本页为原始 API 重放；撤销完成/撤销遗忘及专攻完成需联网。同步引擎按 FIFO 重放，入队后主动刷新；网络失败保留队列并按 2 秒起步指数退避（封顶 60 秒）重试，联网时自动触发；applied/duplicate 移除，conflict 与被拒绝的重放记录到冲突列表；顶栏显示“待同步/同步冲突/离线”徽标。
- PWA：`manifest.webmanifest` + 应用壳缓存 Service Worker（仅生产环境注册；静态资源缓存优先、导航回退 `offline.html`、`/api/` 不缓存）。
- 前端测试位置：`frontend/src/tests/`（共 17 个文件、124 个用例）。
- `POST /api/v1/auth/login`、`POST /api/v1/auth/logout`：服务器模式登录和持久化撤销 Bearer Token；本地模式免登录。
- Compose 前端 Nginx 将 `/api/` 代理到 backend，SQLite 使用 `wordmaster_data` 卷；E2E 验收步骤位于 `tests/e2e/README.md`。
- 应用首次启动自动导入并启用 `data/reden_vocabulary_6550.csv`；实机验证返回 6547 个有效词并可直接生成学习页。可用 `WORDMASTER_DEFAULT_VOCABULARY_PATH` 覆盖路径。

## 数据模型变更

- 新增 `users`、`vocabularies`、`words`、`word_progress`、`operation_logs`。
- 新增 `study_pages`、`study_page_words`、`study_sessions`、`word_study_events`。
- `words.vocabulary_id + words.normalized_word` 保证同一词库内规范化英文唯一。
- `word_progress.user_id + word_progress.word_id` 保证用户单词进度唯一。
- `study_sessions.snapshot` 保存完成页时的单词顺序、释义和学习次数快照。

## 重要业务规则

- 外部源词库路径：`C:\Users\zhan\Desktop\wu\output\reden_vocabulary\reden_vocabulary_6550.csv`；仓库副本：`data/reden_vocabulary_6550.csv`；SHA256 均为 `3FEAA1FE5293A256C2C94BF0A1E380807CE59A2E9138DB5D50A419E628B12038`。
- 完成撤销仅允许最新未撤销会话，并须在完成后 300 秒内执行；撤销后根据剩余有效会话恢复页面状态和首末学习时间。
- 专攻集合由 `word_progress.needs_special_attention` 独立维护，不覆盖历史遗忘事件或遗忘次数。
- 今日再次遗忘按“今天有有效遗忘且此前已有有效遗忘”的单词计数；同词一天多次只占一个明细。
- JSON 备份导入先验证所有引用，再事务替换当前用户数据，失败完整回滚。
- 同步事件以 `user_id + event_id` 幂等；计数按非负增量合并，状态与设置按客户端时间 LWW；push 批次原子提交。

## 最近测试结果

2026-09-04：Task 1 红灯测试 `cd backend && python -m pytest tests/test_health.py -q` 首次失败于 `ModuleNotFoundError: No module named 'app'`，补最小入口后失败于 `404 != 200`。

2026-09-04：Task 1 绿灯测试 `cd backend && python -m pytest tests/test_health.py -q` 结果 1 passed；`cd frontend && npm run build` 结果 Vite production build 成功。

2026-09-04：Task 2 红灯测试 `cd backend && python -m pytest tests/test_vocabulary_import.py -q` 首次失败于 `ModuleNotFoundError: No module named 'app.db'`；补审计日志测试后失败于 `ImportError: cannot import name 'OperationLog'`。

2026-09-04：Task 2 绿灯测试 `cd backend && python -m pytest tests/test_vocabulary_import.py -q` 结果 7 passed；`cd backend && python -m pytest -q` 结果 8 passed；`cd backend && alembic upgrade head` 成功升级到 `202609040001`。

2026-09-04：Task 3 红灯测试 `cd backend && python -m pytest tests/test_study_pages.py -q` 首次失败于 `ImportError: cannot import name 'StudyPage'`；补熟词替换 API 测试后失败于 `404 == 200`；实现后 `cd backend && python -m pytest tests/test_study_pages.py -q` 结果 8 passed；`cd backend && python -m pytest -q` 结果 16 passed；`cd backend && alembic upgrade head` 成功升级到 `202609040002`。

2026-09-04：Task 3 评审修复分别以失败测试复现空页持久化、短页标记陈旧、旧会话可撤销、超时可撤销、状态时间未恢复及三类事务未回滚；二次复查补全全熟空页、未来完成时间和 OpenAPI 错误响应，最终 `cd backend && python -m pytest tests/test_study_pages.py -q` 结果 21 passed。

2026-09-04：Task 4 红灯测试首次失败于 `ModuleNotFoundError: No module named 'app.services.history_service'`，后续依次复现缺少月历、日期详情、历史快照和推荐轮次错误；绿灯测试 `cd backend && python -m pytest tests/test_history_and_schedule.py -q` 结果 6 passed。

2026-09-04：Task 5 红灯测试首次失败于 `ModuleNotFoundError: No module named 'app.services.forgetting_service'`，后续依次复现缺少熟词恢复、遗忘列表、专攻页、API、筛选导出、未完成页遗忘和重复完成保护；绿灯测试 `cd backend && python -m pytest tests/test_forgetting.py -q` 结果 9 passed。

2026-09-04：Task 6 红灯测试首次失败于 `ModuleNotFoundError: No module named 'app.services.stats_service'`，后续依次复现设置与统计 API 404、备份 API 404、词库导出 404、再次遗忘定义和专攻学习计数；绿灯测试 `cd backend && python -m pytest tests/test_stats_backup.py -q` 结果 7 passed。

2026-09-04：Task 7 依次以失败测试复现缺少学习页组件、历史页组件、五入口导航、完成后续页、遗忘筛选与专攻选择、专攻逐词结果和日期滑动；绿灯测试 `cd frontend && npm test -- --run` 结果 6 files、7 tests passed；`npm run typecheck` 与 `npm run build` 均成功。

2026-09-04：Task 8 红灯测试首次失败于缺少 `SyncRecord`，后续复现 API 依赖夹具错误、非法批次未映射 400、未知单词可创建进度和缺少 IndexedDB 队列；绿灯测试 `cd backend && python -m pytest tests/test_sync.py -q` 结果 5 passed，后端全量 56 passed；`cd frontend && npm test -- --run` 结果 7 files、9 tests passed，类型检查与生产构建成功。

2026-09-04：Task 9 红灯测试首次失败于缺少安全模块，后续复现密码夹具策略和前端登录组件缺失；绿灯测试 `cd backend && python -m pytest tests/test_auth.py -q` 结果 3 passed，后端全量 59 passed；`cd frontend && npm test -- --run` 结果 8 files、10 tests passed，类型检查、生产构建、迁移升级和 OpenAPI 生成成功。Docker CLI 未安装，容器 smoke test 未执行。

2026-09-04：默认词库红灯测试首次失败于缺少默认初始化服务；绿灯测试 `cd backend && python -m pytest tests/test_default_vocabulary.py -q` 结果 2 passed，实际本地启动验证默认词库 6547 个有效词并成功返回下一学习页。
2026-09-04：学习界面简化红灯测试复现单词下方仍存在元数据行；移除元数据并将展开释义放到单词右侧，针对性测试 1 passed，前端全量测试 8 files、10 tests passed，类型检查和生产构建成功。

2026-09-05：前端从零重写（工作目录 `C:\Users\zhan\Desktop\WordMaster-ui`，参考本地既有后端实现，未复制旧前端代码）。全程 TDD：每个阶段先写失败测试再实现。红灯记录：导航壳与 API 客户端 2 文件全挂；学习页 13 failed；日历/历史 9 failed；遗忘/专攻 13 failed；统计/设置/词库 19 failed；离线队列与同步引擎 2 文件无法解析模块。绿灯记录：`cd frontend && npm test` 结果 15 files、100 tests passed；`cd frontend && npm run typecheck` 通过；`cd frontend && npm run build` 成功（943ms，dist 含 manifest/service-worker/offline.html/图标）；`cd backend && python -m pytest -q` 回归 61 passed。期间真实缺陷由测试暴露并修复：`forgottenExportUrl` 误作对象方法导致模块导出缺失、离线判定缺少 `isNetworkError` 导出、备份导入改用 FileReader 兼容 jsdom。

2026-09-07：按评审清单逐项 TDD 修复 10 个前端可靠性与体验问题。红灯分别复现代理 502/503/504 未入队、非 JSON 5xx、开发环境注册 Service Worker、离线刷新无学习页、入队不主动同步、同步期间新增记录遗漏、推荐复习无入口、完成页不能记录复习遗忘、搜索旧响应覆盖、词库提示常驻、状态栏颜色固定及备份恢复不重载。绿灯结果：`cd backend && python -m pytest -q` 62 passed；`cd frontend && npm test` 17 files、124 tests passed；类型检查与生产构建通过。

2026-09-07：以失败测试确认词库 CSV 和遗忘词 CSV 均缺少 UTF-8 BOM；两个下载响应增加 BOM 后定向测试 2 passed，`cd backend && python -m pytest -q` 回归 62 passed。Excel 可直接识别中文，CSV 字段、换行与导入格式不变。

## 下一步建议

1. 用 `tests/e2e/README.md` 执行真实浏览器验收，重点验证代理返回 502 时的离线快照、离线入队与恢复联网后的自动同步。
2. 在具备 Docker CLI 的环境执行 Compose smoke test，验证 Nginx `/api/` 代理与数据卷。
3. 可选增强：离线撤销完成的重放保护、同步冲突的 UI 明细页、两设备真实同步验证。
4. 后续如增加业务行为，继续更新本文件、`CHANGELOG.md` 和 `DECISIONS.md`。

## AI 修改协议

1. 先读本文件、产品规格、实施计划和 `DECISIONS.md`。
2. 修改前说明影响范围；先写失败测试。
3. 不覆盖事件和历史快照；不直接手改生产数据库。
4. 完成后运行针对性测试，再运行相关全量测试。
5. 更新 `CHANGELOG.md`；行为变化更新 `DECISIONS.md`。
6. 未经用户明确要求，不执行破坏性删除、不提交密钥、不修改 GitHub 可见性。
7. 若具备 GitHub 推送权限，提交信息使用清晰的 Conventional Commits；推送前先报告变更和测试结果。
