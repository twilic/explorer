import type {
  AnnotationResult,
  ByteSegment,
  InternTableEntry,
  PipelineStageId,
  SegmentKind,
  ShapeTableEntry,
} from './pipelineTypes.js';

const TAG_NULL = 0xc0;
const TAG_BOOL_FALSE = 0xc1;
const TAG_BOOL_TRUE = 0xc2;
const TAG_F64 = 0xc3;
const TAG_U8 = 0xc4;
const TAG_U16 = 0xc5;
const TAG_U32 = 0xc6;
const TAG_U64 = 0xc7;
const TAG_I8 = 0xc8;
const TAG_I16 = 0xc9;
const TAG_I32 = 0xca;
const TAG_I64 = 0xcb;
const TAG_BIN8 = 0xcc;
const TAG_BIN16 = 0xcd;
const TAG_BIN32 = 0xce;
const TAG_STR8 = 0xcf;
const TAG_STR16 = 0xd0;
const TAG_STR32 = 0xd1;
const TAG_ARRAY16 = 0xd2;
const TAG_ARRAY32 = 0xd3;
const TAG_MAP16 = 0xd4;
const TAG_MAP32 = 0xd5;
const TAG_SHAPE_DEF = 0xd6;
const TAG_SHAPE_REF = 0xd7;
const TAG_KEY_REF = 0xd8;
const TAG_STR_REF = 0xd9;
const TAG_TYPED_VEC = 0xda;
const TAG_ROW_BATCH = 0xdb;
const TAG_COL_BATCH = 0xdc;

const ENVELOPE_KINDS: Record<number, string> = {
  0x04: 'SCHEMA_OBJECT',
  0x06: 'ROW_BATCH',
  0x07: 'COLUMN_BATCH',
  0x0e: 'SCHEMA_BATCH',
  0x0f: 'BOUND_STREAM',
};

const textDecoder = new TextDecoder();

class AnnotatingReader {
  readonly bytes: Uint8Array;
  offset = 0;
  readonly segments: ByteSegment[] = [];
  readonly keyTable: InternTableEntry[] = [];
  readonly stringTable: InternTableEntry[] = [];
  readonly shapeTable: ShapeTableEntry[] = [];
  messageKind = 'DYNAMIC';
  parseError: string | null = null;

  private keyByValue = new Map<string, number>();
  private stringByValue = new Map<string, number>();

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  annotate(): AnnotationResult {
    if (this.bytes.byteLength === 0) {
      this.parseError = 'Empty payload';
      return this.finish();
    }

    const envelope = ENVELOPE_KINDS[this.bytes[0] ?? -1];
    if (envelope) {
      this.messageKind = envelope;
      this.pushSegment(0, this.bytes.byteLength, envelopeKind(envelope), envelope, 'profile', {
        envelope,
      });
      return this.finish();
    }

    const start = this.offset;
    const ok = this.readValue('binary');
    if (!ok) {
      if (!this.parseError) {
        this.parseError = 'Failed to parse Dynamic payload';
      }
    } else if (this.offset < this.bytes.byteLength) {
      this.pushSegment(this.offset, this.bytes.byteLength, 'unknown', 'trailing bytes');
    } else if (this.segments.length === 0) {
      this.pushSegment(start, this.bytes.byteLength, 'unknown', 'payload');
    }

    return this.finish();
  }

  private finish(): AnnotationResult {
    return {
      segments: this.segments,
      keyTable: this.keyTable,
      stringTable: this.stringTable,
      shapeTable: this.shapeTable,
      messageKind: this.messageKind,
      parseError: this.parseError,
    };
  }

  private pushSegment(
    start: number,
    end: number,
    kind: SegmentKind,
    label: string,
    stageId?: PipelineStageId,
    meta?: Record<string, unknown>,
  ): void {
    if (end <= start) {
      return;
    }
    this.segments.push({ start, end, kind, label, stageId, meta });
  }

  private readByte(): number | null {
    if (this.offset >= this.bytes.byteLength) {
      return null;
    }
    const byte = this.bytes[this.offset] ?? 0;
    this.offset += 1;
    return byte;
  }

  private readVaruint(): number | null {
    let result = 0;
    let multiplier = 1;
    while (true) {
      const byte = this.readByte();
      if (byte === null) {
        return null;
      }
      result += (byte & 0x7f) * multiplier;
      if ((byte & 0x80) === 0) {
        return result;
      }
      multiplier *= 0x80;
      if (multiplier > Number.MAX_SAFE_INTEGER) {
        return null;
      }
    }
  }

  private readBytes(length: number): boolean {
    if (this.offset + length > this.bytes.byteLength) {
      this.parseError = 'Unexpected end of payload';
      return false;
    }
    this.offset += length;
    return true;
  }

  private readStringOfLength(length: number): string | null {
    if (this.offset + length > this.bytes.byteLength) {
      this.parseError = 'Unexpected end of string';
      return null;
    }
    const start = this.offset;
    this.offset += length;
    return textDecoder.decode(this.bytes.subarray(start, start + length));
  }

  private registerKey(value: string): number {
    const existing = this.keyByValue.get(value);
    if (existing !== undefined) {
      return existing;
    }
    const id = this.keyTable.length;
    this.keyByValue.set(value, id);
    this.keyTable.push({ id, value });
    return id;
  }

  private registerString(value: string): number {
    const existing = this.stringByValue.get(value);
    if (existing !== undefined) {
      return existing;
    }
    const id = this.stringTable.length;
    this.stringByValue.set(value, id);
    this.stringTable.push({ id, value });
    return id;
  }

  private readU16(): number | null {
    if (this.offset + 2 > this.bytes.byteLength) {
      return null;
    }
    const view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
    const value = view.getUint16(this.offset, true);
    this.offset += 2;
    return value;
  }

  private readU32(): number | null {
    if (this.offset + 4 > this.bytes.byteLength) {
      return null;
    }
    const view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
    const value = view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  private readValue(context: 'value' | 'key' | 'binary'): boolean {
    const start = this.offset;
    const tag = this.readByte();
    if (tag === null) {
      this.parseError = 'Unexpected end of payload';
      return false;
    }
    return this.readValueWithTag(start, tag, context);
  }

  private readValueWithTag(
    start: number,
    tag: number,
    context: 'value' | 'key' | 'binary',
  ): boolean {
    if (tag <= 0x7f) {
      this.pushSegment(start, this.offset, 'fixint_pos', String(tag), undefined, { value: tag });
      return true;
    }
    if (tag >= 0xe0) {
      const value = (tag << 24) >> 24;
      this.pushSegment(start, this.offset, 'fixint_neg', String(value), undefined, { value });
      return true;
    }
    if (tag >= 0x80 && tag <= 0x9f) {
      const length = tag & 0x1f;
      const str = this.readStringOfLength(length);
      if (str === null) {
        return false;
      }
      if (context === 'key') {
        this.registerKey(str);
        this.pushSegment(start, this.offset, 'fixstr', `"${str}"`, 'string_interning', { str });
      } else {
        this.registerString(str);
        this.pushSegment(start, this.offset, 'fixstr', `"${str}"`, 'string_interning', { str });
      }
      return true;
    }
    if (tag >= 0xa0 && tag <= 0xaf) {
      return this.readArray(start, tag & 0x0f);
    }
    if (tag >= 0xb0 && tag <= 0xbf) {
      return this.readMap(start, tag & 0x0f);
    }

    switch (tag) {
      case TAG_NULL:
        this.pushSegment(start, this.offset, 'null', 'null');
        return true;
      case TAG_BOOL_FALSE:
      case TAG_BOOL_TRUE:
        this.pushSegment(start, this.offset, 'bool', tag === TAG_BOOL_TRUE ? 'true' : 'false');
        return true;
      case TAG_F64:
        if (!this.readBytes(8)) {
          return false;
        }
        this.pushSegment(start, this.offset, 'float', 'f64');
        return true;
      case TAG_U8:
      case TAG_I8: {
        if (!this.readBytes(1)) {
          return false;
        }
        this.pushSegment(start, this.offset, 'integer', tag === TAG_U8 ? 'u8' : 'i8');
        return true;
      }
      case TAG_U16:
      case TAG_I16:
        if (!this.readBytes(2)) {
          return false;
        }
        this.pushSegment(start, this.offset, 'integer', tag === TAG_U16 ? 'u16' : 'i16');
        return true;
      case TAG_U32:
      case TAG_I32:
        if (!this.readBytes(4)) {
          return false;
        }
        this.pushSegment(start, this.offset, 'integer', tag === TAG_U32 ? 'u32' : 'i32');
        return true;
      case TAG_U64:
      case TAG_I64:
        if (!this.readBytes(8)) {
          return false;
        }
        this.pushSegment(start, this.offset, 'integer', tag === TAG_U64 ? 'u64' : 'i64');
        return true;
      case TAG_BIN8:
      case TAG_BIN16:
      case TAG_BIN32: {
        const len =
          tag === TAG_BIN8 ? this.readByte() : tag === TAG_BIN16 ? this.readU16() : this.readU32();
        if (len === null || !this.readBytes(len)) {
          return false;
        }
        this.pushSegment(start, this.offset, 'binary', `bin(${len})`);
        return true;
      }
      case TAG_STR8:
      case TAG_STR16:
      case TAG_STR32: {
        const len =
          tag === TAG_STR8 ? this.readByte() : tag === TAG_STR16 ? this.readU16() : this.readU32();
        if (len === null) {
          return false;
        }
        const str = this.readStringOfLength(len);
        if (str === null) {
          return false;
        }
        if (context === 'key') {
          this.registerKey(str);
        } else {
          this.registerString(str);
        }
        this.pushSegment(start, this.offset, 'string', `"${str}"`, 'string_interning', { str });
        return true;
      }
      case TAG_ARRAY16:
      case TAG_ARRAY32: {
        const len = tag === TAG_ARRAY16 ? this.readU16() : this.readU32();
        if (len === null) {
          return false;
        }
        return this.readArrayBody(start, len);
      }
      case TAG_MAP16:
      case TAG_MAP32: {
        const len = tag === TAG_MAP16 ? this.readU16() : this.readU32();
        if (len === null) {
          return false;
        }
        return this.readMapBody(start, len);
      }
      case TAG_SHAPE_DEF:
        return this.readShapeDef(start);
      case TAG_SHAPE_REF:
        return this.readShapeRef(start);
      case TAG_KEY_REF:
        return this.readKeyRef(start);
      case TAG_STR_REF:
        return this.readStrRef(start);
      case TAG_TYPED_VEC:
        return this.readTypedVec(start);
      case TAG_ROW_BATCH:
      case TAG_COL_BATCH:
        return this.readDynamicBatch(start, tag);
      default:
        this.parseError = `Unknown tag 0x${tag.toString(16)}`;
        this.pushSegment(start, this.offset, 'unknown', `tag 0x${tag.toString(16)}`);
        return false;
    }
  }

  private readArray(start: number, length: number): boolean {
    this.pushSegment(start, start + 1, 'fixarray', `array(${length})`);
    return this.readArrayBody(start, length);
  }

  private readArrayBody(arrayStart: number, length: number): boolean {
    if (length === 0) {
      return true;
    }

    const elemStart = this.offset;
    const firstTag = this.bytes[elemStart];
    if (firstTag === TAG_SHAPE_DEF) {
      if (!this.readShapeDef(elemStart)) {
        return false;
      }
      for (let i = 0; i < length; i += 1) {
        const shapeId = this.shapeTable[this.shapeTable.length - 1]?.id ?? 0;
        const keys = this.shapeTable[this.shapeTable.length - 1]?.keys ?? [];
        const rowStart = this.offset;
        for (let j = 0; j < keys.length; j += 1) {
          if (!this.readValue('value')) {
            return false;
          }
        }
        this.pushSegment(
          rowStart,
          this.offset,
          'shape_ref',
          `shape #${shapeId} row`,
          'shape_tree',
          {
            shapeId,
          },
        );
      }
      this.pushSegment(
        arrayStart,
        this.offset,
        'array',
        `shape array(${length})`,
        'shape_detection',
      );
      return true;
    }

    if (!this.readValue('value')) {
      return false;
    }
    for (let i = 1; i < length; i += 1) {
      if (!this.readValue('value')) {
        return false;
      }
    }
    this.pushSegment(arrayStart, this.offset, 'array', `array(${length})`);
    return true;
  }

  private readMap(start: number, length: number): boolean {
    this.pushSegment(start, start + 1, 'fixmap', `map(${length})`);
    return this.readMapBody(start, length);
  }

  private readMapBody(mapStart: number, length: number): boolean {
    for (let i = 0; i < length; i += 1) {
      const keyStart = this.offset;
      const keyTag = this.bytes[keyStart];
      if (keyTag === TAG_KEY_REF) {
        if (!this.readKeyRef(keyStart)) {
          return false;
        }
      } else if (!this.readValueWithTag(keyStart, keyTag ?? 0, 'key')) {
        return false;
      }
      if (!this.readValue('value')) {
        return false;
      }
    }
    this.pushSegment(mapStart, this.offset, 'map', `map(${length})`);
    return true;
  }

  private readShapeDef(start: number): boolean {
    const shapeId = this.readVaruint();
    const keyCount = this.readVaruint();
    if (shapeId === null || keyCount === null) {
      return false;
    }
    const keys: string[] = [];
    for (let i = 0; i < keyCount; i += 1) {
      const keyStart = this.offset;
      const keyTag = this.bytes[keyStart];
      if (keyTag === undefined) {
        return false;
      }
      if (keyTag >= 0x80 && keyTag <= 0x9f) {
        const len = keyTag & 0x1f;
        const key = this.readStringOfLength(len);
        if (key === null) {
          return false;
        }
        keys.push(key);
        this.registerKey(key);
        this.pushSegment(keyStart, this.offset, 'fixstr', `shape key "${key}"`, 'shape_tree');
      } else if (!this.readValueWithTag(keyStart, keyTag, 'key')) {
        return false;
      } else {
        const last = this.keyTable[this.keyTable.length - 1]?.value;
        if (last) {
          keys.push(last);
        }
      }
    }
    this.shapeTable.push({ id: shapeId, keys });
    this.pushSegment(start, this.offset, 'shape_def', `shape #${shapeId}`, 'shape_tree', {
      shapeId,
      keys,
    });
    return true;
  }

  private readShapeRef(start: number): boolean {
    const shapeId = this.readVaruint();
    if (shapeId === null) {
      return false;
    }
    const keys = this.shapeTable.find((s) => s.id === shapeId)?.keys ?? [];
    for (let j = 0; j < keys.length; j += 1) {
      if (!this.readValue('value')) {
        return false;
      }
    }
    this.pushSegment(start, this.offset, 'shape_ref', `shape #${shapeId}`, 'shape_tree', {
      shapeId,
    });
    return true;
  }

  private readKeyRef(start: number): boolean {
    const id = this.readVaruint();
    if (id === null) {
      return false;
    }
    const key = this.keyTable[id]?.value ?? `#${id}`;
    this.pushSegment(start, this.offset, 'key_ref', `key_ref #${id} (${key})`, 'string_interning', {
      id,
      key,
    });
    return true;
  }

  private readStrRef(start: number): boolean {
    const id = this.readVaruint();
    if (id === null) {
      return false;
    }
    const str = this.stringTable[id]?.value ?? `#${id}`;
    this.pushSegment(start, this.offset, 'str_ref', `str_ref #${id} (${str})`, 'string_interning', {
      id,
      str,
    });
    return true;
  }

  private readTypedVec(start: number): boolean {
    const elemType = this.readByte();
    const count = this.readVaruint();
    const codec = this.readByte();
    if (elemType === null || count === null || codec === null) {
      return false;
    }
    const payloadStart = this.offset;
    if (!this.skipTypedVecPayload()) {
      return false;
    }
    this.pushSegment(start, this.offset, 'typed_vec', `typed_vec ×${count}`, 'typed_vector_batch', {
      elemType,
      count,
      codec,
    });
    this.pushSegment(
      payloadStart,
      this.offset,
      'binary',
      'typed_vec payload',
      'typed_vector_batch',
    );
    return true;
  }

  private skipTypedVecPayload(): boolean {
    // Best-effort skip: consume remaining bytes if exact codec layout unknown.
    const remaining = this.bytes.byteLength - this.offset;
    if (remaining <= 0) {
      this.parseError = 'typed_vec payload truncated';
      return false;
    }
    this.offset = this.bytes.byteLength;
    return true;
  }

  private readDynamicBatch(start: number, tag: number): boolean {
    const count = this.readVaruint();
    if (count === null) {
      return false;
    }
    for (let i = 0; i < count; i += 1) {
      if (!this.readValue('value')) {
        return false;
      }
    }
    const kind = tag === TAG_ROW_BATCH ? 'row_batch' : 'col_batch';
    const label = tag === TAG_ROW_BATCH ? `row_batch ×${count}` : `col_batch ×${count}`;
    this.pushSegment(start, this.offset, kind, label, 'typed_vector_batch', { count });
    return true;
  }
}

function envelopeKind(envelope: string): SegmentKind {
  switch (envelope) {
    case 'ROW_BATCH':
      return 'row_batch_env';
    case 'COLUMN_BATCH':
      return 'column_batch_env';
    case 'SCHEMA_BATCH':
      return 'schema_batch';
    case 'BOUND_STREAM':
      return 'bound_stream';
    case 'SCHEMA_OBJECT':
      return 'schema_object';
    default:
      return 'unknown';
  }
}

export function annotateDynamic(bytes: Uint8Array): AnnotationResult {
  return new AnnotatingReader(bytes).annotate();
}

export function formatHexPreview(bytes: Uint8Array, maxBytes = 64): string {
  const slice = bytes.subarray(0, maxBytes);
  const hex = Array.from(slice, (b) => b.toString(16).padStart(2, '0')).join(' ');
  if (bytes.byteLength > maxBytes) {
    return `${hex} … (+${bytes.byteLength - maxBytes} bytes)`;
  }
  return hex;
}

export function formatFullHex(bytes: Uint8Array): string {
  const lines: string[] = [];
  // 8 bytes/line keeps classic dump lines within the inspector sidebar width.
  for (let offset = 0; offset < bytes.byteLength; offset += 8) {
    const chunk = bytes.subarray(offset, Math.min(offset + 8, bytes.byteLength));
    const hex = Array.from(chunk, (b) => b.toString(16).padStart(2, '0')).join(' ');
    const ascii = Array.from(chunk, (b) =>
      b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : '.',
    ).join('');
    lines.push(`${offset.toString(16).padStart(4, '0')}: ${hex}  ${ascii}`);
  }
  return lines.join('\n');
}
