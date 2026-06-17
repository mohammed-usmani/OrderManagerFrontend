/**
 * Browser audio capture and playback utilities.
 *
 * Cross-browser notes:
 * - We do NOT force the AudioContext sample rate. Firefox handles forced-rate
 *   contexts poorly (wrong-rate audio + disabled echo cancellation). We run at
 *   the device's native rate and resample in JS: mic → 16 kHz, and play 24 kHz
 *   buffers that the Web Audio API resamples to the output context.
 * - The AudioContext is created+resumed by the CALLER inside the user's tap
 *   gesture (iOS/Safari only unlock audio that way), then passed in here. So
 *   both capture and playback share one already-unlocked context.
 */

const TARGET_INPUT_RATE = 16000; // Gemini Live expects 16 kHz mono PCM in
const OUTPUT_RATE = 24000; // Gemini Live emits 24 kHz mono PCM out

/** Linear-interpolation resample of mono Float32 audio to 16 kHz. */
function resampleTo16k(input: Float32Array, inputRate: number): Float32Array {
  if (inputRate === TARGET_INPUT_RATE) return input;
  const ratio = inputRate / TARGET_INPUT_RATE;
  const outLength = Math.max(1, Math.round(input.length / ratio));
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = pos - i0;
    out[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return out;
}

/**
 * Wire an ALREADY-OBTAINED mic MediaStream into the (already resumed)
 * AudioContext and emit 16 kHz PCM Int16 chunks via onAudioChunk. The caller
 * acquires the stream via getUserMedia up-front (in the user's tap) so the
 * permission prompt shows immediately and denials are handled before we connect.
 * `stop()` tears down the graph and stops the stream's tracks.
 */
export async function startMicCapture(
  onAudioChunk: (pcm: Uint8Array) => void,
  audioCtx: AudioContext,
  stream: MediaStream
): Promise<{ stop: () => void }> {
  if (audioCtx.state === "suspended") {
    try {
      await audioCtx.resume();
    } catch {
      /* best effort */
    }
  }

  const inputRate = audioCtx.sampleRate;
  const source = audioCtx.createMediaStreamSource(stream);
  const processor = audioCtx.createScriptProcessor(4096, 1, 1);

  processor.onaudioprocess = (e) => {
    const float32 = e.inputBuffer.getChannelData(0);
    const ds = resampleTo16k(float32, inputRate);
    const int16 = new Int16Array(ds.length);
    for (let i = 0; i < ds.length; i++) {
      const s = Math.max(-1, Math.min(1, ds[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    onAudioChunk(new Uint8Array(int16.buffer));
  };

  source.connect(processor);
  processor.connect(audioCtx.destination);

  // Caller owns the AudioContext lifecycle (it's shared with playback).
  return {
    stop: () => {
      processor.disconnect();
      source.disconnect();
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}

/**
 * Creates an audio player on the provided (already resumed) AudioContext.
 * Buffers created at the source rate (24 kHz) are resampled by the Web Audio
 * API on playback. The caller owns the context's lifecycle.
 */
export function createAudioPlayer(
  audioCtx: AudioContext,
  sampleRate: number = OUTPUT_RATE
) {
  let nextStartTime = 0;

  function play(pcmInt16: Uint8Array, numChannels: number = 1) {
    try {
    // Mobile contexts can drift back to "suspended"; nudge it before playing.
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});

    // Guard against malformed frames that report 0 channels.
    const safeChannels = Math.max(1, numChannels);

    const int16 = new Int16Array(
      pcmInt16.buffer,
      pcmInt16.byteOffset,
      pcmInt16.byteLength / 2
    );
    const numSamples = int16.length / safeChannels;
    const buffer = audioCtx.createBuffer(safeChannels, numSamples, sampleRate);

    for (let ch = 0; ch < safeChannels; ch++) {
      const channelData = buffer.getChannelData(ch);
      for (let i = 0; i < numSamples; i++) {
        channelData[i] = int16[i * safeChannels + ch] / 32768;
      }
    }

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);

    const now = audioCtx.currentTime;
    const startTime = Math.max(now, nextStartTime);
    source.start(startTime);
    nextStartTime = startTime + buffer.duration;
    } catch (err) {
      console.warn("[audio] dropped malformed audio frame:", err);
    }
  }

  function stop() {
    nextStartTime = 0; // caller closes the shared AudioContext
  }

  function interrupt() {
    nextStartTime = 0;
  }

  /** Seconds of audio still queued to play. 0 means player is idle. */
  function timeRemaining(): number {
    return Math.max(0, nextStartTime - audioCtx.currentTime);
  }

  return { play, stop, interrupt, timeRemaining };
}
