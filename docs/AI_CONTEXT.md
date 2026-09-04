# AI 项目接手上下文

## 项目目标

移动端优先英语记单词 PWA：多 CSV 独立词库、可配置分页（默认 15 词）、纸笔背诵后整页记录、日期历史、遗忘排序与导出、离线同步、REST/OpenAPI。

## 当前状态

- 当前阶段：骨架
- 最近完成：Task 1 建立 FastAPI 后端、React/Vite 前端、PWA 占位、Docker Compose 和健康检查
- 当前任务：执行实施计划 Task 2
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
- 数据库迁移版本：未实现

## 已实现接口与页面

- `GET /api/v1/health`：返回 `{ "status": "ok", "version": string }`，测试位置 `backend/tests/test_health.py`。

## 最近测试结果

2026-09-04：Task 1 红灯测试 `cd backend && python -m pytest tests/test_health.py -q` 首次失败于 `ModuleNotFoundError: No module named 'app'`，补最小入口后失败于 `404 != 200`。

2026-09-04：Task 1 绿灯测试 `cd backend && python -m pytest tests/test_health.py -q` 结果 1 passed；`cd frontend && npm run build` 结果 Vite production build 成功。

## 下一步建议

1. 执行 Task 2，完成数据库迁移和 CSV 导入，验证 `backend/tests/test_vocabulary_import.py`。
2. 执行 Task 3，完成学习页、快照、熟词替换和完成页事件。
3. 每个任务完成后更新本文件和 `CHANGELOG.md`。

## AI 修改协议

1. 先读本文件、产品规格、实施计划和 `DECISIONS.md`。
2. 修改前说明影响范围；先写失败测试。
3. 不覆盖事件和历史快照；不直接手改生产数据库。
4. 完成后运行针对性测试，再运行相关全量测试。
5. 更新 `CHANGELOG.md`；行为变化更新 `DECISIONS.md`。
6. 未经用户明确要求，不执行破坏性删除、不提交密钥、不修改 GitHub 可见性。
7. 若具备 GitHub 推送权限，提交信息使用清晰的 Conventional Commits；推送前先报告变更和测试结果。
