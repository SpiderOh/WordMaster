# 离线同步说明

前端使用 IndexedDB 的 `events` 与 `meta` 对象仓库存储待同步事件和退避状态；联网后通过 `/api/v1/sync/push` 与 `/api/v1/sync/pull` 增量同步。事件字段为 `event_id`、`device_id`、`client_timestamp`、`entity_type`、`entity_id`、`operation` 和 `changes`，服务器记录 `server_timestamp`。

## 合并规则

- `user_id + event_id` 唯一，重复推送返回 `duplicate`，不再次修改业务数据。
- `study_count_delta`、`forget_count_delta` 只接受非负增量并累加；遗忘增量同步设置历史遗忘与专攻状态。
- `word_progress.status` 和用户设置按 `client_timestamp` 与服务器对象 `updated_at` 比较；旧事件返回 `conflict` 并保存客户端值和服务器值。
- 一个 push 批次使用单一数据库事务；任一事件非法时整批回滚并返回 400。
- 单词进度事件必须指向当前用户词库中的真实单词。

## 拉取与重试

`GET /api/v1/sync/pull?cursor=N` 返回 `sync_records.id > N` 的事件及 `next_cursor`。游标只递增；无新事件时原样返回。

前端失败后保留事件，退避从 2 秒开始指数增长，上限 60 秒；应用启动、浏览器恢复联网和退避到期时重试。服务器确认 `applied`、`duplicate` 或 `conflict` 后事件出队，冲突详情保留在服务器同步记录中。

Service worker 缓存应用壳和访问过的静态 GET 资源，不缓存 `/api/` 响应；断网导航无法命中应用壳时显示 `offline.html`。
