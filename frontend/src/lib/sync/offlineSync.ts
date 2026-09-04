import { SyncQueue, type OfflineSyncEvent } from "./SyncQueue";

export const syncQueue = new SyncQueue();

function deviceId(): string {
  const key = "wordmaster-device-id";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem(key, created);
  return created;
}

export function createSyncEvent(entityType: OfflineSyncEvent["entity_type"], entityId: string, changes: Record<string, unknown>): OfflineSyncEvent {
  return {
    event_id: crypto.randomUUID(),
    device_id: deviceId(),
    client_timestamp: new Date().toISOString(),
    entity_type: entityType,
    entity_id: entityId,
    operation: "merge",
    changes
  };
}

export async function enqueueWordChanges(wordId: number, changes: Record<string, unknown>): Promise<void> {
  await syncQueue.enqueue(createSyncEvent("word_progress", String(wordId), changes));
}
