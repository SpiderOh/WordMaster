# WordMaster

移动端优先的英语记单词 PWA，服务于纸笔背单词流程：按页显示单词，完成一页后记录学习日期和次数，并通过日期历史追踪第 1、2、3 次学习。

## 当前阶段

项目已完成移动端优先 PWA、FastAPI 后端、CSV 词库、学习历史、遗忘专攻、离线同步和服务器认证实现。

## 交给 AI 开发

把 `docs/AI_DEVELOPMENT_PROMPT.md` 的全文复制给开发 AI，并让它在本仓库根目录工作。AI 开始前必须阅读：

- `docs/superpowers/specs/2026-09-02-english-word-memory-design.md`
- `docs/superpowers/plans/2026-09-02-english-word-memory.md`
- `docs/AI_DEVELOPMENT_PROMPT.md`
- `docs/AI_CONTEXT_TEMPLATE.md`
- `docs/AI_CONTEXT.md`
- `docs/DECISIONS.md`

词库样本位于 `data/reden_vocabulary_6550.csv`。该文件仅作为项目输入样本，不应被运行时直接修改。
该样本与本机源文件 `C:\Users\zhan\Desktop\wu\output\reden_vocabulary\reden_vocabulary_6550.csv` 内容一致，SHA256 为 `3FEAA1FE5293A256C2C94BF0A1E380807CE59A2E9138DB5D50A419E628B12038`，会随仓库提交推送。

开发 AI 应按 `docs/superpowers/plans/2026-09-02-english-word-memory.md` 分任务实现，每个任务先测试后编码，完成后更新留痕文档。

## 计划技术栈

- 前端：React + TypeScript + Vite + PWA + IndexedDB
- 后端：FastAPI + SQLite
- 接口：REST + OpenAPI
- 部署：Docker Compose

## 本地运行

后端：

```powershell
cd backend
python -m pip install -e ".[dev]"
alembic upgrade head
uvicorn app.main:app --reload
```

前端另开终端：

```powershell
cd frontend
npm install
npm run dev
```

打开 `http://127.0.0.1:5173`。首次启动会自动导入并启用默认词库 `data/reden_vocabulary_6550.csv`，已有词库时不会重复导入。本地模式免登录；服务器模式需在 `.env` 设置 `WORDMASTER_AUTH_MODE=server`、`WORDMASTER_SECRET_KEY`、`WORDMASTER_SERVER_USERNAME` 和 `WORDMASTER_SERVER_PASSWORD`。

## 验证

- 后端全量：`cd backend; python -m pytest -q`
- 前端全量：`cd frontend; npm test -- --run`
- 类型与构建：`cd frontend; npm run typecheck; npm run build`
- OpenAPI：`docs/openapi.json`

Docker Compose 将前端 Nginx 的 `/api/` 代理到后端，并把 SQLite 数据保存到 `wordmaster_data` 卷；当前开发机未安装 Docker CLI，未执行容器 smoke test。

## 本地目录

- 词库样本：`data/reden_vocabulary_6550.csv`
- 产品规格：`docs/superpowers/specs/2026-09-02-english-word-memory-design.md`
- 实施计划：`docs/superpowers/plans/2026-09-02-english-word-memory.md`
- 开发总提示词：`docs/AI_DEVELOPMENT_PROMPT.md`

## 安全

不要提交 `.env`、密码、Token、私钥、服务器凭据或包含个人隐私的数据。公开仓库只保留示例配置和可公开的词库内容。

## 许可证

尚未决定许可证。确定开源方式后再新增 `LICENSE` 文件。
