import type { TwilicValue } from '@twilic/core/advanced';

import type { BatchTransformView, ColumnHeuristic, EncodeMode } from './pipelineTypes.js';

const COLUMN_BATCH_THRESHOLD = 16;
const TYPED_VEC_THRESHOLD = 4;
const SHAPE_KEY_MIN = 3;
const SHAPE_OBS_MIN = 2;
const DICTIONARY_MIN_LEN = 16;
const DICTIONARY_UNIQUE_RATIO = 0.25;

export function normalizeRecords(value: TwilicValue): TwilicValue[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value) && 'records' in value) {
    const records = (value as { records?: unknown }).records;
    if (Array.isArray(records)) {
      return records as TwilicValue[];
    }
  }
  return [value];
}

export function isHomogeneousMapArray(
  records: TwilicValue[],
): records is Array<Record<string, TwilicValue>> {
  if (records.length === 0) {
    return false;
  }
  const first = records[0];
  if (first === null || typeof first !== 'object' || Array.isArray(first)) {
    return false;
  }
  const keys = Object.keys(first).sort().join('\0');
  return records.every((row) => {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) {
      return false;
    }
    return Object.keys(row).sort().join('\0') === keys;
  });
}

export function collectStringLiterals(value: TwilicValue, out: string[] = []): string[] {
  if (typeof value === 'string') {
    out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectStringLiterals(item, out);
    }
    return out;
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      out.push(key);
      collectStringLiterals(child, out);
    }
  }
  return out;
}

export function detectShapeCandidates(records: TwilicValue[]): Array<{
  shapeId: number;
  keys: string[];
  rowCount: number;
  promoted: boolean;
}> {
  if (!isHomogeneousMapArray(records)) {
    return [];
  }
  const keys = Object.keys(records[0]).sort();
  const promoted = keys.length >= SHAPE_KEY_MIN && records.length >= SHAPE_OBS_MIN;
  return [{ shapeId: 0, keys, rowCount: records.length, promoted }];
}

export function heuristicStringCodec(values: TwilicValue[]): { codec: string; note: string } {
  const strings = values.filter((v): v is string => typeof v === 'string');
  if (strings.length === 0) {
    return { codec: 'PLAIN', note: 'Non-string column' };
  }
  const unique = new Set(strings);
  const ratio = unique.size / strings.length;
  if (strings.length >= DICTIONARY_MIN_LEN && ratio <= DICTIONARY_UNIQUE_RATIO) {
    return {
      codec: 'DICTIONARY',
      note: `High reuse (${unique.size} unique / ${strings.length} rows)`,
    };
  }
  const hasReuse = unique.size < strings.length;
  if (hasReuse) {
    return { codec: 'STRING_REF', note: 'Repeated literals within the message' };
  }
  return { codec: 'PLAIN', note: 'Mostly unique strings' };
}

export function heuristicIntegerCodec(values: TwilicValue[]): { codec: string; note: string } {
  const nums = values.filter((v): v is number => typeof v === 'number' && Number.isInteger(v));
  if (nums.length === 0) {
    return { codec: 'PLAIN', note: 'Non-integer column' };
  }
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const range = max - min;
  if (range <= 255) {
    return { codec: 'DIRECT_BITPACK', note: `Small range ${min}..${max}` };
  }
  let allDeltaOne = true;
  for (let i = 1; i < nums.length; i += 1) {
    if (nums[i] - nums[i - 1] !== 1) {
      allDeltaOne = false;
      break;
    }
  }
  if (allDeltaOne && nums.length >= 4) {
    return { codec: 'DELTA_BITPACK', note: 'Monotonic +1 sequence' };
  }
  return { codec: 'PLAIN', note: `Wide integer range ${min}..${max}` };
}

export function heuristicColumn(field: string, records: TwilicValue[]): ColumnHeuristic {
  const values = records.map((row) => {
    if (row !== null && typeof row === 'object' && !Array.isArray(row)) {
      return (row as Record<string, TwilicValue>)[field] ?? null;
    }
    return null;
  });
  const stringGuess = heuristicStringCodec(values);
  const intGuess = heuristicIntegerCodec(values);
  const likelyCodec = values.some((v) => typeof v === 'string')
    ? stringGuess.codec
    : intGuess.codec;
  const note = values.some((v) => typeof v === 'string') ? stringGuess.note : intGuess.note;
  return { field, values, likelyCodec, approximate: true, note };
}

export function buildBatchTransformView(
  mode: EncodeMode,
  records: TwilicValue[],
  messageKind: string,
): BatchTransformView {
  const rowCount = records.length;
  const useColumn = rowCount >= COLUMN_BATCH_THRESHOLD;

  let layout: BatchTransformView['layout'] = 'DYNAMIC';
  if (mode === 'schema_batch' || messageKind === 'SCHEMA_BATCH') {
    layout = 'SCHEMA_BATCH';
  } else if (mode === 'bound_stream' || messageKind === 'BOUND_STREAM') {
    layout = 'BOUND_STREAM';
  } else if (mode === 'batch') {
    layout = useColumn ? 'COLUMN_BATCH' : 'ROW_BATCH';
  } else if (messageKind === 'COLUMN_BATCH' || messageKind === 'col_batch') {
    layout = 'COLUMN_BATCH';
  } else if (messageKind === 'ROW_BATCH' || messageKind === 'row_batch') {
    layout = 'ROW_BATCH';
  }

  const columns: ColumnHeuristic[] = [];
  if (isHomogeneousMapArray(records)) {
    for (const field of Object.keys(records[0])) {
      columns.push(heuristicColumn(field, records));
    }
  }

  const thresholdNote =
    mode === 'dynamic'
      ? `Homogeneous primitive arrays may promote to typed_vec when length ≥ ${TYPED_VEC_THRESHOLD}.`
      : `Batch layout uses COLUMN when row count ≥ ${COLUMN_BATCH_THRESHOLD} (current: ${rowCount}).`;

  return {
    layout,
    rowCount,
    thresholdNote,
    rowsPreview: records.slice(0, 8),
    columns,
  };
}

export function buildStringInternView(value: TwilicValue): {
  originals: string[];
  table: Array<{ id: number; value: string }>;
  references: Array<{ index: number; refId: number | null; literal: string }>;
} {
  const allStrings = collectStringLiterals(value);
  const table: Array<{ id: number; value: string }> = [];
  const byValue = new Map<string, number>();
  for (const literal of allStrings) {
    if (!byValue.has(literal)) {
      const id = table.length;
      byValue.set(literal, id);
      table.push({ id, value: literal });
    }
  }
  const references = allStrings.map((literal, index) => {
    const firstIndex = allStrings.indexOf(literal);
    return {
      index,
      refId: firstIndex === index ? null : (byValue.get(literal) ?? null),
      literal,
    };
  });
  return { originals: allStrings, table, references };
}
