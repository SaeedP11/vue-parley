import { MediaDownloadOptions, MediaHandlers } from "~/types";
import { defineStore } from "pinia";

const DB_NAME = "ChatFileCache";
// v2 stores { blob, size, usedAt } so the cache can be kept under a size limit.
const DB_VERSION = 2;
const STORE_NAME = "files";
/** Least recently used files are dropped beyond this. */
const MAX_CACHE_BYTES = 200 * 1024 * 1024;

interface CacheEntry {
  blob: Blob;
  size: number;
  usedAt: number;
}

const request = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

// One connection for the page, opened on first use.
let dbPromise: Promise<IDBDatabase> | null = null;
const getDB = () =>
  (dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      // v1 stored bare blobs with no sizes; start over rather than guess.
      if (db.objectStoreNames.contains(STORE_NAME)) db.deleteObjectStore(STORE_NAME);
      db.createObjectStore(STORE_NAME);
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => {
      dbPromise = null;
      reject(open.error);
    };
  }));

/** Deletes least recently used entries until the cache fits in MAX_CACHE_BYTES. */
async function evict(db: IDBDatabase) {
  const store = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME);
  const [keys, entries] = await Promise.all([
    request(store.getAllKeys()),
    request(store.getAll() as IDBRequest<CacheEntry[]>),
  ]);
  let total = entries.reduce((sum, e) => sum + (e?.size ?? 0), 0);
  if (total <= MAX_CACHE_BYTES) return;

  const byAge = keys
    .map((key, i) => ({ key, entry: entries[i]! }))
    .sort((a, b) => a.entry.usedAt - b.entry.usedAt);
  for (const { key, entry } of byAge) {
    if (total <= MAX_CACHE_BYTES) break;
    store.delete(key);
    total -= entry.size;
  }
}

export const useMediaStore = defineStore("media", () => {
  let handlers: MediaHandlers;

  function setHandlers(val: MediaHandlers) {
    handlers = val;
  }

  const getCachedBlob = async (url: string): Promise<Blob | null> => {
    try {
      const db = await getDB();
      const store = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME);
      const entry = (await request(store.get(url))) as CacheEntry | undefined;
      if (!entry) return null;
      // Mark as recently used, so eviction keeps it.
      store.put({ ...entry, usedAt: Date.now() }, url);
      return entry.blob;
    } catch {
      return null;
    }
  };

  const putCachedBlob = async (url: string, blob: Blob): Promise<void> => {
    try {
      const db = await getDB();
      const entry: CacheEntry = { blob, size: blob.size, usedAt: Date.now() };
      await request(
        db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(entry, url),
      );
      await evict(db);
    } catch {
      // cache is best-effort; ignore write failures
    }
  };

  const fetchFileSize = (url: string): Promise<number | null> =>
    handlers.getFileSize(url);

  const download = async (
    url: string,
    opts?: MediaDownloadOptions,
  ): Promise<Blob> => {
    const cached = await getCachedBlob(url);
    if (cached) {
      opts?.onProgress?.(100);
      return cached;
    }
    const blob = await handlers.download(url, opts);
    await putCachedBlob(url, blob);
    return blob;
  };

  return {
    setHandlers,
    fetchFileSize,
    getCachedBlob,
    download,
  };
});
