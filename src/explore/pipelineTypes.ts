import type { TwilicValue } from '@twilic/core/advanced';

export type PipelineStageId =
  | 'input'
  | 'profile'
  | 'shape_detection'
  | 'shape_tree'
  | 'string_interning'
  | 'typed_vector_batch'
  | 'binary';

export type EncodeMode = 'dynamic' | 'batch' | 'schema_batch' | 'bound_stream';

export type SegmentKind =
  | 'fixint_pos'
  | 'fixint_neg'
  | 'fixstr'
  | 'fixarray'
  | 'fixmap'
  | 'null'
  | 'bool'
  | 'float'
  | 'integer'
  | 'string'
  | 'binary'
  | 'array'
  | 'map'
  | 'shape_def'
  | 'shape_ref'
  | 'key_ref'
  | 'str_ref'
  | 'typed_vec'
  | 'row_batch'
  | 'col_batch'
  | 'row_batch_env'
  | 'column_batch_env'
  | 'schema_batch'
  | 'bound_stream'
  | 'schema_object'
  | 'unknown';

export interface ByteSegment {
  start: number;
  end: number;
  kind: SegmentKind;
  label: string;
  stageId?: PipelineStageId;
  meta?: Record<string, unknown>;
}

export interface InternTableEntry {
  id: number;
  value: string;
}

export interface ShapeTableEntry {
  id: number;
  keys: string[];
}

export interface StringInternView {
  originals: string[];
  table: InternTableEntry[];
  references: Array<{ index: number; refId: number | null; literal: string }>;
}

export interface ShapeDetectionView {
  candidates: Array<{
    shapeId: number;
    keys: string[];
    rowCount: number;
    promoted: boolean;
  }>;
}

export interface ColumnHeuristic {
  field: string;
  values: TwilicValue[];
  likelyCodec: string;
  approximate: boolean;
  note: string;
}

export interface BatchTransformView {
  layout: 'ROW_BATCH' | 'COLUMN_BATCH' | 'SCHEMA_BATCH' | 'BOUND_STREAM' | 'DYNAMIC';
  rowCount: number;
  thresholdNote: string;
  rowsPreview: TwilicValue[];
  columns: ColumnHeuristic[];
}

export interface PipelineStage {
  id: PipelineStageId;
  title: string;
  summary: string;
  byteRanges: Array<{ start: number; end: number }>;
  detail?: PipelineStageDetail;
}

export type PipelineStageDetail =
  | { type: 'input'; value: TwilicValue }
  | { type: 'profile'; mode: EncodeMode; messageKind: string }
  | { type: 'shape_detection'; view: ShapeDetectionView }
  | { type: 'shape_tree'; shapes: ShapeTableEntry[] }
  | { type: 'string_interning'; view: StringInternView }
  | { type: 'typed_vector_batch'; view: BatchTransformView }
  | { type: 'binary'; byteLength: number; hexPreview: string };

export interface AnnotationResult {
  segments: ByteSegment[];
  keyTable: InternTableEntry[];
  stringTable: InternTableEntry[];
  shapeTable: ShapeTableEntry[];
  messageKind: string;
  parseError: string | null;
}

export interface ExploreModel {
  mode: EncodeMode;
  input: TwilicValue;
  bytes: Uint8Array;
  annotation: AnnotationResult;
  stages: PipelineStage[];
}
