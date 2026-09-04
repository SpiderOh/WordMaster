# 离线同步说明

前端使用 IndexedDB 缓存数据和事件队列；联网后通过 `/api/v1/sync/push` 与 `/api/v1/sync/pull` 增量同步。事件带唯一 ID、设备 ID、客户端时间和服务器时间。

合并规则：计数按增量累加，事件按 ID 幂等，状态/设置/优先级按最后修改时间，冲突写入 `sync_records`。实现 Task 8 后补充具体字段、重试策略和冲突示例。

当前 Task 1 仅提供 PWA service worker 占位，不包含离线事件队列和服务端同步接口。
