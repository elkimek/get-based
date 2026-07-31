// @ts-check
// voice-audio.js — browser audio decoding, mono conversion, resampling, and WAV encoding.

export function mixAudioChannels(audioBuffer) {
  const channels = Math.max(1, Number(audioBuffer.numberOfChannels) || 1);
  const length = Number(audioBuffer.length) || 0;
  const mono = new Float32Array(length);
  for (let channel = 0; channel < channels; channel += 1) {
    const data = audioBuffer.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      mono[index] += (data[index] || 0) / channels;
    }
  }
  return mono;
}

export function resampleAudio(samples, sourceRate, targetRate = 16_000) {
  const input = samples instanceof Float32Array ? samples : new Float32Array(samples || []);
  const from = Number(sourceRate) || targetRate;
  const to = Number(targetRate) || 16_000;
  if (!input.length || from === to) return input.slice();
  const outputLength = Math.max(1, Math.round(input.length * to / from));
  const output = new Float32Array(outputLength);
  const ratio = from / to;
  for (let index = 0; index < outputLength; index += 1) {
    const position = index * ratio;
    const left = Math.floor(position);
    const right = Math.min(input.length - 1, left + 1);
    const fraction = position - left;
    output[index] = input[left] + (input[right] - input[left]) * fraction;
  }
  return output;
}

export async function decodeAudioBlob(blob, targetRate = 16_000) {
  const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContextClass) throw new Error('Audio decoding is not supported in this browser.');
  const context = new AudioContextClass();
  try {
    const bytes = await blob.arrayBuffer();
    const decoded = await context.decodeAudioData(bytes.slice(0));
    return resampleAudio(mixAudioChannels(decoded), decoded.sampleRate, targetRate);
  } finally {
    await context.close().catch(() => {});
  }
}

function writeAscii(view, offset, value) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

export function encodeWav(samples, sampleRate = 24_000) {
  const audio = samples instanceof Float32Array ? samples : new Float32Array(samples || []);
  const buffer = new ArrayBuffer(44 + audio.length * 2);
  const view = new DataView(buffer);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + audio.length * 2, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, audio.length * 2, true);
  for (let index = 0; index < audio.length; index += 1) {
    const value = Math.max(-1, Math.min(1, audio[index]));
    view.setInt16(44 + index * 2, value < 0 ? value * 0x8000 : value * 0x7fff, true);
  }
  return buffer;
}

export function audioSamplesToWavBlob(samples, sampleRate) {
  return new Blob([encodeWav(samples, sampleRate)], { type: 'audio/wav' });
}
