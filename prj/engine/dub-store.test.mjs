import { test } from 'node:test';
import assert from 'node:assert/strict';
import storeFactory from './dub-store.js';

/* 最小假 IndexedDB：模拟真实事件模型（request.onsuccess / tx.oncomplete / 异步 quota 错误）。 */
function makeFakeIdb({ failQuota = false } = {}) {
  const records = new Map();
  function req(result) {
    const request = { result, error: null, onsuccess: null, onerror: null };
    queueMicrotask(() => { if (request.onsuccess) request.onsuccess({ target: request }); });
    return request;
  }
  return {
    records,
    open(_name, _version) {
      const openReq = { onupgradeneeded: null, onerror: null, onsuccess: null, result: null, error: null };
      queueMicrotask(() => {
        openReq.result = {
          transaction(_stores, _mode) {
            const store = {
              put(record) {
                if (!failQuota) records.set(record.key, record);
                return req(record.key);
              },
              get: (key) => req(records.get(key) ?? null),
              delete: (key) => { records.delete(key); return req(key); },
              getAllKeys: () => req(Array.from(records.keys())),
              count: () => req(records.size),
            };
            const tx = {
              error: null,
              oncomplete: null,
              onerror: null,
              onabort: null,
              objectStore: () => store,
            };
            queueMicrotask(() => {
              if (failQuota) {
                tx.error = new Error('quota exceeded');
                tx.error.name = 'QuotaExceededError';
                if (tx.onerror) tx.onerror({ target: tx });
                if (tx.onabort) tx.onabort({ target: tx });
              } else if (tx.oncomplete) {
                tx.oncomplete();
              }
            });
            return tx;
          },
        };
        if (openReq.onsuccess) openReq.onsuccess({ target: openReq });
      });
      return openReq;
    },
  };
}

test('dub-store：IndexedDB 可用时写入并读回', async () => {
  const store = storeFactory.create({ indexedDB: makeFakeIdb() });
  assert.equal(store.memoryOnly, false);
  assert.equal(store.available, true);
  const put = await store.putClip('ep1:n001', { kind: 'blob', size: 3 }, { stars: 2, durSec: 3 });
  assert.deepEqual(put, { ok: true });
  const got = await store.getClip('ep1:n001');
  assert.equal(got.key, 'ep1:n001');
  assert.equal(got.blob.size, 3);
  assert.equal(got.meta.stars, 2);
  assert.equal(await store.getClip('ep1:n404'), null);
  assert.deepEqual(await store.listKeys(1), ['ep1:n001']);
  assert.deepEqual(await store.listKeys(2), []);
  assert.equal(await store.estimateCount(), 1);
  assert.equal((await store.estimateCount()).valueOf(), 1);
});

test('dub-store：配额错误归一为 quota，不抛异常', async () => {
  const store = storeFactory.create({ indexedDB: makeFakeIdb({ failQuota: true }) });
  const put = await store.putClip('ep1:n001', {}, {});
  assert.deepEqual(put, { ok: false, reason: 'quota' });
});

test('dub-store：无 IndexedDB 时回退内存会话', async () => {
  const store = storeFactory.create({ indexedDB: null });
  assert.equal(store.memoryOnly, true);
  assert.equal(store.available, true);
  assert.equal((await store.putClip('ep2:n001', { size: 1 }, {})).ok, true);
  assert.equal((await store.getClip('ep2:n001')).blob.size, 1);
  assert.deepEqual(await store.listKeys(2), ['ep2:n001']);
  assert.deepEqual(await store.listKeys(3), []);
});

test('dub-store：删除与重复键覆盖', async () => {
  const store = storeFactory.create({ indexedDB: makeFakeIdb() });
  await store.putClip('ep1:n001', { v: 1 }, {});
  await store.putClip('ep1:n001', { v: 2 }, {});
  assert.equal((await store.getClip('ep1:n001')).blob.v, 2);
  assert.deepEqual(await store.deleteClip('ep1:n001'), { ok: true });
  assert.equal(await store.getClip('ep1:n001'), null);
  assert.deepEqual(await store.deleteClip('ep1:n404'), { ok: true });
  assert.deepEqual(await store.deleteClip('ep9:n001'), { ok: true });
});
