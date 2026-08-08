import { describe, expect, it } from 'vitest';

import { annotateDynamic, formatHexPreview } from './annotateDynamic.js';
import { buildPipeline } from './buildPipeline.js';
import {
  buildStringInternView,
  detectShapeCandidates,
  normalizeRecords,
} from './batchHeuristics.js';

describe('annotateDynamic', () => {
  it('annotates fixstr array of repeated strings', () => {
    const payload = new Uint8Array([
      0xa3, 0x85, 0x61, 0x64, 0x6d, 0x69, 0x6e, 0x85, 0x61, 0x64, 0x6d, 0x69, 0x6e, 0x85, 0x61,
      0x64, 0x6d, 0x69, 0x6e,
    ]);
    const result = annotateDynamic(payload);
    expect(result.parseError).toBeNull();
    expect(result.stringTable.length).toBeGreaterThanOrEqual(1);
    expect(result.segments.some((s) => s.kind === 'fixstr')).toBe(true);
  });

  it('detects SCHEMA_BATCH envelope', () => {
    const bytes = new Uint8Array([0x0e, 0x01, 0x02, 0x03]);
    const result = annotateDynamic(bytes);
    expect(result.messageKind).toBe('SCHEMA_BATCH');
    expect(result.segments[0]?.kind).toBe('schema_batch');
  });

  it('formats hex preview with truncation', () => {
    const bytes = new Uint8Array(Array.from({ length: 80 }, (_, i) => i));
    const preview = formatHexPreview(bytes, 16);
    expect(preview).toContain('…');
  });
});

describe('buildPipeline helpers', () => {
  it('normalizes record arrays', () => {
    expect(normalizeRecords([{ id: 1 }])).toHaveLength(1);
    expect(normalizeRecords({ records: [{ id: 1 }, { id: 2 }] })).toHaveLength(2);
  });

  it('detects homogeneous map shape', () => {
    const records = [
      { id: 1, role: 'admin' },
      { id: 2, role: 'user' },
    ];
    const shapes = detectShapeCandidates(records);
    expect(shapes).toHaveLength(1);
    expect(shapes[0]?.keys).toEqual(['id', 'role']);
    expect(shapes[0]?.promoted).toBe(false);
  });

  it('builds string intern view with reuse', () => {
    const view = buildStringInternView(['admin', 'admin', 'user']);
    expect(view.table.map((e) => e.value)).toContain('admin');
    expect(view.references.filter((r) => r.refId !== null).length).toBeGreaterThan(0);
  });

  it('builds ordered pipeline stages', () => {
    const bytes = new Uint8Array([0xa1, 0x81, 0x78]);
    const model = buildPipeline('dynamic', ['x'], bytes);
    expect(model.stages.map((s) => s.id)).toEqual([
      'input',
      'profile',
      'shape_detection',
      'shape_tree',
      'string_interning',
      'typed_vector_batch',
      'binary',
    ]);
    expect(model.stages[0]?.detail?.type).toBe('input');
  });
});
