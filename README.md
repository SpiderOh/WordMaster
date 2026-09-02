# WordMaster

移动端优先的英语记单词 PWA，服务于纸笔背单词流程：按页显示单词，完成一页后记录学习日期和次数，并通过日期历史追踪第 1、2、3 次学习。

## 当前阶段

项目已完成产品设计和实施计划，尚未开始应用代码实现。词库样本已纳入仓库，后续 AI 可直接从第一阶段开始开发。

## 交给 AI 开发

把 `docs/AI_DEVELOPMENT_PROMPT.md` 的全文复制给开发 AI，并让它在本仓库根目录工作。AI 开始前必须阅读：

- `docs/superpowers/specs/2026-09-02-english-word-memory-design.md`
- `docs/superpowers/plans/2026-09-02-english-word-memory.md`
- `docs/AI_DEVELOPMENT_PROMPT.md`
- `docs/AI_CONTEXT_TEMPLATE.md`
- `docs/AI_CONTEXT.md`
- `docs/DECISIONS.md`

词库样本位于 `data/reden_vocabulary_6550.csv`。该文件仅作为项目输入样本，不应被运行时直接修改。

开发 AI 应按 `docs/superpowers/plans/2026-09-02-english-word-memory.md` 分任务实现，每个任务先测试后编码，完成后更新留痕文档。

## 计划技术栈

- 前端：React + TypeScript + Vite + PWA + IndexedDB
- 后端：FastAPI + SQLite
- 接口：REST + OpenAPI
- 部署：Docker Compose

## 本地目录

- 词库样本：`data/reden_vocabulary_6550.csv`
- 产品规格：`docs/superpowers/specs/2026-09-02-english-word-memory-design.md`
- 实施计划：`docs/superpowers/plans/2026-09-02-english-word-memory.md`
- 开发总提示词：`docs/AI_DEVELOPMENT_PROMPT.md`

## 安全

不要提交 `.env`、密码、Token、私钥、服务器凭据或包含个人隐私的数据。公开仓库只保留示例配置和可公开的词库内容。

## 许可证

尚未决定许可证。确定开源方式后再新增 `LICENSE` 文件。
