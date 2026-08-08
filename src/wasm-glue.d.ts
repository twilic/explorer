declare module '@twilic/wasm-glue' {
  export class SessionEncoder {
    free(): void;
    encodeBatchWithSchemaTransportJson(schema_json: string, values_json: string): Uint8Array;
    encodeBoundStreamTransportJson(schema_json: string, values_json: string): Uint8Array;
    encodeBatchTransportJson(values_json: string): Uint8Array;
    encodeMicroBatchTransportJson(values_json: string): Uint8Array;
    encodePatchTransportJson(value_json: string): Uint8Array;
    encodeTransportJson(value_json: string): Uint8Array;
    encodeWithSchemaTransportJson(schema_json: string, value_json: string): Uint8Array;
    reset(): void;
  }

  export function __wbg_set_wasm(val: WebAssembly.Exports): void;
  export function createSessionEncoder(options_json?: string | null): SessionEncoder;
  export function decodeToTransportJson(bytes: Uint8Array): string;
  export function encodeBatchWithSchemaTransportJson(
    schema_json: string,
    values_json: string,
  ): Uint8Array;
  export function encodeBatchTransportJson(values_json: string): Uint8Array;
  export function encodeBoundStreamTransportJson(
    schema_json: string,
    values_json: string,
  ): Uint8Array;
  export function encodeTransportJson(value_json: string): Uint8Array;
  export function encodeWithSchemaTransportJson(
    schema_json: string,
    value_json: string,
  ): Uint8Array;
}
