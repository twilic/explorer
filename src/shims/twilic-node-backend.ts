/** Stub: N-API loader is omitted from browser builds (explorer uses WASM only). */
export function loadNodeBackend(): never {
  throw new Error('twilic: N-API backend is not available in this bundle');
}
