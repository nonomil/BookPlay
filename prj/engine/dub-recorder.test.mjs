import { test } from 'node:test';
import assert from 'node:assert/strict';
import recorderFactory from './dub-recorder.js';

const ALL_MIMES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

/* 假环境：可控的 getUserMedia + MediaRecorder，验证网关合同与资源释放。 */
function makeEnv({
  supported = true,
  permission = 'granted', // granted | denied | no-device
  supportedMimes = ALL_MIMES,
  chunkSize = 10,
  chunkCount = 2,
} = {}) {
  const released = [];
  const stream = {
    getTracks: () => [
      { stop: () => released.push('t1') },
      { stop: () => released.push('t2') },
    ],
  };
  const state = { lastRecorder: null, getUserCalls: 0 };
  class FakeRecorder {
    constructor(streamArg, opts) {
      this.stream = streamArg;
      this.mimeType = (opts && opts.mimeType) || '';
      this.state = 'inactive';
      this.ondataavailable = null;
      this.onstop = null;
      this.onerror = null;
      state.lastRecorder = this;
    }
    static isTypeSupported(mime) { return supportedMimes.includes(mime); }
    start() { this.state = 'recording'; }
    stop() {
      this.state = 'inactive';
      queueMicrotask(() => {
        for (let i = 0; i < chunkCount; i += 1) {
          if (this.ondataavailable) this.ondataavailable({ data: { size: chunkSize, part: i } });
        }
        if (this.onstop) this.onstop();
      });
    }
  }
  const env = {
    navigator: {
      mediaDevices: {
        getUserMedia() {
          state.getUserCalls += 1;
          if (permission === 'denied') {
            return Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
          }
          if (permission === 'no-device') {
            return Promise.reject(Object.assign(new Error('no device'), { name: 'NotFoundError' }));
          }
          return Promise.resolve(stream);
        },
      },
    },
    MediaRecorder: supported ? FakeRecorder : undefined,
  };
  return { env, released, state, FakeRecorder };
}

test('dub-recorder：能力探测报告麦克风与首选 mime', () => {
  const { env } = makeEnv();
  const recorder = recorderFactory.create({ env });
  assert.deepEqual(recorder.capabilities(), { mic: true, mime: 'audio/webm;codecs=opus' });
});

test('dub-recorder：无 MediaRecorder 时 unsupported，mime 协商回退到 mp4', async () => {
  const none = recorderFactory.create({ env: makeEnv({ supported: false }).env });
  assert.deepEqual(none.capabilities(), { mic: false, mime: '' });
  assert.deepEqual(await none.start(), { ok: false, reason: 'unsupported' });

  const mp4only = recorderFactory.create({ env: makeEnv({ supportedMimes: ['audio/mp4'] }).env });
  assert.equal(mp4only.capabilities().mime, 'audio/mp4');
});

test('dub-recorder：start→stop 得到 Blob 并释放全部 tracks', async () => {
  const fake = makeEnv();
  const recorder = recorderFactory.create({ env: fake.env });
  assert.equal((await recorder.start()).ok, true);
  assert.equal(fake.state.lastRecorder.state, 'recording');
  assert.deepEqual(await recorder.start(), { ok: false, reason: 'busy' });
  const stopped = await recorder.stop();
  assert.equal(stopped.ok, true);
  assert.equal(stopped.mime, 'audio/webm;codecs=opus');
  assert.equal(stopped.blob.size, 20);
  assert.ok(stopped.sec >= 0);
  assert.deepEqual(fake.released, ['t1', 't2']);
  assert.equal(fake.state.lastRecorder.state, 'inactive');
});

test('dub-recorder：stop 未 start 返回 idle；空数据归一为 no-data', async () => {
  const recorder = recorderFactory.create({ env: makeEnv().env });
  assert.deepEqual(await recorder.stop(), { ok: false, reason: 'idle' });

  const empty = recorderFactory.create({ env: makeEnv({ chunkCount: 0 }).env });
  await empty.start();
  const stopped = await empty.stop();
  assert.equal(stopped.ok, false);
  assert.equal(stopped.reason, 'no-data');
});

test('dub-recorder：拒权与无麦克风映射稳定错误类型，且可再次尝试', async () => {
  const denied = recorderFactory.create({ env: makeEnv({ permission: 'denied' }).env });
  assert.deepEqual(await denied.start(), { ok: false, reason: 'not-allowed' });
  assert.equal(denied.snapshot().state, 'idle');

  const noDevice = recorderFactory.create({ env: makeEnv({ permission: 'no-device' }).env });
  assert.deepEqual(await noDevice.start(), { ok: false, reason: 'no-mic' });
});

test('dub-recorder：cancel 丢弃录音并释放 tracks', async () => {
  const fake = makeEnv();
  const recorder = recorderFactory.create({ env: fake.env });
  await recorder.start();
  assert.equal(recorder.cancel().ok, true);
  assert.deepEqual(fake.released, ['t1', 't2']);
  assert.equal(recorder.snapshot().state, 'idle');
  assert.deepEqual(await recorder.stop(), { ok: false, reason: 'idle' });
});
