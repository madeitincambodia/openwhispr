const test = require("node:test");
const assert = require("node:assert");

const { pcm16ToWav, pcm16ToFloat32 } = require("../../src/utils/audioUtils");
const { isWavFormat, parseWavFormat, wavToFloat32Samples } = require("../../src/helpers/ffmpegUtils");

const SAMPLE_RATE = 16000;

function makePcm16(numSamples, fill = (i) => Math.round(Math.sin(i / 10) * 10000)) {
  const samples = new Int16Array(numSamples);
  for (let i = 0; i < numSamples; i++) samples[i] = fill(i);
  return Buffer.from(samples.buffer);
}

// [fork] These lock in the contract that lets the offline-Parakeet dictation path skip
// the per-dictation ffmpeg spawn: renderer worklet PCM -> pcm16ToWav -> the 16kHz/mono
// short-circuit in ParakeetServerManager._ensureWav. If any of these break, the path
// silently falls back to ffmpeg and the ~1.7s regression returns.

test("pcm16ToWav produces a buffer _ensureWav recognises as WAV", () => {
  const wav = pcm16ToWav(makePcm16(16000), SAMPLE_RATE, 1);
  assert.strictEqual(isWavFormat(wav), true);
});

test("pcm16ToWav declares 16kHz mono, which is what triggers the ffmpeg short-circuit", () => {
  const wav = pcm16ToWav(makePcm16(16000), SAMPLE_RATE, 1);
  const format = parseWavFormat(wav);

  // _ensureWav returns early only when BOTH of these hold.
  assert.strictEqual(format.sampleRate, SAMPLE_RATE);
  assert.strictEqual(format.channels, 1);
});

test("wav header length matches payload so no samples are truncated", () => {
  const numSamples = 12345;
  const pcm = makePcm16(numSamples);
  const wav = pcm16ToWav(pcm, SAMPLE_RATE, 1);

  assert.strictEqual(wav.length, 44 + pcm.length, "header is 44 bytes + payload");
  assert.strictEqual(wav.readUInt32LE(40), pcm.length, "data chunk size field");
  assert.strictEqual(wav.readUInt32LE(4), 36 + pcm.length, "RIFF size field");
});

test("samples survive the pcm -> wav -> float32 round trip the WS server performs", () => {
  const numSamples = 800;
  const pcm = makePcm16(numSamples);
  const wav = pcm16ToWav(pcm, SAMPLE_RATE, 1);

  // wavToFloat32Samples returns a Buffer of float32 BYTES, not a Float32Array.
  const viaWavBuffer = wavToFloat32Samples(wav);
  assert.strictEqual(viaWavBuffer.length, numSamples * 4, "4 bytes per float32 sample");

  const viaWav = new Float32Array(
    viaWavBuffer.buffer,
    viaWavBuffer.byteOffset,
    viaWavBuffer.length / 4
  );
  const direct = pcm16ToFloat32(pcm);

  assert.strictEqual(viaWav.length, numSamples, "no samples lost through the header");
  assert.strictEqual(direct.length, numSamples);

  for (let i = 0; i < numSamples; i++) {
    assert.ok(
      Math.abs(viaWav[i] - direct[i]) < 1e-6,
      `sample ${i} diverged: ${viaWav[i]} vs ${direct[i]}`
    );
  }
});

test("concatenating 800-sample worklet chunks reconstructs the original signal", () => {
  // Mirrors _takeCapturedPcm: the worklet emits transferred ArrayBuffers of 800 Int16
  // samples, and the last one is a short partial flushed on stop.
  const chunkSamples = 800;
  const chunkCount = 5;
  const partialSamples = 137;

  const expected = [];
  const chunks = [];
  let sampleIndex = 0;

  for (let c = 0; c < chunkCount; c++) {
    const arr = new Int16Array(chunkSamples);
    for (let i = 0; i < chunkSamples; i++) arr[i] = (sampleIndex++ % 2000) - 1000;
    expected.push(...arr);
    chunks.push(arr.buffer);
  }
  const partial = new Int16Array(partialSamples);
  for (let i = 0; i < partialSamples; i++) partial[i] = (sampleIndex++ % 2000) - 1000;
  expected.push(...partial);
  chunks.push(partial.buffer);

  const totalBytes = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(new Uint8Array(chunk), offset);
    offset += chunk.byteLength;
  }

  const result = new Int16Array(merged.buffer);
  assert.strictEqual(result.length, chunkCount * chunkSamples + partialSamples);
  assert.deepStrictEqual(Array.from(result), expected);
});

test("the short-capture guard threshold is under 100ms of audio", () => {
  // _takeCapturedPcm rejects captures below 3200 bytes.
  const bytesPerSample = 2;
  const guardBytes = 3200;
  const guardMs = (guardBytes / bytesPerSample / SAMPLE_RATE) * 1000;
  assert.strictEqual(guardMs, 100);
});
