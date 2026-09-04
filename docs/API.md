# API 说明

API 前缀为 `/api/v1`，使用 FastAPI 自动生成 OpenAPI。目标模块包括认证、词库、单词、学习页、学习事件、遗忘词、历史、统计、设置、同步和备份。

实现每个接口后，必须补充请求/响应模型、错误示例、分页与筛选参数，并生成 `docs/openapi.json`。

### `POST /api/v1/auth/login`

服务器模式接收 `{ "username": "owner", "password": "..." }`，返回短期 `access_token`、`token_type` 和 `expires_in`。本地模式不开放登录接口。

### `POST /api/v1/auth/logout`

接收 Bearer Token 并持久化撤销对应令牌，成功返回 204。服务器模式下除健康检查、登录外的业务接口均要求 `Authorization: Bearer <token>`。

## 已实现接口

### `GET /api/v1/health`

返回后端进程状态和应用版本。

响应示例：

```json
{
  "status": "ok",
  "version": "0.1.0"
}
```

### `POST /api/v1/vocabularies/import`

上传 CSV 并创建独立词库。请求为 multipart form-data：

- `name`：词库名称。
- `file`：CSV 文件，至少包含 `word,meaning`，可选 `number,source_page`。

响应包含词库摘要、有效导入数量和行级错误。无效行不会阻塞有效行。

### `GET /api/v1/vocabularies`

按 `priority, id` 返回当前用户未删除词库。

### `GET /api/v1/vocabularies/{id}`

返回单个词库摘要。不存在、非当前用户或已删除时返回 404。

### `PATCH /api/v1/vocabularies/{id}`

当前支持重命名：`{ "name": "新名称" }`。

### `PATCH /api/v1/vocabularies/{id}/active`

启用或停用词库：`{ "active": true }`。

### `PATCH /api/v1/vocabularies/{id}/priority`

调整词库优先级：`{ "priority": 7 }`。数值越小越靠前。

### `DELETE /api/v1/vocabularies/{id}?confirm=词库名称`

二次确认后软删除词库，并写入 `operation_logs`。

### `GET /api/v1/study-pages/next?page_size=15`

返回当前未完成学习页；如果没有未完成页，则按激活词库优先级和 CSV 原始顺序生成新页。跨词库同词跳过规则在服务层执行。词库不足时 `is_short` 为 `true`；完全没有候选词时返回 404，且不创建空页面。

### `GET /api/v1/study-pages/{id}`

返回学习页详情、固定单词顺序、释义、词库名、原始页码、学习次数、遗忘次数和是否可标记熟。

### `POST /api/v1/study-pages/{id}/words/{word_id}/master`

第一次学习时标记熟词，将该词从当前未完成页移除并补入学习次数为 0 的新词。后续学习次数不为 0 时返回 400。

若最后一个活动词被标记熟且没有候选替补，页面状态变为 `exhausted`，不会作为未完成页再次复用。

### `POST /api/v1/study-pages/{id}/complete`

请求示例：

```json
{
  "completed_at": "2026-09-04T08:30:00+00:00"
}
```

完成当前页，为当前页仍激活的单词学习次数加 1，写入 `study_sessions.snapshot` 和 `word_study_events`。

### `POST /api/v1/study-pages/{id}/undo-complete`

请求示例：

```json
{
  "session_id": 1
}
```

仅可在完成后 300 秒内撤销该页最新的未撤销记录。接口撤销对应学习次数增量并追加事件，再根据剩余有效会话恢复页面状态和单词首末学习时间。

### `GET /api/v1/history/calendar?month=YYYY-MM`

返回指定月份的完整日期列表。每一天包含实际完成标记、推荐标记和完成会话数量；没有学习或推荐的日期供前端显示为灰色。

### `GET /api/v1/history?date=YYYY-MM-DD`

返回指定日期实际完成或推荐学习的页面，包含学习轮次、第二次/第三次完成状态和剩余推荐次数。推荐日期只用于提示，不形成逾期队列。

### `GET /api/v1/history/pages/{session_id}`

返回指定完成会话保存的不可变页面快照，以及按完成时间排序的前后会话 ID。后续修改页大小不会改变历史快照。

### `POST /api/v1/study-pages/{id}/words/{word_id}/forget`

在完成会话或当前未完成页中记录一次遗忘并立即提交。未完成页遗忘不会增加学习次数；请求可带 `session_id` 关联历史完成会话。

### `GET /api/v1/forgotten-words`

默认按遗忘次数降序返回，支持 `search`、`vocabulary_id`、`status` 和 `forgotten_since` 筛选。

### `GET /api/v1/forgotten-words/export`

导出包含单词、释义、词库、状态、学习次数、遗忘次数和最近遗忘时间的 CSV。

### `POST /api/v1/forgotten-words/{word_id}/undo`

追加撤销事件并抵消最近一条尚未撤销的遗忘事件，不允许直接填写遗忘次数。

### `POST /api/v1/forgotten-words/{word_id}/restore`

将熟词恢复为未学习并重新进入普通选词队列。

### `POST /api/v1/forgotten-words/special-page`

从所选遗忘词创建专攻页。`POST /api/v1/forgotten-words/special-pages/{page_id}/complete` 逐词接收 `remembered`、`forgotten` 或 `mastered` 结果。

### `GET /api/v1/stats/today`

返回指定 `date`（默认今天）的学习单词数、遗忘事件数、再次遗忘单词数、连续学习天数、累计学习次数及各状态数量。专攻页结果和遗忘词均计入今日学习单词。

### `GET /api/v1/stats/today/repeated-forgetting`

返回今日再次遗忘单词明细。某词今天遗忘且此前已有有效遗忘，即属于再次遗忘。

### `GET /api/v1/settings` 与 `PUT /api/v1/settings`

读取或更新页大小、推荐间隔、主题、字号和词库优先级。页大小仅影响以后生成的新页面。

### `GET /api/v1/backup/json` 与 `POST /api/v1/backup/json`

导出或事务恢复版本化完整用户数据。导入前校验表结构和跨表引用，失败时不改变现有数据。

### `GET /api/v1/vocabularies/{id}/export`

按原 CSV 顺序导出 `number,word,meaning,source_page`，保留释义换行。

### `POST /api/v1/sync/push`

批量接收离线事件。事件包含唯一事件 ID、设备 ID、客户端时间、实体类型/ID、操作和变更。返回每条事件的 `applied`、`duplicate` 或 `conflict` 状态；非法事件使整个批次回滚并返回 400。

当前支持 `word_progress` 的非负学习/遗忘次数增量和状态合并，以及 `user_settings` 的最后修改时间合并。单词必须属于当前用户。

### `GET /api/v1/sync/pull?cursor=0`

按服务器同步记录 ID 增量返回事件、处理状态、服务器时间和冲突详情，同时返回下一游标。无新事件时保持传入游标。
