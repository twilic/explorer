import { lazy, Suspense, useMemo, useState } from 'react';
import { Banner } from '@cloudflare/kumo/components/banner';
import { Button } from '@cloudflare/kumo/components/button';
import { Empty } from '@cloudflare/kumo/components/empty';
import { Field } from '@cloudflare/kumo/components/field';
import { InputArea } from '@cloudflare/kumo/components/input';
import { LayerCard } from '@cloudflare/kumo/components/layer-card';
import { Loader } from '@cloudflare/kumo/components/loader';
import { Tabs } from '@cloudflare/kumo/components/tabs';
import { Text } from '@cloudflare/kumo/components/text';
import { CubeFocusIcon, WarningCircleIcon } from '@phosphor-icons/react';
import type { TwilicValue } from '@twilic/core/advanced';

import { buildPipeline } from './explore/buildPipeline.js';
import { BytesInspector } from './explore/BytesInspector.js';
import { defaultExploreJson, exploreFixtures, userRecordSchema } from './explore/fixtures.js';
import { encodeForMode, modeLabel } from './explore/encodeForMode.js';
import { PipelineSteps } from './explore/PipelineSteps.js';
import type { EncodeMode, PipelineStageId } from './explore/pipelineTypes.js';
import {
  formatSchemaText,
  parseSchemaText,
  schemaFitsPayload,
  schemaForPayload,
  usesBoundSchema,
} from './explore/schemaInput.js';
import { parseUserPayloadText } from './userPayloadText.js';

const Pipeline3DView = lazy(async () => {
  const module = await import('./explore/Pipeline3DView.js');
  return { default: module.Pipeline3DView };
});

export interface ExplorePageProps {
  ready: boolean;
}

const encodeModes: EncodeMode[] = ['dynamic', 'batch', 'schema_batch', 'bound_stream'];

type InspectorTab = 'input' | 'steps' | 'bytes';

function toTwilicValue(raw: unknown): TwilicValue {
  return raw as TwilicValue;
}

export function ExplorePage({ ready }: ExplorePageProps) {
  const [jsonText, setJsonText] = useState(defaultExploreJson);
  const [schemaText, setSchemaText] = useState(() => formatSchemaText(userRecordSchema));
  const [mode, setMode] = useState<EncodeMode>('batch');
  const [selectedStageId, setSelectedStageId] = useState<PipelineStageId>('input');
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('steps');

  const { model, error: exploreError } = useMemo(() => {
    if (!ready) {
      return { model: null, error: null as string | null };
    }
    try {
      const input = toTwilicValue(parseUserPayloadText(jsonText));
      const schema = usesBoundSchema(mode) ? parseSchemaText(schemaText) : userRecordSchema;
      const bytes = encodeForMode(mode, input, schema);
      return { model: buildPipeline(mode, input, bytes), error: null };
    } catch (cause) {
      return {
        model: null,
        error: cause instanceof Error ? cause.message : String(cause),
      };
    }
  }, [jsonText, schemaText, mode, ready]);

  const selectedStage =
    model?.stages.find((stage) => stage.id === selectedStageId) ?? model?.stages[0];

  const applySchemaForValue = (value: unknown) => {
    setSchemaText(formatSchemaText(schemaForPayload(toTwilicValue(value), userRecordSchema)));
  };

  const inferSchemaFromPayload = () => {
    try {
      applySchemaForValue(parseUserPayloadText(jsonText));
    } catch {
      // Keep the current schema when the payload is not valid JSON yet.
    }
  };

  const applyFixture = (fixtureId: string) => {
    const fixture = exploreFixtures.find((item) => item.id === fixtureId);
    if (!fixture) {
      return;
    }
    setJsonText(JSON.stringify(fixture.value, null, 2));
    setSchemaText(
      formatSchemaText(fixture.schema ?? schemaForPayload(fixture.value, userRecordSchema)),
    );
    setMode(fixture.defaultMode);
    setSelectedStageId('input');
    setInspectorTab('steps');
  };

  const handleModeChange = (nextMode: EncodeMode) => {
    setMode(nextMode);
    if (!usesBoundSchema(nextMode)) {
      return;
    }
    try {
      const input = toTwilicValue(parseUserPayloadText(jsonText));
      try {
        const current = parseSchemaText(schemaText);
        if (!schemaFitsPayload(current, input)) {
          applySchemaForValue(input);
        }
      } catch {
        applySchemaForValue(input);
      }
    } catch {
      // Keep the current schema when the payload is not valid JSON yet.
    }
  };

  const handleSelectStage = (stageId: PipelineStageId) => {
    setSelectedStageId(stageId);
    setInspectorTab('steps');
  };

  return (
    <div className="absolute inset-0 flex flex-col sm:flex-row">
      <div className="relative min-h-0 flex-1">
        {!ready ? (
          <div className="bg-kumo-base flex h-full items-center justify-center">
            <Empty
              size="sm"
              icon={<CubeFocusIcon size={40} />}
              title="Loading WASM"
              description="The encoding runtime is initializing."
            />
          </div>
        ) : exploreError ? (
          <div className="bg-kumo-base flex h-full flex-col items-center justify-center gap-3 p-6">
            <Banner
              icon={<WarningCircleIcon weight="fill" />}
              variant="error"
              title="Could not explore payload"
              description={exploreError}
            />
            {usesBoundSchema(mode) && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  inferSchemaFromPayload();
                  setInspectorTab('input');
                }}
              >
                Infer schema from payload
              </Button>
            )}
          </div>
        ) : (
          <Suspense
            fallback={
              <div className="bg-kumo-base flex h-full items-center justify-center gap-2">
                <Loader size="sm" />
                <Text variant="secondary">Loading 3D view…</Text>
              </div>
            }
          >
            <Pipeline3DView
              model={model}
              selectedStageId={selectedStage?.id ?? 'input'}
              onSelect={handleSelectStage}
            />
          </Suspense>
        )}
      </div>

      <aside className="border-kumo-fill bg-kumo-base flex h-72 shrink-0 flex-col border-t sm:h-full sm:w-104 sm:border-t-0 sm:border-l">
        <div className="shrink-0 p-3 pb-0">
          <Tabs
            variant="segmented"
            size="base"
            className="w-full"
            listClassName="w-full"
            value={inspectorTab}
            onValueChange={(value) => {
              setInspectorTab(value as InspectorTab);
            }}
            tabs={[
              { value: 'input', label: 'Input', className: 'flex-1 justify-center' },
              { value: 'steps', label: 'Steps', className: 'flex-1 justify-center' },
              { value: 'bytes', label: 'Bytes', className: 'flex-1 justify-center' },
            ]}
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
          {inspectorTab === 'input' && (
            <div className="flex flex-col gap-4">
              <LayerCard className="px-5 py-4">
                <Field label="Demo">
                  <div className="flex flex-wrap gap-2">
                    {exploreFixtures.map((fixture) => (
                      <Button
                        key={fixture.id}
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          applyFixture(fixture.id);
                        }}
                      >
                        {fixture.label}
                      </Button>
                    ))}
                  </div>
                </Field>
              </LayerCard>
              <LayerCard className="px-5 py-4">
                <Field label="Payload" description="Root object, array, or JSONL.">
                  <InputArea
                    value={jsonText}
                    onChange={(event) => {
                      setJsonText(event.target.value);
                    }}
                    rows={8}
                    className="font-mono"
                    aria-label="Input JSON"
                  />
                </Field>
              </LayerCard>
              <LayerCard className="px-5 py-4">
                <Field label="Encoding mode">
                  <Tabs
                    variant="segmented"
                    size="base"
                    className="w-full"
                    listClassName="w-full"
                    value={mode}
                    onValueChange={(value) => {
                      handleModeChange(value as EncodeMode);
                    }}
                    tabs={encodeModes.map((item) => ({
                      value: item,
                      label: modeLabel(item),
                      className: 'flex-1 justify-center',
                    }))}
                  />
                </Field>
              </LayerCard>
              {usesBoundSchema(mode) && (
                <LayerCard className="px-5 py-4">
                  <Field
                    label="Schema"
                    description="JSON schema for Schema and Bound. Accepts logicalType or the schema-example.json field shape."
                  >
                    <div className="flex flex-col gap-2">
                      <InputArea
                        value={schemaText}
                        onChange={(event) => {
                          setSchemaText(event.target.value);
                        }}
                        rows={10}
                        className="font-mono"
                        aria-label="Schema JSON"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={inferSchemaFromPayload}
                      >
                        Infer from payload
                      </Button>
                    </div>
                  </Field>
                </LayerCard>
              )}
            </div>
          )}

          {inspectorTab === 'steps' && (
            <div className="flex flex-col gap-3">
              {!ready && <Text variant="secondary">Waiting for WASM…</Text>}
              {ready && exploreError && (
                <div className="flex flex-col gap-2">
                  <Banner
                    variant="error"
                    title="Could not explore payload"
                    description={exploreError}
                  />
                  {usesBoundSchema(mode) && (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        inferSchemaFromPayload();
                        setInspectorTab('input');
                      }}
                    >
                      Infer schema from payload
                    </Button>
                  )}
                </div>
              )}
              {ready && model && (
                <PipelineSteps
                  stages={model.stages}
                  selectedStageId={selectedStage?.id ?? 'input'}
                  onSelect={handleSelectStage}
                  parseError={model.annotation.parseError}
                />
              )}
              {ready && !model && !exploreError && (
                <Empty
                  size="sm"
                  title="No pipeline yet"
                  description="Enter valid JSON to build encoding steps."
                />
              )}
            </div>
          )}

          {inspectorTab === 'bytes' && (
            <div className="min-w-0">
              {model && selectedStage ? (
                <BytesInspector model={model} selectedStageId={selectedStage.id} />
              ) : (
                <Empty
                  size="sm"
                  title="No bytes"
                  description="Encode a valid payload to inspect the wire format."
                />
              )}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
