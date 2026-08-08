import type {
  RuntimeBackend,
  RuntimeSessionEncoder,
  TransportValueObj,
} from '../../../twilic-js/dist/runtime/types.js';

import wasmUrl from '../../wasm/pkg/twilic_wasm_bg.wasm?url';
import * as wasmGlue from '@twilic/wasm-glue';
import {
  __wbg_set_wasm,
  createSessionEncoder as wasmCreateSessionEncoder,
  decodeToTransportJson,
  encodeBatchWithSchemaTransportJson,
  encodeBatchTransportJson,
  encodeBoundStreamTransportJson,
  encodeTransportJson,
  encodeWithSchemaTransportJson,
  type SessionEncoder as WasmSessionEncoder,
} from '@twilic/wasm-glue';

/** Module name baked into the wasm-bindgen artifact (see twilic_wasm_bg.wasm imports). */
const WASM_GLUE_MODULE = './twilic_wasm_bg.js';

/**
 * WASM entry is duplicated under `explorer/wasm/pkg` by Vite (see `vite.config.ts`) so
 * `import '*.wasm'` is resolved inside this project—required for Rolldown; **do not** load that
 * tree raw from `/public` (MIME / module graph breaks under `pnpm preview`).
 *
 * Do not use `twilic_wasm.js` (Rolldown passes a URL to `__wbg_set_wasm`) or bare `?init`
 * (Vite omits wasm-bindgen JS imports). Instantiate with the glue namespace, then
 * `__wbg_set_wasm(exports)`.
 */
export async function loadWasmBackend(wasmInput?: unknown): Promise<RuntimeBackend> {
  void wasmInput;
  const exports = await instantiateTwilicWasm();
  __wbg_set_wasm(exports);

  return {
    kind: 'wasm',
    encodeTransportJson: (valueJson) => encodeTransportJson(valueJson),
    decodeToTransportJson: (bytes) => decodeToTransportJson(bytes),
    decodeToCompactJson: (bytes) => decodeToTransportJson(bytes),
    encodeWithSchemaTransportJson: (schemaJson, valueJson) =>
      encodeWithSchemaTransportJson(schemaJson, valueJson),
    encodeBatchTransportJson: (valuesJson) => encodeBatchTransportJson(valuesJson),
    encodeBoundStreamTransportJson: (schemaJson, valuesJson) =>
      encodeBoundStreamTransportJson(schemaJson, valuesJson),
    encodeBatchWithSchemaTransportJson: (schemaJson, valuesJson) =>
      encodeBatchWithSchemaTransportJson(schemaJson, valuesJson),
    encodeDirect: (value) => encodeTransportJson(JSON.stringify(value)),
    decodeDirect: (bytes) => JSON.parse(decodeToTransportJson(bytes)) as TransportValueObj,
    encodeBatchDirect: (values) => encodeBatchTransportJson(JSON.stringify(values)),
    encodeCompactJson: (json) => encodeTransportJson(json),
    encodeBatchCompactJson: (json) => encodeBatchTransportJson(json),
    createSessionEncoder: (optionsJson) => {
      const inner = wasmCreateSessionEncoder(optionsJson);
      return wrapSessionEncoder(inner);
    },
  };
}

function buildGlueImports(wasmBytes: ArrayBuffer): WebAssembly.ModuleImports {
  // wasm-bindgen hashes suffixes per build; never hardcode them (CI vs local drift breaks Pages).
  const module = new WebAssembly.Module(wasmBytes);
  const glue: WebAssembly.ModuleImports = {};

  for (const imp of WebAssembly.Module.imports(module)) {
    if (imp.module !== WASM_GLUE_MODULE || imp.kind !== 'function') {
      continue;
    }
    const fn = (wasmGlue as Record<string, unknown>)[imp.name];
    if (typeof fn !== 'function') {
      throw new Error(
        `Missing wasm-bindgen glue export "${imp.name}". Run pnpm build:wasm in twilic-js, then pnpm build here.`,
      );
    }
    glue[imp.name] = fn as WebAssembly.ImportValue;
  }

  return glue;
}

async function instantiateTwilicWasm(): Promise<WebAssembly.Exports> {
  const response = await fetch(wasmUrl);
  const bytes = await response.arrayBuffer();
  const imports: WebAssembly.Imports = {
    [WASM_GLUE_MODULE]: buildGlueImports(bytes),
  };

  const { instance } = await WebAssembly.instantiate(bytes, imports);
  return instance.exports;
}

function wrapSessionEncoder(inner: WasmSessionEncoder): RuntimeSessionEncoder {
  return {
    encodeTransportJson: (valueJson) => inner.encodeTransportJson(valueJson),
    encodeWithSchemaTransportJson: (schemaJson, valueJson) =>
      inner.encodeWithSchemaTransportJson(schemaJson, valueJson),
    encodeBatchTransportJson: (valuesJson) => inner.encodeBatchTransportJson(valuesJson),
    encodeBoundStreamTransportJson: (schemaJson, valuesJson) =>
      inner.encodeBoundStreamTransportJson(schemaJson, valuesJson),
    encodeBatchWithSchemaTransportJson: (schemaJson, valuesJson) =>
      inner.encodeBatchWithSchemaTransportJson(schemaJson, valuesJson),
    encodePatchTransportJson: (valueJson) => inner.encodePatchTransportJson(valueJson),
    encodeMicroBatchTransportJson: (valuesJson) => inner.encodeMicroBatchTransportJson(valuesJson),
    encodeDirect: (value) => inner.encodeTransportJson(JSON.stringify(value)),
    encodeBatchDirect: (values) => inner.encodeBatchTransportJson(JSON.stringify(values)),
    encodePatchDirect: (value) => inner.encodePatchTransportJson(JSON.stringify(value)),
    encodeMicroBatchDirect: (values) => inner.encodeMicroBatchTransportJson(JSON.stringify(values)),
    encodeCompactJson: (json) => inner.encodeTransportJson(json),
    encodeBatchCompactJson: (json) => inner.encodeBatchTransportJson(json),
    encodePatchCompactJson: (json) => inner.encodePatchTransportJson(json),
    encodeMicroBatchCompactJson: (json) => inner.encodeMicroBatchTransportJson(json),
    reset: () => inner.reset(),
  };
}
