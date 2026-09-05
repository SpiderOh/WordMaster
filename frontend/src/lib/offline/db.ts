// IndexedDB 底层封装：离线队列与同步游标都存放在 wordmaster-offline 库
const DB_NAME = 'wordmaster-offline';
const DB_VERSION = 1;
export const OUTBOX_STORE = 'outbox';
export const META_STORE = 'meta';

let openPromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (openPromise === null) {
    openPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB 不可用'));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(OUTBOX_STORE)) {
          database.createObjectStore(OUTBOX_STORE, { keyPath: 'id' });
        }
        if (!database.objectStoreNames.contains(META_STORE)) {
          database.createObjectStore(META_STORE, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('打开 IndexedDB 失败'));
    });
  }
  return openPromise;
}

function runTransaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  executor: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return openDatabase().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
        const request = executor(store);
        transaction.oncomplete = () => {
          resolve(request ? (request.result as T) : (undefined as T));
        };
        transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB 事务失败'));
        transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB 事务中止'));
      }),
  );
}

export async function outboxPut(item: unknown): Promise<void> {
  await runTransaction<void>(OUTBOX_STORE, 'readwrite', (store) => store.put(item as IDBValidatedObject));
}

export async function outboxAll<T>(): Promise<T[]> {
  return runTransaction<T[]>(OUTBOX_STORE, 'readonly', (store) => store.getAll());
}

export async function outboxDelete(id: string): Promise<void> {
  await runTransaction<void>(OUTBOX_STORE, 'readwrite', (store) => store.delete(id));
}

export async function outboxClear(): Promise<void> {
  await runTransaction<void>(OUTBOX_STORE, 'readwrite', (store) => store.clear());
}

export async function metaGet<T>(key: string): Promise<T | null> {
  const record = await runTransaction<{ key: string; value: T } | undefined>(META_STORE, 'readonly', (store) => store.get(key));
  return record ? record.value : null;
}

export async function metaSet<T>(key: string, value: T): Promise<void> {
  await runTransaction<void>(META_STORE, 'readwrite', (store) => store.put({ key, value }));
}

// IDBObjectStore.put 参数类型别名，避免 any
type IDBValidatedObject = Parameters<IDBObjectStore['put']>[0];
