# Changelog

## 2026-09-02

- 初始化公开项目文档、产品规格、实施计划和开发提示词。
- 纳入 `data/reden_vocabulary_6550.csv` 作为只读导入样本。
- 初始化本地 Git 仓库并推送至 GitHub `main` 分支。
- 应用代码尚未开始实现。

## 2026-09-04

- 建立 FastAPI 后端骨架，新增 `/api/v1/health` 健康检查。
- 建立 React/Vite 前端骨架，加入移动端底部导航和 PWA manifest/service worker 占位。
- 新增 Docker Compose、前后端 Dockerfile、环境变量示例和文档入口。
- 建立 SQLite/Alembic 初始迁移，新增词库、单词、进度和操作日志模型。
- 实现 CSV 词库导入、行级错误报告、规范化重复词跳过和词库管理 API。
- 实现学习页生成、未完成页复用、跨词库跳过、熟词即时替换、完成页快照和撤销完成。
- 修复学习页事务边界：熟词替换、页面完成和撤销失败时完整回滚。
- 无可学习单词时不再持久化空页面；熟词无替补时正确标记短页。
- 当前页最后一个词标熟且无替补时将页面标记为 `exhausted`，后续不再复用空页。
- 完成撤销限制为最新记录且须在五分钟内执行，并从剩余会话恢复页面和进度时间。
- 确认外部词库 `C:\Users\zhan\Desktop\wu\output\reden_vocabulary\reden_vocabulary_6550.csv` 与仓库 `data/reden_vocabulary_6550.csv` SHA256 一致。
