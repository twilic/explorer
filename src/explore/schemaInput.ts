import type { Schema, SchemaField, TwilicValue } from '@twilic/core/advanced';

import { normalizeRecords } from './batchHeuristics.js';

export const INFERRED_SCHEMA_ID = 1;
export const INFERRED_SCHEMA_NAME = 'Inferred';
export const SCALAR_FIELD_NAME = 'value';

export function usesBoundSchema(mode: string): boolean {
  return mode === 'schema_batch' || mode === 'bound_stream';
}

export function formatSchemaText(schema: Schema): string {
  return JSON.stringify(schema, null, 2);
}

export function parseSchemaText(text: string): Schema {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('Empty schema.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error('Schema is not valid JSON.');
  }

  return normalizeSchema(parsed);
}

export function isPlainRecord(value: TwilicValue): value is Record<string, TwilicValue> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !(value instanceof Uint8Array)
  );
}

export function schemaFitsPayload(schema: Schema, value: TwilicValue): boolean {
  const records = normalizeRecords(value);
  if (records.length === 0 || schema.fields.length === 0) {
    return false;
  }

  const required = schema.fields.filter(
    (field) => field.required && field.defaultValue === undefined,
  );
  const allMaps = records.every(isPlainRecord);

  if (!allMaps) {
    return schema.fields.length === 1;
  }

  return records.every((record) => required.every((field) => field.name in record));
}

export function recordsForSchema(value: TwilicValue, schema: Schema): TwilicValue[] {
  const records = normalizeRecords(value);
  if (records.length === 0 || schema.fields.length !== 1) {
    return records;
  }

  if (records.every(isPlainRecord)) {
    return records;
  }

  const fieldName = schema.fields[0].name;
  return records.map((record) => {
    if (isPlainRecord(record)) {
      return record;
    }
    return { [fieldName]: record };
  });
}

export function inferSchemaFromValue(value: TwilicValue): Schema {
  const records = normalizeRecords(value);
  if (records.length === 0) {
    return {
      schemaId: INFERRED_SCHEMA_ID,
      name: INFERRED_SCHEMA_NAME,
      fields: [
        {
          number: 1,
          name: SCALAR_FIELD_NAME,
          logicalType: 'string',
          required: true,
        },
      ],
    };
  }

  if (records.every(isPlainRecord)) {
    return inferObjectSchema(records);
  }

  return {
    schemaId: INFERRED_SCHEMA_ID,
    name: INFERRED_SCHEMA_NAME,
    fields: [
      {
        number: 1,
        name: SCALAR_FIELD_NAME,
        logicalType: inferLogicalType(records),
        required: true,
      },
    ],
  };
}

export function schemaForPayload(value: TwilicValue, fallback: Schema): Schema {
  const embedded = embeddedSchema(value);
  if (embedded) {
    return embedded;
  }
  if (schemaFitsPayload(fallback, value)) {
    return fallback;
  }
  return inferSchemaFromValue(value);
}

function inferObjectSchema(records: Array<Record<string, TwilicValue>>): Schema {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    for (const name of Object.keys(record)) {
      if (!seen.has(name)) {
        seen.add(name);
        names.push(name);
      }
    }
  }

  const fields: SchemaField[] = names.map((name, index) => {
    const present = records.filter((record) => name in record).map((record) => record[name]);
    return {
      number: index + 1,
      name,
      logicalType: inferLogicalType(present),
      required: records.every((record) => name in record),
    };
  });

  return {
    schemaId: INFERRED_SCHEMA_ID,
    name: INFERRED_SCHEMA_NAME,
    fields:
      fields.length > 0
        ? fields
        : [
            {
              number: 1,
              name: SCALAR_FIELD_NAME,
              logicalType: 'string',
              required: true,
            },
          ],
  };
}

function inferLogicalType(values: TwilicValue[]): string {
  const types = new Set(values.filter((value) => value !== null).map(logicalTypeOf));
  if (types.size === 1) {
    return types.values().next().value ?? 'string';
  }
  if (types.has('f64') && [...types].every((type) => type === 'f64' || isIntegerType(type))) {
    return 'f64';
  }
  if ([...types].every(isIntegerType)) {
    return types.has('i64') ? 'i64' : 'u64';
  }
  return 'string';
}

function isIntegerType(type: string): boolean {
  return type === 'i64' || type === 'u64';
}

function logicalTypeOf(value: TwilicValue): string {
  if (typeof value === 'boolean') {
    return 'bool';
  }
  if (typeof value === 'string') {
    return 'string';
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? (value < 0 ? 'i64' : 'u64') : 'f64';
  }
  if (typeof value === 'bigint') {
    return value < 0n ? 'i64' : 'u64';
  }
  if (value instanceof Uint8Array) {
    return 'bytes';
  }
  return 'string';
}

function embeddedSchema(value: TwilicValue): Schema | null {
  if (!isPlainRecord(value) || !('schema' in value)) {
    return null;
  }
  try {
    return normalizeSchema(value.schema);
  } catch {
    return null;
  }
}

function normalizeSchema(raw: unknown): Schema {
  if (!isObject(raw)) {
    throw new Error('Schema must be an object.');
  }
  if ('schema' in raw && raw.schema !== undefined) {
    return normalizeSchema(raw.schema);
  }

  const schemaId = asInteger(raw.schemaId, 'schemaId');
  const name = asString(raw.name, 'name');
  if (!Array.isArray(raw.fields) || raw.fields.length === 0) {
    throw new Error('Schema must include a non-empty fields array.');
  }

  return {
    schemaId,
    name,
    fields: raw.fields.map((field, index) => normalizeField(field, index)),
  };
}

function normalizeField(raw: unknown, index: number): SchemaField {
  if (!isObject(raw)) {
    throw new Error(`fields[${index}] must be an object.`);
  }

  const logicalType = asString(raw.logicalType ?? raw.type, `fields[${index}] type`);
  const field: SchemaField = {
    number: asInteger(raw.number, `fields[${index}].number`),
    name: asString(raw.name, `fields[${index}].name`),
    logicalType,
    required: typeof raw.required === 'boolean' ? raw.required : true,
  };

  if (raw.defaultValue !== undefined) {
    field.defaultValue = raw.defaultValue as TwilicValue;
  } else if (raw.default !== undefined) {
    field.defaultValue = raw.default as TwilicValue;
  }

  const enumValues = raw.enumValues ?? raw.enum;
  if (Array.isArray(enumValues) && enumValues.every((item) => typeof item === 'string')) {
    field.enumValues = enumValues;
  }

  if (typeof raw.min === 'number' || typeof raw.min === 'bigint') {
    field.min = raw.min;
  }
  if (typeof raw.max === 'number' || typeof raw.max === 'bigint') {
    field.max = raw.max;
  }
  if (Array.isArray(raw.range) && raw.range.length === 2) {
    const [min, max] = raw.range;
    if (typeof min === 'number' || typeof min === 'bigint') {
      field.min = min;
    }
    if (typeof max === 'number' || typeof max === 'bigint') {
      field.max = max;
    }
  }

  return field;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function asInteger(value: unknown, label: string): number {
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '' && Number.isInteger(Number(value))) {
    return Number(value);
  }
  throw new Error(`${label} must be an integer.`);
}
