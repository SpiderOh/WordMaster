# AI 项目接手上下文

## 项目目标

移动端优先英语记单词 PWA：多 CSV 独立词库、可配置分页（默认 15 词）、纸笔背诵后整页记录、日期历史、遗忘排序与导出、离线同步、REST/OpenAPI。

## 当前状态

- 当前阶段：导入
- 最近完成：Task 2 建立数据库初始迁移、CSV 导入服务和词库管理 API
- 当前任务：执行实施计划 Task 3
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
- 数据库迁移版本：`202609040001_initial_vocabulary`

## 已实现接口与页面

- `GET /api/v1/health`：返回 `{ "status": "ok", "version": string }`，测试位置 `backend/tests/test_health.py`。
- `POST /api/v1/vocabularies/import`：multipart CSV 导入，返回词库摘要、有效行数和行级错误，测试位置 `backend/tests/test_vocabulary_import.py`。
- `GET /api/v1/vocabularies`、`GET /api/v1/vocabularies/{id}`、`PATCH /api/v1/vocabularies/{id}`、`PATCH /api/v1/vocabularies/{id}/active`、`PATCH /api/v1/vocabularies/{id}/priority`、`DELETE /api/v1/vocabularies/{id}`：词库管理接口，测试位置 `backend/tests/test_vocabulary_import.py`。

## 数据模型变更

- 新增 `users`、`vocabularies`、`words`、`word_progress`、`operation_logs`。
- `words.vocabulary_id + words.normalized_word` 保证同一词库内规范化英文唯一。
- `word_progress.user_id + word_progress.word_id` 保证用户单词进度唯一。

## 最近测试结果

2026-09-04：Task 1 红灯测试 `cd backend && python -m pytest tests/test_health.py -q` 首次失败于 `ModuleNotFoundError: No module named 'app'`，补最小入口后失败于 `404 != 200`。

2026-09-04：Task 1 绿灯测试 `cd backend && python -m pytest tests/test_health.py -q` 结果 1 passed；`cd frontend && npm run build` 结果 Vite production build 成功。

2026-09-04：Task 2 红灯测试 `cd backend && python -m pytest tests/test_vocabulary_import.py -q` 首次失败于 `ModuleNotFoundError: No module named 'app.db'`；补审计日志测试后失败于 `ImportError: cannot import name 'OperationLog'`。

2026-09-04：Task 2 绿灯测试 `cd backend && python -m pytest tests/test_vocabulary_import.py -q` 结果 7 passed；`cd backend && python -m pytest -q` 结果 8 passed；`cd backend && alembic upgrade head` 成功升级到 `202609040001`。

## 下一步建议

1. 执行 Task 3，完成学习页、快照、熟词替换和完成页事件，验证 `backend/tests/test_study_pages.py`。
2. 执行 Task 4，完成日期历史和推荐日期，验证 `backend/tests/test_history_and_schedule.py`。
3. 每个任务完成后更新本文件和 `CHANGELOG.md`。

## AI 修改协议

1. 先读本文件、产品规格、实施计划和 `DECISIONS.md`。
2. 修改前说明影响范围；先写失败测试。
3. 不覆盖事件和历史快照；不直接手改生产数据库。
4. 完成后运行针对性测试，再运行相关全量测试。
5. 更新 `CHANGELOG.md`；行为变化更新 `DECISIONS.md`。
6. 未经用户明确要求，不执行破坏性删除、不提交密钥、不修改 GitHub 可见性。
7. 若具备 GitHub 推送权限，提交信息使用清晰的 Conventional Commits；推送前先报告变更和测试结果。
