/**
 * Pipecat protobuf frame encoding/decoding.
 *
 * Matches the schema in pipecat/frames/frames.proto.
 * We hand-roll the encoding/decoding to avoid heavy protobuf deps in the browser.
 */

// --- Protobuf wire helpers (varint + length-delimited) ---

function encodeVarint(value: number): Uint8Array {
  const bytes: number[] = [];
  while (value > 0x7f) {
    bytes.push((value & 0x7f) | 0x80);
    value >>>= 7;
  }
  bytes.push(value & 0x7f);
  return new Uint8Array(bytes);
}

function encodeTag(fieldNumber: number, wireType: number): Uint8Array {
  return encodeVarint((fieldNumber << 3) | wireType);
}

function encodeLengthDelimited(
  fieldNumber: number,
  data: Uint8Array
): Uint8Array {
  const tag = encodeTag(fieldNumber, 2); // wire type 2 = length-delimited
  const len = encodeVarint(data.length);
  const result = new Uint8Array(tag.length + len.length + data.length);
  result.set(tag, 0);
  result.set(len, tag.length);
  result.set(data, tag.length + len.length);
  return result;
}

function encodeVarintField(fieldNumber: number, value: number): Uint8Array {
  const tag = encodeTag(fieldNumber, 0); // wire type 0 = varint
  const val = encodeVarint(value);
  const result = new Uint8Array(tag.length + val.length);
  result.set(tag, 0);
  result.set(val, tag.length);
  return result;
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

function encodeString(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

// --- Encode a text frame for sending to Pipecat ---

export function encodeTextFrame(text: string): Uint8Array {
  // TextFrame: text=3(string)
  const textInner = encodeLengthDelimited(3, encodeString(text));
  // Frame: text=1 (TextFrame)
  return encodeLengthDelimited(1, textInner);
}

// --- Encode an audio frame for sending to Pipecat ---

export function encodeAudioFrame(
  pcmBytes: Uint8Array,
  sampleRate: number,
  numChannels: number
): Uint8Array {
  // AudioRawFrame: audio=3(bytes), sample_rate=4(uint32), num_channels=5(uint32)
  const audioInner = concat(
    encodeLengthDelimited(3, pcmBytes),
    encodeVarintField(4, sampleRate),
    encodeVarintField(5, numChannels)
  );

  // Frame: audio=2 (AudioRawFrame)
  return encodeLengthDelimited(2, audioInner);
}

// --- Decode a frame received from Pipecat ---

export type DecodedFrame =
  | { type: "audio"; audio: Uint8Array; sampleRate: number; numChannels: number }
  | { type: "text"; text: string }
  | { type: "transcription"; text: string; userId: string }
  | { type: "message"; data: unknown }
  | { type: "unknown" };

function decodeVarint(
  data: Uint8Array,
  offset: number
): [number, number] {
  let result = 0;
  let shift = 0;
  let pos = offset;
  while (pos < data.length) {
    const byte = data[pos];
    // Use multiplication instead of bit-shift so the accumulation stays
    // unsigned and doesn't sign-flip when shift >= 28 (the 5th byte).
    result += (byte & 0x7f) * Math.pow(2, shift);
    pos++;
    if ((byte & 0x80) === 0) break;
    shift += 7;
    if (shift > 35) break; // guard against malformed/overlong varints
  }
  return [result, pos];
}

function decodeField(
  data: Uint8Array,
  offset: number
): { fieldNumber: number; wireType: number; value: Uint8Array | number; nextOffset: number } | null {
  if (offset >= data.length) return null;

  const [tag, tagEnd] = decodeVarint(data, offset);
  const wireType = tag & 0x07;
  const fieldNumber = tag >>> 3;

  if (wireType === 0) {
    // Varint
    const [value, nextOffset] = decodeVarint(data, tagEnd);
    return { fieldNumber, wireType, value, nextOffset };
  } else if (wireType === 2) {
    // Length-delimited
    const [length, lenEnd] = decodeVarint(data, tagEnd);
    const value = data.slice(lenEnd, lenEnd + length);
    return { fieldNumber, wireType, value, nextOffset: lenEnd + length };
  } else if (wireType === 1) {
    // 64-bit fixed — skip 8 bytes and return a sentinel so callers continue.
    return { fieldNumber, wireType, value: 0, nextOffset: tagEnd + 8 };
  } else if (wireType === 5) {
    // 32-bit fixed — skip 4 bytes and return a sentinel so callers continue.
    return { fieldNumber, wireType, value: 0, nextOffset: tagEnd + 4 };
  }

  // Truly unknown wire type — cannot determine length; abort frame parse.
  return null;
}

function decodeString(data: Uint8Array): string {
  return new TextDecoder().decode(data);
}

export function decodeFrame(data: Uint8Array): DecodedFrame {
  // Outer Frame: oneof { text=1, audio=2, transcription=3, message=4 }
  const field = decodeField(data, 0);
  if (!field || typeof field.value === "number") return { type: "unknown" };

  const innerData = field.value as Uint8Array;

  if (field.fieldNumber === 2) {
    // AudioRawFrame
    let audio: Uint8Array<ArrayBuffer> = new Uint8Array(0);
    let sampleRate = 0;
    let numChannels = 1;
    let offset = 0;
    while (offset < innerData.length) {
      const f = decodeField(innerData, offset);
      if (!f) break;
      if (f.fieldNumber === 3 && f.value instanceof Uint8Array) audio = new Uint8Array(f.value);
      if (f.fieldNumber === 4 && typeof f.value === "number") sampleRate = f.value;
      if (f.fieldNumber === 5 && typeof f.value === "number") numChannels = f.value;
      offset = f.nextOffset;
    }
    return { type: "audio", audio, sampleRate, numChannels };
  }

  if (field.fieldNumber === 1) {
    // TextFrame
    let text = "";
    let offset = 0;
    while (offset < innerData.length) {
      const f = decodeField(innerData, offset);
      if (!f) break;
      if (f.fieldNumber === 3 && f.value instanceof Uint8Array) text = decodeString(new Uint8Array(f.value));
      offset = f.nextOffset;
    }
    return { type: "text", text };
  }

  if (field.fieldNumber === 3) {
    // TranscriptionFrame
    let text = "";
    let userId = "";
    let offset = 0;
    while (offset < innerData.length) {
      const f = decodeField(innerData, offset);
      if (!f) break;
      if (f.fieldNumber === 3 && f.value instanceof Uint8Array) text = decodeString(new Uint8Array(f.value));
      if (f.fieldNumber === 4 && f.value instanceof Uint8Array) userId = decodeString(new Uint8Array(f.value));
      offset = f.nextOffset;
    }
    return { type: "transcription", text, userId };
  }

  if (field.fieldNumber === 4) {
    // MessageFrame { string data = 1 } — used by Pipecat to transport JSON payloads.
    let raw = "";
    let offset = 0;
    while (offset < innerData.length) {
      const f = decodeField(innerData, offset);
      if (!f) break;
      if (f.fieldNumber === 1 && f.value instanceof Uint8Array) raw = decodeString(new Uint8Array(f.value));
      offset = f.nextOffset;
    }
    try {
      return { type: "message", data: JSON.parse(raw) };
    } catch {
      return { type: "message", data: raw };
    }
  }

  return { type: "unknown" };
}
