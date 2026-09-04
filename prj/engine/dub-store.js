"use strict";

/* 趣配音录音 Blob 存储：IndexedDB 优先，缺失/打不开时回退内存会话（本次有效）。
 * 录音只保存在孩子设备本地，不联网、不写文件系统。 */
(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.WalaDubStore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function dubStoreFactory() {
  const DB_NAME = "bookplay_dub_audio_v1";
  const STORE = "clips";

  function memoryStore() {
    const records = new Map();
    return {
      available: true,
      memoryOnly: true,
      async putClip(key, blob, meta) {
        records.set(key, { key, blob, meta: meta || {}, createdAt: 0 });
        return { ok: true };
      },
      async getClip(key) {
        return records.has(key) ? records.get(key) : null;
      },
      async deleteClip() {
        return { ok: true };
      },
      async listKeys(ep) {
        const prefix = `ep${Number(ep)}:`;
        return Array.from(records.keys()).filter((key) => String(key).startsWith(prefix));
      },
      async estimateCount() {
        return records.size;
      },
    };
  }

  function create(options) {
    const opts = options || {};
    const idbFactory = opts.indexedDB;
    if (!idbFactory || typeof idbFactory.open !== "function") return memoryStore();

    let dbPromise = null;
    function openDb() {
      if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
          let request;
          try {
            request = idbFactory.open(DB_NAME, 1);
          } catch (err) {
            reject(err);
            return;
          }
          request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames || !db.objectStoreNames.contains(STORE)) {
              db.createObjectStore(STORE, { keyPath: "key" });
            }
          };
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error || new Error("idb-open-failed"));
          request.onblocked = () => reject(new Error("idb-blocked"));
        });
        dbPromise.catch(() => { dbPromise = null; });
      }
      return dbPromise;
    }

    function txDone(tx) {
      return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error("tx-failed"));
        tx.onabort = () => reject(tx.error || new Error("tx-aborted"));
      });
    }

    function requestDone(request) {
      return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("request-failed"));
      });
    }

    function reasonOf(err) {
      const name = String((err && err.name) || "");
      const message = String((err && err.message) || "");
      if (/quota/i.test(name) || /quota/i.test(message)) return "quota";
      return "error";
    }

    return {
      available: true,
      memoryOnly: false,
      async putClip(key, blob, meta) {
        try {
          const db = await openDb();
          const tx = db.transaction(STORE, "readwrite");
          tx.objectStore(STORE).put({ key: String(key), blob, meta: meta || {}, createdAt: Date.now() });
          await txDone(tx);
          return { ok: true };
        } catch (err) {
          return { ok: false, reason: reasonOf(err) };
        }
      },
      async getClip(key) {
        try {
          const db = await openDb();
          const tx = db.transaction(STORE, "readonly");
          const done = txDone(tx);
          const record = await requestDone(tx.objectStore(STORE).get(String(key)));
          await done.catch(() => {});
          return record || null;
        } catch (_) {
          return null;
        }
      },
      async deleteClip(key) {
        try {
          const db = await openDb();
          const tx = db.transaction(STORE, "readwrite");
          tx.objectStore(STORE).delete(String(key));
          await txDone(tx);
          return { ok: true };
        } catch (err) {
          return { ok: false, reason: reasonOf(err) };
        }
      },
      async listKeys(ep) {
        try {
          const db = await openDb();
          const tx = db.transaction(STORE, "readonly");
          const done = txDone(tx);
          const keys = await requestDone(tx.objectStore(STORE).getAllKeys());
          await done.catch(() => {});
          const prefix = `ep${Number(ep)}:`;
          return (keys || []).map(String).filter((key) => key.startsWith(prefix));
        } catch (_) {
          return [];
        }
      },
      async estimateCount() {
        try {
          const db = await openDb();
          const tx = db.transaction(STORE, "readonly");
          const done = txDone(tx);
          const count = await requestDone(tx.objectStore(STORE).count());
          await done.catch(() => {});
          return Number(count) || 0;
        } catch (_) {
          return 0;
        }
      },
    };
  }

  return { create, DB_NAME, STORE };
});
