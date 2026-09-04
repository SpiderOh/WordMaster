# WordMaster 文档入口

本目录记录 WordMaster 的架构、数据、接口、同步、决策、变更和 AI 接手上下文。

## 本地开发

- 后端安装：`cd backend && python -m pip install -e .[dev]`
- 后端启动：`cd backend && uvicorn app.main:app --reload`
- 前端安装：`cd frontend && npm install`
- 前端启动：`cd frontend && npm run dev`
- Docker 启动：`docker compose up --build`

## 文档索引

- 架构：`docs/ARCHITECTURE.md`
- 数据库：`docs/DATABASE.md`
- API：`docs/API.md`
- 同步：`docs/SYNC.md`
- 决策：`docs/DECISIONS.md`
- 变更：`docs/CHANGELOG.md`
- AI 上下文：`docs/AI_CONTEXT.md`
