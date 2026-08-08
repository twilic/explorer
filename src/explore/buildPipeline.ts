import type { TwilicValue } from '@twilic/core/advanced';

import { annotateDynamic, formatHexPreview } from './annotateDynamic.js';
import {
  buildBatchTransformView,
  buildStringInternView,
  detectShapeCandidates,
  normalizeRecords,
} from './batchHeuristics.js';
import { modeDescription, modeLabel } from './encodeForMode.js';
import type {
  AnnotationResult,
  ExploreModel,
  PipelineStage,
  PipelineStageId,
} from './pipelineTypes.js';
import type { EncodeMode } from './pipelineTypes.js';

function rangesForStage(
  annotation: AnnotationResult,
  stageId: PipelineStageId,
): Array<{ start: number; end: number }> {
  return annotation.segments
    .filter((segment) => segment.stageId === stageId)
    .map((segment) => ({ start: segment.start, end: segment.end }));
}

function profileMessageKind(mode: EncodeMode, annotation: AnnotationResult): string {
  if (annotation.messageKind !== 'DYNAMIC') {
    return annotation.messageKind;
  }
  switch (mode) {
    case 'dynamic':
      return 'DYNAMIC';
    case 'batch':
      return 'BATCH (Dynamic)';
    case 'schema_batch':
      return 'SCHEMA_BATCH';
    case 'bound_stream':
      return 'BOUND_STREAM';
  }
}

export function buildPipeline(
  mode: EncodeMode,
  input: TwilicValue,
  bytes: Uint8Array,
): ExploreModel {
  const annotation = annotateDynamic(bytes);
  const records = normalizeRecords(input);
  const stringView = buildStringInternView(records.length === 1 ? records[0] : records);
  const shapeCandidates = detectShapeCandidates(records);
  const batchView = buildBatchTransformView(mode, records, annotation.messageKind);
  const messageKind = profileMessageKind(mode, annotation);

  const stages: PipelineStage[] = [
    {
      id: 'input',
      title: 'Input JSON',
      summary: 'Structured value before Twilic encoding.',
      byteRanges: [],
      detail: { type: 'input', value: input },
    },
    {
      id: 'profile',
      title: 'Dynamic profile',
      summary: `${modeLabel(mode)} — ${modeDescription(mode)}`,
      byteRanges: rangesForStage(annotation, 'profile'),
      detail: { type: 'profile', mode, messageKind },
    },
    {
      id: 'shape_detection',
      title: 'Shape detection',
      summary:
        shapeCandidates.length > 0
          ? `${shapeCandidates[0].rowCount} homogeneous rows · ${shapeCandidates[0].promoted ? 'promoted' : 'not promoted'}`
          : 'No homogeneous map-array shape detected.',
      byteRanges: rangesForStage(annotation, 'shape_detection'),
      detail: { type: 'shape_detection', view: { candidates: shapeCandidates } },
    },
    {
      id: 'shape_tree',
      title: 'Shape tree',
      summary:
        annotation.shapeTable.length > 0
          ? `${annotation.shapeTable.length} shape(s) on the wire`
          : shapeCandidates.length > 0
            ? `Expected keys: ${shapeCandidates[0].keys.join(', ')}`
            : 'No shape_def in payload.',
      byteRanges: rangesForStage(annotation, 'shape_tree'),
      detail: {
        type: 'shape_tree',
        shapes:
          annotation.shapeTable.length > 0
            ? annotation.shapeTable
            : shapeCandidates.map((c) => ({ id: c.shapeId, keys: c.keys })),
      },
    },
    {
      id: 'string_interning',
      title: 'String interning',
      summary: `${stringView.table.length} unique string(s), ${stringView.references.filter((r) => r.refId !== null).length} reuse(s)`,
      byteRanges: rangesForStage(annotation, 'string_interning'),
      detail: { type: 'string_interning', view: stringView },
    },
    {
      id: 'typed_vector_batch',
      title: annotation.segments.some((s) => s.kind === 'typed_vec')
        ? 'Typed vector'
        : 'Batch layout',
      summary:
        batchView.layout === 'DYNAMIC'
          ? batchView.thresholdNote
          : `${batchView.layout} · ${batchView.rowCount} row(s)`,
      byteRanges: rangesForStage(annotation, 'typed_vector_batch'),
      detail: { type: 'typed_vector_batch', view: batchView },
    },
    {
      id: 'binary',
      title: 'Binary',
      summary: `${bytes.byteLength} byte(s) — final Twilic payload`,
      byteRanges: [{ start: 0, end: bytes.byteLength }],
      detail: {
        type: 'binary',
        byteLength: bytes.byteLength,
        hexPreview: formatHexPreview(bytes, 96),
      },
    },
  ];

  return { mode, input, bytes, annotation, stages };
}

export function segmentsForStage(model: ExploreModel, stageId: PipelineStageId) {
  const stage = model.stages.find((s) => s.id === stageId);
  if (!stage) {
    return [];
  }
  const ranges = stage.byteRanges;
  return model.annotation.segments.filter((segment) =>
    ranges.some((range) => segment.start >= range.start && segment.end <= range.end),
  );
}
