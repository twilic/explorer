import { Badge } from '@cloudflare/kumo/components/badge';
import { Banner } from '@cloudflare/kumo/components/banner';
import { Code } from '@cloudflare/kumo/components/code';
import { Text } from '@cloudflare/kumo/components/text';
import { InfoIcon } from '@phosphor-icons/react';

import type { PipelineStage } from './pipelineTypes.js';

export interface StageDetailPanelProps {
  stage: PipelineStage;
  parseError: string | null;
}

export function StageDetailPanel({ stage, parseError }: StageDetailPanelProps) {
  const detail = stage.detail;

  return (
    <div className="flex flex-col gap-4">
      {parseError && stage.id === 'binary' && (
        <Banner variant="secondary" title="Partial parse" description={parseError} />
      )}

      {detail?.type === 'input' && (
        <Code
          lang="jsonc"
          code={JSON.stringify(detail.value, null, 2)}
          className="max-h-80 overflow-auto"
        />
      )}

      {detail?.type === 'profile' && (
        <div className="flex flex-wrap gap-2">
          <Badge variant="info">mode: {detail.mode}</Badge>
          <Badge variant="teal">{detail.messageKind}</Badge>
        </div>
      )}

      {detail?.type === 'shape_detection' && (
        <div className="flex flex-col gap-3">
          {detail.view.candidates.length === 0 ? (
            <Text variant="secondary">No homogeneous map-array detected in the input.</Text>
          ) : (
            detail.view.candidates.map((candidate) => (
              <div key={candidate.shapeId} className="ring-kumo-line rounded-lg px-4 py-3 ring">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Text bold as="span">
                    Shape #{candidate.shapeId}
                  </Text>
                  <Badge variant={candidate.promoted ? 'success' : 'neutral'}>
                    {candidate.promoted ? 'promoted' : 'observed'}
                  </Badge>
                  <Badge variant="outline">{candidate.rowCount} rows</Badge>
                </div>
                <ul className="list-inside list-disc">
                  {candidate.keys.map((key) => (
                    <li key={key}>
                      <Text variant="mono" as="span">
                        {key}
                      </Text>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      )}

      {detail?.type === 'shape_tree' && (
        <div className="flex flex-col gap-3">
          {detail.shapes.length === 0 ? (
            <Text variant="secondary">No shapes in this payload.</Text>
          ) : (
            detail.shapes.map((shape) => (
              <div key={shape.id} className="ring-kumo-line rounded-lg px-4 py-3 ring">
                <div className="mb-2">
                  <Badge variant="purple">Shape #{shape.id}</Badge>
                </div>
                <ul className="list-none pl-0">
                  {shape.keys.map((key, index) => (
                    <li key={key} className="pl-4">
                      <Text variant="mono" as="span">
                        {index === shape.keys.length - 1 ? '└─ ' : '├─ '}
                        {key}
                      </Text>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      )}

      {detail?.type === 'string_interning' && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Badge variant="secondary">Original</Badge>
            <Code
              lang="jsonc"
              code={detail.view.originals.map((literal) => JSON.stringify(literal)).join('\n')}
              className="max-h-56 overflow-auto"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Badge variant="secondary">String table</Badge>
            <Code
              lang="jsonc"
              code={detail.view.table
                .map((entry) => `#${entry.id} = ${JSON.stringify(entry.value)}`)
                .join('\n')}
              className="max-h-40 overflow-auto"
            />
            <Badge variant="secondary">References</Badge>
            <Code
              lang="jsonc"
              code={detail.view.references
                .map((ref) => (ref.refId === null ? JSON.stringify(ref.literal) : `#${ref.refId}`))
                .join('\n')}
              className="max-h-40 overflow-auto"
            />
          </div>
        </div>
      )}

      {detail?.type === 'typed_vector_batch' && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="orange">{detail.view.layout}</Badge>
            <Badge variant="outline">{detail.view.rowCount} rows</Badge>
          </div>
          <Text variant="secondary" as="p">
            {detail.view.thresholdNote}
          </Text>
          {detail.view.columns.length > 0 && (
            <>
              <Banner
                icon={<InfoIcon weight="fill" />}
                title="Approximate codec labels"
                description="Column codec names follow public heuristics from the Twilic spec. Exact Rust codec choice is not exposed by the SDK yet."
              />
              <div className="flex flex-col gap-3">
                {detail.view.columns.map((column) => (
                  <div key={column.field} className="ring-kumo-line rounded-lg px-4 py-3 ring">
                    <div className="grid gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Text bold as="span">
                          {column.field}
                        </Text>
                        <Badge variant="teal">{column.likelyCodec}</Badge>
                        {column.approximate && <Badge variant="beta">approx</Badge>}
                      </div>
                      <Text variant="secondary" as="p">
                        {column.note}
                      </Text>
                      <Text variant="mono-secondary" as="p">
                        [{column.values.map(String).join(', ')}]
                      </Text>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          {detail.view.rowsPreview.length > 0 && (
            <div className="flex flex-col gap-2">
              <Badge variant="secondary">ROW preview</Badge>
              <Code
                lang="jsonc"
                code={JSON.stringify(detail.view.rowsPreview, null, 2)}
                className="max-h-56 overflow-auto"
              />
            </div>
          )}
        </div>
      )}

      {detail?.type === 'binary' && (
        <div className="flex flex-col gap-2">
          <Badge variant="success">{detail.byteLength} bytes</Badge>
          <Code lang="bash" code={detail.hexPreview} className="max-h-48 overflow-auto" />
        </div>
      )}
    </div>
  );
}
