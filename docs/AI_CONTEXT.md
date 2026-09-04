# AI 项目接手上下文

## 项目目标

移动端优先英语记单词 PWA：多 CSV 独立词库、可配置分页（默认 15 词）、纸笔背诵后整页记录、日期历史、遗忘排序与导出、离线同步、REST/OpenAPI。

## 当前状态

- 当前阶段：最终验收完成
- 最近完成：Task 9 实现认证、部署代理、OpenAPI 和最终测试
- 当前任务：等待用户验收或后续迭代
- 阻塞问题：无
- 最后更新：2026-09-04

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
- 测试命令：`cd backend && python -m pytest tests/test_health.py -q`；`cd frontend && npm run build`
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
- 前端提供学习、日期、遗忘、统计、设置五个移动端入口，API 客户端统一映射 `/api/v1`。
- 普通学习支持释义显隐、首次标熟、即时遗忘、完成确认和完成后自动续页。
- 日期页显示空白、推荐、已完成三态与后续轮次，并支持左右滑动切换日期。
- 遗忘页支持搜索、词库/状态筛选、导出、批量选词和专攻页三种逐词结果。
- `POST /api/v1/sync/push`：幂等批量应用进度/设置事件，非法批次回滚并记录 LWW 冲突。
- `GET /api/v1/sync/pull`：按同步记录 ID 游标拉取已处理事件和冲突。
- 前端 IndexedDB 队列在网络失败时持久化学习变化，启动、联网和退避到期后自动重试；PWA 缓存应用壳并提供离线页。
- `POST /api/v1/auth/login`、`POST /api/v1/auth/logout`：服务器模式登录和持久化撤销 Bearer Token；本地模式免登录。
- Compose 前端 Nginx 将 `/api/` 代理到 backend，SQLite 使用 `wordmaster_data` 卷；E2E 验收步骤位于 `tests/e2e/README.md`。

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

## 下一步建议

1. 用 `tests/e2e/README.md` 执行真实浏览器验收。
2. 在具备 Docker CLI 的环境执行 Compose smoke test。
3. 后续如增加业务行为，继续更新本文件、`CHANGELOG.md` 和 `DECISIONS.md`。

## AI 修改协议

1. 先读本文件、产品规格、实施计划和 `DECISIONS.md`。
2. 修改前说明影响范围；先写失败测试。
3. 不覆盖事件和历史快照；不直接手改生产数据库。
4. 完成后运行针对性测试，再运行相关全量测试。
5. 更新 `CHANGELOG.md`；行为变化更新 `DECISIONS.md`。
6. 未经用户明确要求，不执行破坏性删除、不提交密钥、不修改 GitHub 可见性。
7. 若具备 GitHub 推送权限，提交信息使用清晰的 Conventional Commits；推送前先报告变更和测试结果。
