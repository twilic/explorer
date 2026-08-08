import {
  encode,
  encodeBatch,
  encodeBatchWithSchema,
  encodeBoundStream,
  type Schema,
  type TwilicValue,
} from '@twilic/core/advanced';

import type { EncodeMode } from './pipelineTypes.js';
import { normalizeRecords } from './batchHeuristics.js';
import { userRecordSchema } from './fixtures.js';

export function encodeForMode(
  mode: EncodeMode,
  value: TwilicValue,
  schema: Schema = userRecordSchema,
): Uint8Array {
  const records = normalizeRecords(value);

  switch (mode) {
    case 'dynamic':
      if (records.length === 1) {
        return encode(records[0]);
      }
      return encodeBatch(records);
    case 'batch':
      return encodeBatch(records);
    case 'schema_batch':
      return encodeBatchWithSchema(schema, records);
    case 'bound_stream':
      return encodeBoundStream(schema, records);
    default:
      return encode(records[0]);
  }
}

export function modeLabel(mode: EncodeMode): string {
  switch (mode) {
    case 'dynamic':
      return 'Dynamic';
    case 'batch':
      return 'Batch';
    case 'schema_batch':
      return 'Schema';
    case 'bound_stream':
      return 'Bound';
  }
}

export function modeDescription(mode: EncodeMode): string {
  switch (mode) {
    case 'dynamic':
      return 'Dynamic profile — message-local shape, key, and string reuse.';
    case 'batch':
      return 'Dynamic batch — ROW below 16 rows, COLUMN at 16+.';
    case 'schema_batch':
      return 'SCHEMA_BATCH (0x0E) — schema-aware columnar batch.';
    case 'bound_stream':
      return 'BOUND_STREAM (0x0F) — schema-bound compact record stream.';
  }
}
