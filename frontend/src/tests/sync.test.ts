import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SyncQueue, type OfflineSyncEvent } from "../lib/sync/SyncQueue";

function event(id: string): OfflineSyncEvent {
  return {
    event_id: id,
    device_id: "phone-a",
    client_timestamp: "2026-09-04T08:00:00.000Z",
    entity_type: "word_progress",
    entity_id: "1",
    operation: "merge",
    changes: { forget_count_delta: 1 }
  };
}

describe("SyncQueue", () => {
  beforeEach(async () => {
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase("wordmaster-test");
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it("persists events and removes acknowledged batches", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [{ event_id: "evt-1", status: "applied" }] }) });
    const queue = new SyncQueue({ databaseName: "wordmaster-test", fetcher });
    await queue.enqueue(event("evt-1"));

    expect(await queue.status()).toMatchObject({ pending: 1, syncing: false });
    await queue.flush();

    expect(fetcher).toHaveBeenCalledWith("/api/v1/sync/push", expect.objectContaining({ method: "POST" }));
    expect(await queue.status()).toMatchObject({ pending: 0, syncing: false, lastError: null });
  });

  it("retains failed events and schedules exponential retry", async () => {
    const queue = new SyncQueue({ databaseName: "wordmaster-test", fetcher: vi.fn().mockRejectedValue(new Error("offline")), now: () => 1_000 });
    await queue.enqueue(event("evt-2"));

    await expect(queue.flush()).rejects.toThrow("offline");

    const status = await queue.status();
    expect(status.pending).toBe(1);
    expect(status.lastError).toBe("offline");
    expect(status.nextRetryAt).toBe(3_000);
  });
});
