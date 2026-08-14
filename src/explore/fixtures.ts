import type { Schema, TwilicValue } from '@twilic/core/advanced';

/** Bound profile schema aligned with twilic/examples/schema-example.json */
export const userRecordSchema: Schema = {
  schemaId: 42,
  name: 'UserRecordV1',
  fields: [
    {
      number: 1,
      name: 'id',
      logicalType: 'u32',
      required: true,
      min: 1,
      max: 10_000_000,
    },
    {
      number: 2,
      name: 'role',
      logicalType: 'string',
      required: true,
      enumValues: ['viewer', 'editor', 'admin'],
    },
    {
      number: 3,
      name: 'age',
      logicalType: 'u8',
      required: false,
      min: 0,
      max: 127,
      defaultValue: 0,
    },
    {
      number: 4,
      name: 'active',
      logicalType: 'bool',
      required: true,
    },
  ],
};

export const userRecordExampleRecords: TwilicValue[] = [
  { id: 1001, role: 'admin', age: 36, active: true },
  { id: 1002, role: 'viewer', active: false },
  { id: 1003, role: 'editor', age: 29, active: true },
];

export interface ExploreFixture {
  id: string;
  label: string;
  description: string;
  defaultMode: 'dynamic' | 'batch' | 'schema_batch' | 'bound_stream';
  value: TwilicValue;
  schema?: Schema;
}

export const exploreFixtures: ExploreFixture[] = [
  {
    id: 'admin-repeats',
    label: 'Repeated admin',
    description: 'Three identical role strings — ideal for string interning.',
    defaultMode: 'dynamic',
    value: ['admin', 'admin', 'admin'],
  },
  {
    id: 'user-shape',
    label: 'User shape',
    description: 'Single map with id, name, and role fields.',
    defaultMode: 'dynamic',
    value: { id: 1, name: 'Ada', role: 'admin' },
  },
  {
    id: 'role-batch-3',
    label: 'Role batch ×3',
    description: 'Small homogeneous batch — ROW layout, column heuristics.',
    defaultMode: 'batch',
    value: [
      { id: 1, role: 'admin' },
      { id: 2, role: 'admin' },
      { id: 3, role: 'user' },
    ],
  },
  {
    id: 'schema-example-3',
    label: 'Schema example ×3',
    description: 'Same records as schema-example.json — try SCHEMA_BATCH or BOUND_STREAM.',
    defaultMode: 'schema_batch',
    value: userRecordExampleRecords,
    schema: userRecordSchema,
  },
];

export const defaultExploreJson = JSON.stringify(exploreFixtures[2].value, null, 2);
