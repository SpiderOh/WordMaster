export interface OfflineSyncEvent {
  event_id: string;
  device_id: string;
  client_timestamp: string;
  entity_type: "word_progress" | "user_settings";
  entity_id: string;
  operation: string;
  changes: Record<string, unknown>;
}

export interface SyncQueueStatus {
  pending: number;
  syncing: boolean;
  lastError: string | null;
  nextRetryAt: number | null;
}

interface QueueMeta {
  key: "state";
  attempts: number;
  lastError: string | null;
  nextRetryAt: number | null;
}

interface SyncQueueOptions {
  databaseName?: string;
  fetcher?: typeof fetch;
  now?: () => number;
}

const initialMeta: QueueMeta = { key: "state", attempts: 0, lastError: null, nextRetryAt: null };

export class SyncQueue {
  private readonly databaseName: string;
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private syncing = false;

  constructor(options: SyncQueueOptions = {}) {
    this.databaseName = options.databaseName ?? "wordmaster";
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? Date.now;
  }

  async enqueue(event: OfflineSyncEvent): Promise<void> {
    await this.write("events", (store) => store.put(event));
  }

  async status(): Promise<SyncQueueStatus> {
    const [pending, meta] = await Promise.all([this.countEvents(), this.readMeta()]);
    return { pending, syncing: this.syncing, lastError: meta.lastError, nextRetryAt: meta.nextRetryAt };
  }

  async flush(): Promise<void> {
    if (this.syncing) return;
    const events = await this.readAllEvents();
    if (events.length === 0) return;
    this.syncing = true;
    try {
      const response = await this.fetcher("/api/v1/sync/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events })
      });
      if (!response.ok) throw new Error(`sync failed: ${response.status}`);
      const payload = await response.json() as { results: Array<{ event_id: string }> };
      await this.deleteEvents(payload.results.map((result) => result.event_id));
      await this.writeMeta(initialMeta);
    } catch (error) {
      const meta = await this.readMeta();
      const attempts = meta.attempts + 1;
      const message = error instanceof Error ? error.message : String(error);
      await this.writeMeta({ key: "state", attempts, lastError: message, nextRetryAt: this.now() + Math.min(60_000, 2 ** attempts * 1_000) });
      throw error;
    } finally {
      this.syncing = false;
    }
  }

  private async open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("events")) db.createObjectStore("events", { keyPath: "event_id" });
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private async write(storeName: "events" | "meta", action: (store: IDBObjectStore) => IDBRequest): Promise<void> {
    const db = await this.open();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(storeName, "readwrite");
        action(transaction.objectStore(storeName));
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      db.close();
    }
  }

  private async readAllEvents(): Promise<OfflineSyncEvent[]> {
    return this.read<OfflineSyncEvent[]>("events", (store) => store.getAll(), []);
  }

  private async countEvents(): Promise<number> {
    return this.read<number>("events", (store) => store.count(), 0);
  }

  private async readMeta(): Promise<QueueMeta> {
    return this.read<QueueMeta>("meta", (store) => store.get("state"), initialMeta);
  }

  private async read<T>(storeName: "events" | "meta", action: (store: IDBObjectStore) => IDBRequest, fallback: T): Promise<T> {
    const db = await this.open();
    try {
      return await new Promise<T>((resolve, reject) => {
        const request = action(db.transaction(storeName, "readonly").objectStore(storeName));
        request.onsuccess = () => resolve((request.result as T | undefined) ?? fallback);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  }

  private async deleteEvents(eventIds: string[]): Promise<void> {
    const db = await this.open();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction("events", "readwrite");
        const store = transaction.objectStore("events");
        eventIds.forEach((eventId) => store.delete(eventId));
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    } finally {
      db.close();
    }
  }

  private writeMeta(meta: QueueMeta): Promise<void> {
    return this.write("meta", (store) => store.put(meta));
  }
}
