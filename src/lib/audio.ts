/**
 * Browser audio capture and playback utilities.
 *
 * Cross-browser note: we do NOT force the AudioContext sample rate. Chrome
 * tolerates a forced rate, but Firefox handles forced-rate contexts poorly —
 * it can emit wrong-rate audio (garbling what the agent "hears") and can
 * disable echo cancellation, which causes the agent to hear its own voice and
 * loop. Instead we run each AudioContext at the device's native rate and
 * resample in JS: mic → 16 kHz before sending, and play 24 kHz buffers that the
 * Web Audio API resamples to the output context automatically.
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
 * Start capturing audio from the microphone.
 * Returns 16 kHz PCM Int16 chunks via the onAudioChunk callback.
 */
export async function startMicCapture(
  onAudioChunk: (pcm: Uint8Array) => void
): Promise<{ stop: () => void }> {
  // Echo cancellation + noise suppression + auto gain are essential: without
  // them the mic picks up the agent's own voice from the speakers and the
  // conversation feeds back on itself. Let the browser pick the native rate.
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  const audioCtx = new AudioContext();
  const inputRate = audioCtx.sampleRate;
  const source = audioCtx.createMediaStreamSource(stream);

  // ScriptProcessor is deprecated but widely supported and simple.
  // AudioWorklet would be better for production.
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

  return {
    stop: () => {
      processor.disconnect();
      source.disconnect();
      audioCtx.close();
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}

/**
 * Creates an audio player that queues and plays PCM Int16 audio chunks.
 * The context runs at the device's native rate; buffers created at the source
 * rate (24 kHz) are resampled by the Web Audio API on playback.
 */
export function createAudioPlayer(sampleRate: number = OUTPUT_RATE) {
  const audioCtx = new AudioContext();
  let nextStartTime = 0;

  function play(pcmInt16: Uint8Array, numChannels: number = 1) {
    const int16 = new Int16Array(
      pcmInt16.buffer,
      pcmInt16.byteOffset,
      pcmInt16.byteLength / 2
    );
    const numSamples = int16.length / numChannels;
    const buffer = audioCtx.createBuffer(numChannels, numSamples, sampleRate);

    for (let ch = 0; ch < numChannels; ch++) {
      const channelData = buffer.getChannelData(ch);
      for (let i = 0; i < numSamples; i++) {
        channelData[i] = int16[i * numChannels + ch] / 32768;
      }
    }

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);

    const now = audioCtx.currentTime;
    const startTime = Math.max(now, nextStartTime);
    source.start(startTime);
    nextStartTime = startTime + buffer.duration;
  }

  function stop() {
    nextStartTime = 0;
    audioCtx.close();
  }

  function interrupt() {
    // Reset the queue so next audio plays immediately
    nextStartTime = 0;
  }

  /** Seconds of audio still queued to play. 0 means player is idle. */
  function timeRemaining(): number {
    return Math.max(0, nextStartTime - audioCtx.currentTime);
  }

  return { play, stop, interrupt, timeRemaining };
}
