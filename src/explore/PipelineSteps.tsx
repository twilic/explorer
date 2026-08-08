import { Badge } from '@cloudflare/kumo/components/badge';
import { Collapsible } from '@cloudflare/kumo/components/collapsible';
import { LayerCard } from '@cloudflare/kumo/components/layer-card';
import { Text } from '@cloudflare/kumo/components/text';
import { CaretDownIcon } from '@phosphor-icons/react';

import { StageDetailPanel } from './StageDetailPanel.js';
import type { PipelineStage, PipelineStageId } from './pipelineTypes.js';

export interface PipelineStepsProps {
  stages: PipelineStage[];
  selectedStageId: PipelineStageId;
  onSelect: (stageId: PipelineStageId) => void;
  parseError: string | null;
}

/**
 * Step list and step detail used to live in separate tabs, forcing a click back and
 * forth on every selection. Expanding the detail inline under the selected step keeps
 * both in view together.
 */
export function PipelineSteps({
  stages,
  selectedStageId,
  onSelect,
  parseError,
}: PipelineStepsProps) {
  return (
    <ol className="flex flex-col gap-2" aria-label="Encoding steps">
      {stages.map((stage, index) => {
        const selected = stage.id === selectedStageId;
        return (
          <li key={stage.id}>
            <LayerCard className={selected ? 'ring-kumo-brand' : undefined}>
              <Collapsible.Root
                open={selected}
                onOpenChange={(open) => {
                  if (open) {
                    onSelect(stage.id);
                  }
                }}
              >
                <Collapsible.Trigger className="hover:bg-kumo-tint flex w-full items-start gap-2 px-4 py-3 text-left">
                  <span className="grid flex-1 gap-1">
                    <span className="flex items-start gap-2">
                      <span className="flex h-lh items-center">
                        <Badge variant={selected ? 'info' : 'neutral'}>{index + 1}</Badge>
                      </span>
                      <Text bold as="span">
                        {stage.title}
                      </Text>
                    </span>
                    <Text variant="secondary" as="span">
                      {stage.summary}
                    </Text>
                  </span>
                  <span className="flex h-lh shrink-0 items-center">
                    <CaretDownIcon
                      size={16}
                      className={`text-kumo-subtle transition-transform ${selected ? 'rotate-180' : ''}`}
                    />
                  </span>
                </Collapsible.Trigger>
                <Collapsible.Panel className="border-kumo-fill border-t px-4 py-3">
                  <div className="w-full">
                    <StageDetailPanel stage={stage} parseError={parseError} />
                  </div>
                </Collapsible.Panel>
              </Collapsible.Root>
            </LayerCard>
          </li>
        );
      })}
    </ol>
  );
}
