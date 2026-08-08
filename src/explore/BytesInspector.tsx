import { Badge } from '@cloudflare/kumo/components/badge';
import { Code } from '@cloudflare/kumo/components/code';
import { Collapsible } from '@cloudflare/kumo/components/collapsible';
import { LayerCard } from '@cloudflare/kumo/components/layer-card';
import { Text } from '@cloudflare/kumo/components/text';

import { formatFullHex } from './annotateDynamic.js';
import type { ExploreModel, PipelineStageId } from './pipelineTypes.js';

export interface BytesInspectorProps {
  model: ExploreModel;
  selectedStageId: PipelineStageId;
}

function isHighlighted(
  offset: number,
  model: ExploreModel,
  selectedStageId: PipelineStageId,
): boolean {
  const stage = model.stages.find((s) => s.id === selectedStageId);
  if (!stage) {
    return false;
  }
  return stage.byteRanges.some((range) => offset >= range.start && offset < range.end);
}

export function BytesInspector({ model, selectedStageId }: BytesInspectorProps) {
  const bytes = model.bytes;
  const lines: Array<{ offset: number; cells: Array<{ byte: number; index: number }> }> = [];

  for (let offset = 0; offset < bytes.byteLength; offset += 16) {
    const chunk = bytes.subarray(offset, Math.min(offset + 16, bytes.byteLength));
    lines.push({
      offset,
      cells: Array.from(chunk, (byte, i) => ({ byte, index: offset + i })),
    });
  }

  const highlightedCount = bytes.reduce((count, _byte, index) => {
    return count + (isHighlighted(index, model, selectedStageId) ? 1 : 0);
  }, 0);

  return (
    <div className="grid min-w-0 gap-3">
      <div className="grid gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="success">{bytes.byteLength} bytes</Badge>
          <Badge variant="orange">{highlightedCount} highlighted</Badge>
          <Badge variant="outline">{selectedStageId}</Badge>
        </div>
        <Text variant="secondary" as="p">
          Highlighted ranges match the selected encoding step.
        </Text>
      </div>
      <LayerCard className="min-w-0 px-4 py-3">
        {lines.length === 0 ? (
          <Text variant="mono-secondary">No bytes</Text>
        ) : (
          <div className="flex flex-col gap-2">
            {lines.map((line) => (
              <div key={line.offset} className="flex items-start gap-3">
                <Text variant="mono-secondary" as="span" DANGEROUS_className="w-10 shrink-0">
                  {line.offset.toString(16).padStart(4, '0')}
                </Text>
                <span className="flex min-w-0 flex-1 flex-wrap gap-x-1.5 gap-y-2">
                  {line.cells.map((cell) => (
                    <Text
                      key={cell.index}
                      variant="mono"
                      as="span"
                      DANGEROUS_className={
                        isHighlighted(cell.index, model, selectedStageId)
                          ? 'bg-kumo-brand/25 text-kumo-strong rounded px-0.5'
                          : 'px-0.5'
                      }
                    >
                      {cell.byte.toString(16).padStart(2, '0')}
                    </Text>
                  ))}
                </span>
              </div>
            ))}
          </div>
        )}
      </LayerCard>
      <Collapsible.Root className="min-w-0">
        <Collapsible.DefaultTrigger>Full hex dump</Collapsible.DefaultTrigger>
        <Collapsible.DefaultPanel className="min-w-0">
          <div className="max-w-full min-w-0 pt-2">
            <Code
              lang="bash"
              code={formatFullHex(bytes)}
              className="max-w-full min-w-0 break-all whitespace-pre-wrap"
            />
          </div>
        </Collapsible.DefaultPanel>
      </Collapsible.Root>
    </div>
  );
}
