# AI 项目接手上下文

## 项目目标

移动端优先英语记单词 PWA：多 CSV 独立词库、可配置分页（默认 15 词）、纸笔背诵后整页记录、日期历史、遗忘排序与导出、离线同步、REST/OpenAPI。

## 当前状态

- 当前阶段：设计完成，代码实现未开始
- 最近完成：产品规格、实施计划、开发总提示词、仓库初始化
- 当前任务：执行实施计划 Task 1
- 阻塞问题：无
- 最后更新：2026-09-02

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

- 后端启动：未实现
- 前端启动：未实现
- 测试命令：未实现
- Docker 启动：未实现
- 本地地址：未实现
- 数据库迁移版本：未实现

## 已实现接口与页面

尚未实现。完成每个任务后按模块补充接口、组件和测试位置。

## 最近测试结果

2026-09-02：已完成文档自检；应用测试尚未开始。

## 下一步建议

1. 执行 Task 1，建立前后端骨架和健康检查。
2. 执行 Task 2，完成数据库迁移和 CSV 导入。
3. 每个任务完成后更新本文件和 `CHANGELOG.md`。

## AI 修改协议

1. 先读本文件、产品规格、实施计划和 `DECISIONS.md`。
2. 修改前说明影响范围；先写失败测试。
3. 不覆盖事件和历史快照；不直接手改生产数据库。
4. 完成后运行针对性测试，再运行相关全量测试。
5. 更新 `CHANGELOG.md`；行为变化更新 `DECISIONS.md`。
6. 未经用户明确要求，不执行破坏性删除、不提交密钥、不修改 GitHub 可见性。
7. 若具备 GitHub 推送权限，提交信息使用清晰的 Conventional Commits；推送前先报告变更和测试结果。
