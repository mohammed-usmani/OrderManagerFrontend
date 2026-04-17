/**
 * Browser audio capture and playback utilities.
 */

const INPUT_SAMPLE_RATE = 16000;
const INPUT_CHANNELS = 1;

/**
 * Start capturing audio from the microphone.
 * Returns PCM Int16 chunks via the onAudioChunk callback.
 */
export async function startMicCapture(
  onAudioChunk: (pcm: Uint8Array) => void
): Promise<{ stop: () => void }> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      sampleRate: INPUT_SAMPLE_RATE,
      channelCount: INPUT_CHANNELS,
      echoCancellation: true,
      noiseSuppression: true,
    },
  });

  const audioCtx = new AudioContext({ sampleRate: INPUT_SAMPLE_RATE });
  const source = audioCtx.createMediaStreamSource(stream);

  // ScriptProcessor is deprecated but widely supported and simple.
  // AudioWorklet would be better for production.
  const processor = audioCtx.createScriptProcessor(4096, 1, 1);

  processor.onaudioprocess = (e) => {
    const float32 = e.inputBuffer.getChannelData(0);
    // Convert Float32 -> Int16 PCM
    const int16 = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
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
 */
export function createAudioPlayer(sampleRate: number = 24000) {
  const audioCtx = new AudioContext({ sampleRate });
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
