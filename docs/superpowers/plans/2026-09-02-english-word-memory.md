# 英语记单词程序实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个移动端优先、支持 CSV 词库、日期学习记录、遗忘统计、离线同步和 OpenAPI 的英语记单词 PWA。

**Architecture:** 采用 FastAPI + React/TypeScript + Vite + SQLite 的模块化单体。前端负责手机交互、PWA 和 IndexedDB 离线队列；后端通过服务层维护词库、学习页、事件、统计和同步；数据库使用迁移脚本并保留 PostgreSQL 迁移边界。

**Tech Stack:** Python 3.12+、FastAPI、Pydantic、SQLAlchemy/SQLModel、Alembic、SQLite、pytest；Node.js 20+、React、TypeScript、Vite、PWA、IndexedDB；Docker Compose。

## Global Constraints

- 每个 CSV 对应独立词库，至少要求 `word,meaning`，保留 `number`、`source_page` 和释义换行。
- 默认每页 15 个词，修改只影响以后页面；历史页面保存快照。
- 只有一个学习板块；推荐间隔默认 `0、1、4` 天，只提示不形成积压。
- 第一次学习可标记熟/遗忘，后续学习不显示熟按钮；熟词立即替换且补入词次数为 0。
- 遗忘次数累加并保留事件；独立遗忘入口按次数降序，支持筛选、导出和专攻页。
- 本地免登录，服务器启用 Token；PWA 离线记录，联网后增量同步。
- 不引入微服务、Redis、消息队列、复杂第三方登录或不必要的重型框架。
- 每次行为修改必须更新测试、`CHANGELOG.md`；行为决策变化必须更新 `DECISIONS.md` 和 `AI_CONTEXT.md`。

---

### Task 1: 建立项目骨架与文档入口

**Files:**
- Create: `frontend/package.json`, `frontend/tsconfig.json`, `frontend/vite.config.ts`, `frontend/src/`
- Create: `backend/pyproject.toml`, `backend/app/main.py`, `backend/app/core/config.py`
- Create: `docker-compose.yml`, `.env.example`
- Create: `docs/README.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/API.md`, `docs/SYNC.md`, `docs/DECISIONS.md`, `docs/CHANGELOG.md`, `docs/AI_CONTEXT.md`
- Test: `backend/tests/test_health.py`

**Interfaces:**
- Produces `GET /api/v1/health` returning `{ "status": "ok", "version": string }`.
- Produces frontend route shell and PWA manifest/service worker placeholder.

- [ ] 写健康检查失败测试，确认未实现时失败。
- [ ] 创建 FastAPI 应用、版本化路由和健康检查。
- [ ] 创建 React/Vite 应用、基础路由和移动端 CSS 变量。
- [ ] 添加 Docker Compose、环境变量示例和本地启动说明。
- [ ] 运行 `pytest backend/tests/test_health.py -q` 与 `npm run build`，确认通过。
- [ ] 更新 `CHANGELOG.md` 和 `AI_CONTEXT.md`，记录目录和启动命令。

### Task 2: 数据库迁移与词库导入

**Files:**
- Create: `backend/app/db/session.py`, `backend/app/db/models.py`, `backend/alembic.ini`, `backend/migrations/`
- Create: `backend/app/services/vocabulary_import.py`, `backend/app/api/v1/vocabularies.py`
- Create: `backend/tests/test_vocabulary_import.py`, `backend/tests/fixtures/reden_sample.csv`

**Interfaces:**
- `POST /api/v1/vocabularies/import` accepts multipart CSV and returns vocabulary summary plus row errors.
- `VocabularyImportService.import_csv(file, name, user_id) -> ImportResult`.
- `normalize_word(value: str) -> str` trims outer whitespace and case-folds English text.

- [ ] 写测试覆盖当前 CSV 表头、释义换行、缺失可选列、无效行单独报告、规范化重复词。
- [ ] 建立 `users`、`vocabularies`、`words`、`word_progress` 表及唯一索引。
- [ ] 实现 CSV 流式读取、字段映射、错误行隔离和导入统计。
- [ ] 实现词库列表、详情、重命名、激活/停用、优先级和删除接口。
- [ ] 运行导入相关 pytest，确认样例与真实 CSV 均可导入。
- [ ] 更新数据库文档、API 文档和决策记录。

### Task 3: 学习页生成与页面快照

**Files:**
- Create: `backend/app/services/study_page_service.py`, `backend/app/api/v1/study_pages.py`
- Modify: `backend/app/db/models.py`, `backend/app/schemas/study_pages.py`
- Create: `backend/tests/test_study_pages.py`

**Interfaces:**
- `StudyPageService.get_or_create_next_page(user_id, page_size) -> StudyPage`。
- `StudyPageService.replace_mastered_word(page_id, word_id) -> StudyPage`。
- `StudyPageService.complete_page(page_id, completed_at) -> StudySession`。
- `GET /api/v1/study-pages/next`、`GET /api/v1/study-pages/{id}`、`POST /api/v1/study-pages/{id}/complete`。

- [ ] 写测试覆盖多词库优先级、CSV 顺序、跨词库跳过条件、页大小、词库不足和熟词即时替换。
- [ ] 建立 `study_pages`、`study_page_words`、`study_sessions`、`word_study_events` 表。
- [ ] 实现按优先级取词；跳过其他词库中学习次数至少 3 且历史遗忘次数为 0 的词。
- [ ] 实现页面固定顺序、未完成页面复用和熟词替换。
- [ ] 完成本页时为未熟词增加学习次数，写入快照和学习事件；实现短时间撤销。
- [ ] 运行页面服务测试并验证事务回滚行为。

### Task 4: 日期历史与推荐日期

**Files:**
- Create: `backend/app/services/history_service.py`, `backend/app/api/v1/history.py`
- Modify: `backend/app/services/study_page_service.py`
- Create: `backend/tests/test_history_and_schedule.py`

**Interfaces:**
- `calculate_recommended_dates(completed_at, intervals: list[int]) -> list[date]`。
- `GET /api/v1/history/calendar?month=YYYY-MM`。
- `GET /api/v1/history?date=YYYY-MM-DD`。
- `GET /api/v1/history/pages/{id}`。

- [ ] 写测试覆盖 `0,1,4` 日期、无学习日期灰色、推荐与实际完成标记、第二/第三次完成情况。
- [ ] 根据学习事件聚合日历摘要，不创建逾期队列。
- [ ] 提供日期页面列表、相邻页面查询和快照恢复。
- [ ] 确保页大小变化不修改历史快照。
- [ ] 运行历史和排程测试并更新 API 文档。

### Task 5: 遗忘、熟词恢复与专攻页

**Files:**
- Create: `backend/app/services/forgetting_service.py`, `backend/app/api/v1/forgotten_words.py`
- Modify: `backend/app/api/v1/study_pages.py`, `backend/app/db/models.py`
- Create: `backend/tests/test_forgetting.py`

**Interfaces:**
- `mark_forgotten(user_id, word_id, session_id) -> WordProgress`。
- `undo_last_forgetting(user_id, word_id) -> WordProgress`。
- `restore_mastered(user_id, word_id) -> WordProgress`。
- `GET /api/v1/forgotten-words?sort=forget_count_desc`。
- `POST /api/v1/forgotten-words/special-page`。

- [ ] 写测试覆盖首次遗忘、再次遗忘、撤销、熟词恢复、专攻记得/遗忘/熟和次数降序。
- [ ] 实现事件追加而非覆盖，保持历史遗忘标志。
- [ ] 第一次学习允许熟词操作，后续接口拒绝熟词操作。
- [ ] 实现筛选、搜索、词库过滤、历史页跳转数据和 CSV 导出。
- [ ] 运行遗忘模块测试并检查统计所需字段。

### Task 6: 统计、设置与备份恢复

**Files:**
- Create: `backend/app/services/stats_service.py`, `backend/app/api/v1/stats.py`
- Create: `backend/app/api/v1/settings.py`, `backend/app/api/v1/backup.py`
- Create: `backend/tests/test_stats_backup.py`

**Interfaces:**
- `GET /api/v1/stats/today` returns study, forgetting, repeated-forgetting and streak metrics.
- `GET /api/v1/stats/today/repeated-forgetting` returns word details.
- `GET/PUT /api/v1/settings` manages page size, intervals, theme, font size and vocabulary priorities.
- `GET/POST /api/v1/backup/json` exports/imports complete progress.

- [ ] 写测试验证今日学习包含遗忘词、再次遗忘定义、连续学习天数和筛选导出。
- [ ] 实现统计聚合，避免从前端计数。
- [ ] 实现 JSON 备份版本号、校验、事务导入和错误回滚。
- [ ] 实现单词库 CSV、遗忘列表 CSV 导出。
- [ ] 运行统计与备份测试并更新迁移说明。

### Task 7: 前端学习、日期和遗忘界面

**Files:**
- Create: `frontend/src/features/learning/`, `frontend/src/features/history/`, `frontend/src/features/forgotten/`, `frontend/src/features/stats/`
- Create: `frontend/src/lib/api.ts`, `frontend/src/lib/types.ts`, `frontend/src/app/router.tsx`
- Create: `frontend/src/tests/learning.test.tsx`, `frontend/src/tests/history.test.tsx`

**Interfaces:**
- API client methods mirror `/api/v1` contracts and expose typed responses.
- Learning page components support `onReveal`, `onForget`, `onMaster`, `onComplete`.

- [ ] 先写组件测试：竖向 15 行、释义左侧显示、第一次显示熟按钮、后续隐藏熟按钮、完成确认。
- [ ] 实现移动端底部导航：学习、日期、遗忘、统计、设置入口。
- [ ] 实现稳定行高、深色模式、字号调节、横屏兼容和左右滑动。
- [ ] 实现日历灰色日期、推荐/已完成颜色、第二/第三次完成状态。
- [ ] 实现遗忘排序、筛选、搜索、导出和专攻页。
- [ ] 运行 Vitest/React Testing Library 与生产构建。

### Task 8: PWA、IndexedDB 与同步 API

**Files:**
- Create: `frontend/src/lib/offline/`, `frontend/src/lib/sync/`, `backend/app/services/sync_service.py`, `backend/app/api/v1/sync.py`
- Create: `backend/tests/test_sync.py`, `frontend/src/tests/sync.test.ts`

**Interfaces:**
- `POST /api/v1/sync/push` accepts idempotent event batches.
- `GET /api/v1/sync/pull?cursor=...` returns missing events and next cursor.
- `SyncQueue.enqueue(event)`, `SyncQueue.flush()`, `SyncQueue.status()`。

- [ ] 写测试验证重复 event ID 幂等、计数增量合并、最后修改时间状态合并和冲突记录。
- [ ] 实现 IndexedDB 数据表、离线事件队列和重试退避。
- [ ] 实现服务端同步记录、设备标识和冲突结果。
- [ ] 配置 PWA manifest、service worker、离线页面和待同步提示。
- [ ] 运行前后端同步测试并使用两个设备模拟离线修改。

### Task 9: 认证、部署与最终验收

**Files:**
- Create: `backend/app/api/v1/auth.py`, `backend/app/core/security.py`
- Modify: `docker-compose.yml`, `.env.example`
- Create: `tests/e2e/`, `docs/openapi.json`

**Interfaces:**
- `POST /api/v1/auth/login` returns access token.
- Protected routes require bearer token in server mode; local mode can disable auth.

- [ ] 写登录、Token、退出和本地免登录模式测试。
- [ ] 实现密码哈希、Token 过期、单用户服务器初始化和迁移导入。
- [ ] 构建前端静态资源和后端镜像，挂载 SQLite 数据卷。
- [ ] 运行完整后端测试、前端测试、类型检查、生产构建和 Docker smoke test。
- [ ] 更新 `README.md`、`API.md`、`AI_CONTEXT.md`、`CHANGELOG.md`，生成最终 OpenAPI 文件。
- [ ] 按规格验收 CSV 导入、页面完成、熟词替换、日期历史、遗忘统计、离线同步和备份恢复。

## 完成定义

- 所有任务测试通过，关键业务规则有 API/服务层测试。
- 手机浏览器可完成导入后的连续学习、历史日期查看和遗忘处理。
- Docker Compose 可在小型服务器启动，数据卷和备份恢复可验证。
- OpenAPI、数据库说明、架构说明、决策记录、变更日志和 AI 上下文均为最新。
