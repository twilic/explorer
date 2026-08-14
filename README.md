# Twilic Explorer

**Suggested GitHub repository description:** Interactive visual explorer for understanding how Twilic transforms and encodes structured data.

Browser explorer built with **Vite**, **React**, and [**Cloudflare Kumo**](https://kumo-ui.com/). Explore how Twilic transforms structured data into compact binary representations.

Size tables and schema-first codec comparisons live in the [playground](https://github.com/twilic/playground) — this app is the visual pipeline explorer only.

The workspace is:

1. **Full-bleed 3D** — encoding pipeline fills the viewport (no card chrome); byte cubes are colored by transform stage.
2. **Inspect panel** — right-side tabs for **Input** / **Steps** / **Bytes** (demo fixtures, mode, step detail, hex inspector).

Encoding steps:

1. **Input JSON** — paste or pick a demo fixture
2. **Dynamic profile** — Dynamic, Batch, `SCHEMA_BATCH`, or `BOUND_STREAM`
3. **Shape detection** — homogeneous map-array candidates
4. **Shape tree** — field keys registered as `shape_def`
5. **String interning** — literals vs string table references
6. **Batch / typed vector** — ROW vs COLUMN layout and approximate column codecs
7. **Binary** — final bytes with a highlighted hex inspector

Click any 3D node or step to drill down. Byte ranges for the selected step are highlighted in the inspector.

Encoding uses `@twilic/core/advanced` (WASM). Intermediate stage tables are reconstructed from the wire format and input JSON; exact Rust codec-explain APIs are not exposed by the SDK yet — batch codec labels are marked approximate.

This project always depends on a **local sibling** [`twilic-js`](https://github.com/twilic/twilic-js) checkout via `file:../twilic-js` (not the published npm package), so the explorer tracks your latest TypeScript and WASM build.

## Features

- **Demo fixtures** — repeated strings, single user shape, small role batch, and [schema-example.json](https://github.com/twilic/twilic/blob/main/examples/schema-example.json) style `UserRecordV1` records (×3).
- **Custom JSON** — paste or edit a root object `{…}`, array `[…]`, or JSONL; the pipeline rebuilds when the payload is valid.
- **Encoding modes** — Dynamic, Batch, `SCHEMA_BATCH`, and `BOUND_STREAM` via segmented controls.
- **Bound schema** — Schema and Bound modes use an editable JSON schema. Demos infer a matching schema; scalar arrays are wrapped as a single `value` field. You can also paste `schema-example.json` field names (`type`, `enum`, `range`).
- **Step inspector** — expandable step list with inline detail (shapes, string table, batch heuristics, hex preview).
- **Bytes view** — stage-highlighted hex cells plus a full hex dump with ASCII.
- **3D pipeline** — Three.js byte field; hover shows offset/label, click selects the owning stage.
- **WASM runtime** — encoding runs in the browser via `@twilic/core/advanced` with `init({ prefer: 'wasm' })`; Node N-API is not bundled.

## Stack

| Layer    | Choice                                                                                 |
| -------- | -------------------------------------------------------------------------------------- |
| UI       | [@cloudflare/kumo](https://kumo-ui.com/) + [Tailwind CSS v4](https://tailwindcss.com/) |
| App      | React 19, TypeScript, Vite 8 (Rolldown), Three.js                                      |
| Encoding | Local `twilic-js` (WASM)                                                               |

## Prerequisites

- Node.js **≥ 24**
- [pnpm](https://pnpm.io/) **10.18.1** (see `packageManager` in `package.json`)
- Cloned next to `twilic-js`:

```text
your-workspace/
  twilic-js/     # https://github.com/twilic/twilic-js
  twilic-rust/   # required when building twilic-js (bridge path dependency)
  explorer/      # this repo
```

Build WASM and TypeScript in `twilic-js` before running the explorer:

```bash
cd ../twilic-js
pnpm install
pnpm build:wasm
pnpm build:ts
```

For a full `twilic-js` setup from a clean tree, follow that repository’s README (Rust, `wasm-pack`).

## Commands

```bash
cd explorer
pnpm install
pnpm sync-wasm     # mirrors ../twilic-js/wasm/pkg → wasm/pkg (also runs before dev/build)
pnpm dev           # http://localhost:5173
pnpm build         # production build (bundled WASM in dist/assets/)
pnpm preview       # preview the production build locally
pnpm test          # Vitest
pnpm lint          # ESLint
pnpm format        # Prettier
```

### GitHub Pages (`base` URL)

Project sites are served from `https://<user>.github.io/<repo>/`. Vite’s `base` is set when **`GITHUB_PAGES=true`** at build time (see `vite.config.ts`). Production JS and WASM chunks use hashed names under `dist/assets/` and honor that base path.

## GitHub Pages deployment

1. In the repository **Settings → Pages**, set **Source** to **GitHub Actions**.
2. Push to `main`, or run **Actions → Deploy GitHub Pages** manually.

The workflow (`.github/workflows/github-pages.yml`) checks out this repo, clones [`twilic/twilic-js`](https://github.com/twilic/twilic-js) and [`twilic/twilic-rust`](https://github.com/twilic/twilic-rust) beside the workspace (same layout as twilic-js CI), builds **WASM + TypeScript** there, then installs and builds this app. Deployed Pages therefore track the latest **`twilic-js` default branch**, not the npm registry.

## Limitations

- Intermediate stage tables are **reconstructed** from the wire format and input JSON; the SDK does not yet expose exact Rust codec-explain APIs.
- Batch / column codec labels in the step detail are **approximate** (public heuristics from the Twilic spec) and marked as such in the UI.
- Size tables and cross-codec comparisons are intentionally out of scope here — use the [playground](https://github.com/twilic/playground).

## Implementation notes

- `scripts/sync-twilic-wasm.mjs` (via **`pnpm sync-wasm`**, **`predev`**, **`prebuild`**, and a matching Vite **`buildStart`** hook) copies `../twilic-js/wasm/pkg` into **`wasm/pkg/`** (gitignored) so wasm imports resolve inside this workspace.
- **`vite.config.ts`** sets **`assetsInclude`** for `*.wasm` so Rolldown can bundle wasm-pack’s `import '*.wasm'`. Without bundling, serving raw bindings from `/public` often breaks under **`pnpm preview`** (MIME / module errors in Chromium).
- **`build.rolldownOptions.output.codeSplitting`** splits vendor chunks (React, Kumo, Three.js, Twilic) to keep the main bundle under Vite’s size warning threshold.
- **`src/shims/`** substitutes browser-safe backends so the client bundle excludes Node-only N-API loaders and `.node` binaries.
- WASM loads via `twilic_wasm_bg.wasm?url` + manual `instantiateStreaming` with `{ './twilic_wasm_bg.js': glue }` (not `twilic_wasm.js` or bare `?init`): Rolldown/`?init` omit wasm-bindgen JS imports and break initialization.
- The 3D view is code-split (`React.lazy`) so the Inspect panel can load before Three.js finishes downloading.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
