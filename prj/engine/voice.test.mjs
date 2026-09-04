import { test } from 'node:test';
import assert from 'node:assert/strict';
import voice from './voice.js';

function fakeWebSpeechEnv({ result, error } = {}) {
  class FakeRecognition {
    start() {
      queueMicrotask(() => {
        if (error) {
          this.onerror?.({ error });
          this.onend?.();
          return;
        }
        this.onresult?.({ results: [[{ transcript: result || '' }]] });
        this.onend?.();
      });
    }
    stop() { this.onend?.(); }
    abort() { this.onend?.(); }
  }
  return {
    SpeechRecognition: FakeRecognition,
    navigator: {},
    setTimeout,
    clearTimeout,
  };
}

test('无任何语音能力时返回 unsupported', async () => {
  const port = voice.create({ env: { navigator: {} } });
  assert.deepEqual(port.capabilities(), {
    mic: false,
    asr: false,
    pronunciation: false,
    offline: false,
  });
  const result = await port.listen({ referenceText: 'hello' });
  assert.equal(result.kind, 'unsupported');
  assert.equal(result.accepted, false);
});

test('Web Speech 识别结果进入统一命中合同', async () => {
  const port = voice.create({ env: fakeWebSpeechEnv({ result: 'Hello!' }) });
  const result = await port.listen({ referenceText: 'hello', mode: 'read_word' });
  assert.equal(result.kind, 'match');
  assert.equal(result.accepted, true);
  assert.match(result.transcript, /^hello/);
  assert.equal(result.scores, null);
});

test('Web Speech 权限错误不会抛出，返回 permission-denied', async () => {
  const port = voice.create({ env: fakeWebSpeechEnv({ error: 'not-allowed' }) });
  const result = await port.listen({ referenceText: 'hello' });
  assert.equal(result.kind, 'permission-denied');
  assert.equal(result.accepted, false);
});

test('显式网关优先使用录音并在停止后释放 tracks', async () => {
  const tracks = [{ stopped: 0, stop() { this.stopped += 1; } }];
  let recorder;
  class FakeRecorder {
    static isTypeSupported() { return true; }
    constructor(stream) { this.stream = stream; recorder = this; this.mimeType = 'audio/webm'; }
    start() { queueMicrotask(() => this.ondataavailable?.({ data: new Blob(['audio']) })); }
    stop() { queueMicrotask(() => this.onstop?.()); }
    abort() { this.stop(); }
  }
  const env = {
    navigator: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => tracks }) } },
    MediaRecorder: FakeRecorder,
    fetch: async () => ({ ok: true, json: async () => ({ text: 'monkey' }) }),
    setTimeout,
    clearTimeout,
  };
  const port = voice.create({ env, endpoint: 'http://127.0.0.1:4210/v1/stt' });
  const promise = port.listen({ referenceText: 'monkey' });
  await new Promise((resolve) => setTimeout(resolve, 0));
  recorder.stop();
  const result = await promise;
  assert.equal(result.kind, 'match');
  assert.equal(tracks[0].stopped, 1);
});

test('Web Speech 网络错误会回退到显式网关并返回网关结果', async () => {
  const tracks = [{ stopped: 0, stop() { this.stopped += 1; } }];
  let recorder;
  class FakeRecognition {
    start() { queueMicrotask(() => this.onerror?.({ error: 'network' })); }
    stop() { this.onend?.(); }
  }
  class FakeRecorder {
    static isTypeSupported() { return true; }
    constructor(stream) { this.stream = stream; this.mimeType = 'audio/webm'; recorder = this; }
    start() { queueMicrotask(() => this.ondataavailable?.({ data: new Blob(['audio']) })); }
    stop() { queueMicrotask(() => this.onstop?.()); }
  }
  const env = {
    SpeechRecognition: FakeRecognition,
    navigator: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => tracks }) } },
    MediaRecorder: FakeRecorder,
    fetch: async () => ({ ok: true, json: async () => ({ text: 'monkey' }) }),
    setTimeout,
    clearTimeout,
  };
  const port = voice.create({ env, endpoint: 'http://127.0.0.1:4210/v1/stt' });
  const promise = port.listen({ referenceText: 'monkey' });
  await new Promise((resolve) => setTimeout(resolve, 0));
  recorder.stop();
  const result = await promise;
  assert.equal(result.kind, 'match');
  assert.equal(result.provider, 'gateway-asr');
  assert.equal(tracks[0].stopped, 1);
});
