import { describe, expect, it } from 'vitest';

import { userRecordSchema } from './fixtures.ts';
import {
  formatSchemaText,
  inferSchemaFromValue,
  parseSchemaText,
  recordsForSchema,
  schemaFitsPayload,
  schemaForPayload,
} from './schemaInput.ts';

describe('parseSchemaText', () => {
  it('accepts the JS Schema shape', () => {
    expect(parseSchemaText(formatSchemaText(userRecordSchema)).name).toBe('UserRecordV1');
  });

  it('accepts schema-example.json field names', () => {
    const schema = parseSchemaText(
      JSON.stringify({
        schemaId: 42,
        name: 'UserRecordV1',
        fields: [
          { number: 1, name: 'id', type: 'u32', required: true, range: [1, 10] },
          { number: 2, name: 'role', type: 'string', required: true, enum: ['admin'] },
        ],
      }),
    );
    expect(schema.fields[0]?.logicalType).toBe('u32');
    expect(schema.fields[0]?.min).toBe(1);
    expect(schema.fields[1]?.enumValues).toEqual(['admin']);
  });

  it('unwraps a { schema } envelope', () => {
    expect(parseSchemaText(JSON.stringify({ schema: userRecordSchema })).schemaId).toBe(42);
  });
});

describe('inferSchemaFromValue', () => {
  it('wraps scalar arrays as a single value field', () => {
    const schema = inferSchemaFromValue(['admin', 'admin', 'admin']);
    expect(schema.fields).toEqual([
      { number: 1, name: 'value', logicalType: 'string', required: true },
    ]);
  });

  it('infers object fields and optional keys', () => {
    const schema = inferSchemaFromValue([
      { id: 1, role: 'admin' },
      { id: 2, role: 'user', extra: true },
    ]);
    expect(schema.fields.map((field) => field.name)).toEqual(['id', 'role', 'extra']);
    expect(schema.fields.find((field) => field.name === 'extra')?.required).toBe(false);
    expect(schema.fields.find((field) => field.name === 'id')?.logicalType).toBe('u64');
  });
});

describe('schemaFitsPayload', () => {
  it('rejects UserRecordV1 for repeated admin strings', () => {
    expect(schemaFitsPayload(userRecordSchema, ['admin', 'admin', 'admin'])).toBe(false);
  });

  it('accepts a single-field schema for scalars', () => {
    expect(schemaFitsPayload(inferSchemaFromValue(['admin']), ['admin', 'viewer'])).toBe(true);
  });
});

describe('recordsForSchema', () => {
  it('wraps scalars for a single-field schema', () => {
    const schema = inferSchemaFromValue(['admin']);
    expect(recordsForSchema(['admin', 'admin'], schema)).toEqual([
      { value: 'admin' },
      { value: 'admin' },
    ]);
  });
});

describe('schemaForPayload', () => {
  it('keeps a matching fallback schema', () => {
    expect(schemaForPayload([{ id: 1, role: 'admin', active: true }], userRecordSchema).name).toBe(
      'UserRecordV1',
    );
  });

  it('infers when the fallback does not fit', () => {
    expect(schemaForPayload(['admin', 'admin'], userRecordSchema).fields[0]?.name).toBe('value');
  });
});
