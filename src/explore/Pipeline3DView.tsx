import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { LayerCard } from '@cloudflare/kumo/components/layer-card';
import { Text } from '@cloudflare/kumo/components/text';
import * as THREE from 'three';

import type { ByteSegment, ExploreModel, PipelineStageId } from './pipelineTypes.js';

export interface Pipeline3DViewProps {
  model: ExploreModel | null;
  selectedStageId: PipelineStageId;
  onSelect: (stageId: PipelineStageId) => void;
}

const STAGE_COLORS: Record<PipelineStageId, number> = {
  input: 0x3b82f6,
  profile: 0x6366f1,
  shape_detection: 0x8b5cf6,
  shape_tree: 0xa855f7,
  string_interning: 0xd946ef,
  typed_vector_batch: 0xf59e0b,
  binary: 0x10b981,
};

/** Bytes that don't belong to a specific transform stage (raw scalars, array/map markers, …). */
const VALUE_COLOR = 0x64748b;
const CONNECTOR_COLOR = 0x94a3b8;

const LEGEND: Array<{ id: PipelineStageId | 'value'; label: string; color: number }> = [
  { id: 'profile', label: 'Profile', color: STAGE_COLORS.profile },
  { id: 'shape_detection', label: 'Shape detection', color: STAGE_COLORS.shape_detection },
  { id: 'shape_tree', label: 'Shape tree', color: STAGE_COLORS.shape_tree },
  { id: 'string_interning', label: 'String interning', color: STAGE_COLORS.string_interning },
  { id: 'typed_vector_batch', label: 'Batch / vector', color: STAGE_COLORS.typed_vector_batch },
  { id: 'value', label: 'Raw value / structure', color: VALUE_COLOR },
];

interface ByteClass {
  stageId: PipelineStageId | null;
  label: string;
  color: number;
}

interface HoveredByte {
  offset: number;
  label: string;
  stageId: PipelineStageId | null;
}

const COLS = 16;
const SPACING = 0.52;
const CUBE_SIZE = 0.4;
const POP = 0.55;

/**
 * For each byte offset, picks the smallest annotation segment that covers it (most
 * specific) to color the block, and the smallest segment that also owns a pipeline
 * stage (segments nest, so the stage owner can be a larger ancestor segment).
 */
function classifyBytes(model: ExploreModel): ByteClass[] {
  const segments = model.annotation.segments;
  const length = model.bytes.byteLength;
  const result: ByteClass[] = new Array(length);

  for (let offset = 0; offset < length; offset += 1) {
    let best: ByteSegment | null = null;
    let bestLen = Number.POSITIVE_INFINITY;
    let bestWithStage: ByteSegment | null = null;
    let bestWithStageLen = Number.POSITIVE_INFINITY;

    for (const segment of segments) {
      if (offset < segment.start || offset >= segment.end) {
        continue;
      }
      const len = segment.end - segment.start;
      if (len < bestLen) {
        best = segment;
        bestLen = len;
      }
      if (segment.stageId && len < bestWithStageLen) {
        bestWithStage = segment;
        bestWithStageLen = len;
      }
    }

    const stageId = bestWithStage?.stageId ?? null;
    result[offset] = {
      stageId,
      label: best?.label ?? `byte ${offset}`,
      color: stageId ? STAGE_COLORS[stageId] : VALUE_COLOR,
    };
  }

  return result;
}

export function Pipeline3DView({ model, selectedStageId, onSelect }: Pipeline3DViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  const selectedStageIdRef = useRef(selectedStageId);
  const applySelectionRef = useRef<(stageId: PipelineStageId) => void>(() => {});
  const [hoveredByte, setHoveredByte] = useState<HoveredByte | null>(null);

  const syncOnSelect = useEffectEvent((handler: (stageId: PipelineStageId) => void) => {
    onSelectRef.current = handler;
  });

  useEffect(() => {
    syncOnSelect(onSelect);
  }, [onSelect]);

  useEffect(() => {
    selectedStageIdRef.current = selectedStageId;
    applySelectionRef.current(selectedStageId);
  }, [selectedStageId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !model) {
      return;
    }
    const host = container;

    const byteCount = model.bytes.byteLength;
    const cols = Math.min(COLS, Math.max(1, byteCount));
    const rows = Math.max(1, Math.ceil(byteCount / cols));
    const gridWidth = (cols - 1) * SPACING;
    const gridHeight = (rows - 1) * SPACING;
    const maxExtent = Math.max(gridWidth, gridHeight, 2);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111827);
    scene.fog = new THREE.Fog(0x111827, maxExtent * 2, maxExtent * 5);

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
    const target = new THREE.Vector3(0, 0, 0);
    const distance = Math.max(6, maxExtent * 1.3);
    let yaw = 0.35;
    const pitch = 0.16;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    host.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 1));
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(5, 9, 7);
    key.castShadow = true;
    scene.add(key);
    scene.add(new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 0.55));

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(Math.max(16, maxExtent * 2.2), 64),
      new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.9,
        metalness: 0.05,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(target.x, target.y - gridHeight / 2 - 1.1, 0);
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new THREE.GridHelper(Math.max(18, maxExtent * 2.4), 18, 0x334155, 0x1f2937);
    grid.position.set(target.x, target.y - gridHeight / 2 - 1.05, 0);
    scene.add(grid);

    const pipeline = new THREE.Group();
    pipeline.position.copy(target);
    scene.add(pipeline);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    let instancedMesh: THREE.InstancedMesh | null = null;
    let classifications: ByteClass[] = [];
    let lastHoverIndex = -1;

    if (byteCount > 0) {
      classifications = classifyBytes(model);

      const positions: THREE.Vector3[] = new Array(byteCount);
      for (let i = 0; i < byteCount; i += 1) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        positions[i] = new THREE.Vector3(
          col * SPACING - gridWidth / 2,
          gridHeight / 2 - row * SPACING,
          0,
        );
      }

      const geometry = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
      const material = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.2 });
      const mesh = new THREE.InstancedMesh(geometry, material, byteCount);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      const tempObject = new THREE.Object3D();
      const tempColor = new THREE.Color();
      for (let i = 0; i < byteCount; i += 1) {
        tempObject.position.copy(positions[i]);
        tempObject.updateMatrix();
        mesh.setMatrixAt(i, tempObject.matrix);
        tempColor.setHex(classifications[i].color);
        mesh.setColorAt(i, tempColor);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) {
        mesh.instanceColor.needsUpdate = true;
      }

      pipeline.add(mesh);
      instancedMesh = mesh;

      // Hex-offset row labels down the left edge, like a hex dump turned into a wall.
      const labelStep = rows <= 16 ? 1 : Math.ceil(rows / 16);
      for (let row = 0; row < rows; row += labelStep) {
        const offset = row * cols;
        const y = gridHeight / 2 - row * SPACING;
        const label = makeOffsetLabel(offset.toString(16).padStart(4, '0'));
        label.position.set(-gridWidth / 2 - 0.85, y, 0);
        pipeline.add(label);
      }

      // Faint connector plane behind the wall ties it back to a "sheet of bytes" reading.
      const backdrop = new THREE.Mesh(
        new THREE.PlaneGeometry(gridWidth + SPACING * 2, gridHeight + SPACING * 2),
        new THREE.MeshBasicMaterial({
          color: CONNECTOR_COLOR,
          transparent: true,
          opacity: 0.05,
          depthWrite: false,
        }),
      );
      backdrop.position.set(0, 0, -CUBE_SIZE);
      pipeline.add(backdrop);
    }

    function applySelection(stageId: PipelineStageId) {
      if (!instancedMesh) {
        return;
      }
      const stage = model!.stages.find((s) => s.id === stageId);
      const ranges = stage?.byteRanges ?? [];
      const inSelection = (offset: number) =>
        ranges.some((range) => offset >= range.start && offset < range.end);

      const tempObject = new THREE.Object3D();
      const color = new THREE.Color();
      const base = new THREE.Color();

      for (let i = 0; i < byteCount; i += 1) {
        const selected = inSelection(i);
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = col * SPACING - gridWidth / 2;
        const y = gridHeight / 2 - row * SPACING;

        tempObject.position.set(x, y, selected ? POP : 0);
        tempObject.scale.setScalar(selected ? 1.22 : 1);
        tempObject.updateMatrix();
        instancedMesh.setMatrixAt(i, tempObject.matrix);

        base.setHex(classifications[i].color);
        color.copy(base);
        if (selected) {
          color.lerp(new THREE.Color(0xffffff), 0.5);
        }
        instancedMesh.setColorAt(i, color);
      }

      instancedMesh.instanceMatrix.needsUpdate = true;
      if (instancedMesh.instanceColor) {
        instancedMesh.instanceColor.needsUpdate = true;
      }
    }

    applySelectionRef.current = applySelection;
    applySelection(selectedStageIdRef.current);

    let frame = 0;
    let dragging = false;
    let lastX = 0;

    function resize() {
      const width = host.clientWidth || 1;
      const height = host.clientHeight || 1;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, true);
    }

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);

    function updateCamera() {
      camera.position.x = target.x + Math.sin(yaw) * Math.cos(pitch) * distance;
      camera.position.y = target.y + Math.sin(pitch) * distance;
      camera.position.z = target.z + Math.cos(yaw) * Math.cos(pitch) * distance;
      camera.lookAt(target);
    }

    function animate() {
      frame = requestAnimationFrame(animate);
      if (!dragging) {
        yaw += 0.0009;
      }
      updateCamera();
      renderer.render(scene, camera);
    }
    animate();

    function setPointerFromEvent(event: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    }

    function pickByte(): number | null {
      if (!instancedMesh) {
        return null;
      }
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObject(instancedMesh, false);
      const hit = hits[0];
      if (!hit || hit.instanceId === undefined) {
        return null;
      }
      return hit.instanceId;
    }

    function onPointerDown(event: PointerEvent) {
      dragging = true;
      lastX = event.clientX;
      renderer.domElement.setPointerCapture(event.pointerId);
    }

    function onPointerMove(event: PointerEvent) {
      if (dragging) {
        const dx = event.clientX - lastX;
        lastX = event.clientX;
        yaw -= dx * 0.005;
        return;
      }
      setPointerFromEvent(event);
      const index = pickByte();
      if (index === lastHoverIndex) {
        return;
      }
      lastHoverIndex = index ?? -1;
      if (index === null) {
        setHoveredByte(null);
        return;
      }
      const cls = classifications[index];
      setHoveredByte({ offset: index, label: cls.label, stageId: cls.stageId });
    }

    function onPointerUp(event: PointerEvent) {
      dragging = false;
      renderer.domElement.releasePointerCapture(event.pointerId);
    }

    function onPointerLeave() {
      dragging = false;
      lastHoverIndex = -1;
      setHoveredByte(null);
    }

    function onClick(event: PointerEvent) {
      setPointerFromEvent(event);
      const index = pickByte();
      if (index === null) {
        return;
      }
      const stageId = classifications[index].stageId ?? 'binary';
      onSelectRef.current(stageId);
    }

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointerleave', onPointerLeave);
    renderer.domElement.addEventListener('click', onClick);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      renderer.domElement.removeEventListener('click', onClick);
      instancedMesh?.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === host) {
        host.removeChild(renderer.domElement);
      }
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) {
          const meshLike = object as THREE.Mesh | THREE.Sprite;
          if ('geometry' in meshLike && meshLike.geometry) {
            meshLike.geometry.dispose();
          }
          const materials = Array.isArray(meshLike.material)
            ? meshLike.material
            : [meshLike.material];
          for (const material of materials) {
            if (material instanceof THREE.SpriteMaterial && material.map) {
              material.map.dispose();
            }
            material.dispose();
          }
        }
      });
    };
  }, [model]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div ref={containerRef} className="absolute inset-0" />

      <LayerCard className="absolute top-4 left-4 z-10 w-56">
        <LayerCard.Secondary>Encoding stage</LayerCard.Secondary>
        <LayerCard.Primary className="gap-0.5 px-2 py-2">
          {LEGEND.map((entry) => {
            const active = entry.id === selectedStageId;
            const clickable = entry.id !== 'value';
            const row = (
              <>
                <span className="flex h-lh items-center">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: hexToCss(entry.color) }}
                  />
                </span>
                <Text as="span" bold={active} variant={active ? undefined : 'secondary'}>
                  {entry.label}
                </Text>
              </>
            );

            if (!clickable) {
              return (
                <div key={entry.id} className="flex items-start gap-2 rounded-md px-2 py-1.5">
                  {row}
                </div>
              );
            }

            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => {
                  onSelectRef.current(entry.id as PipelineStageId);
                }}
                className={`hover:bg-kumo-tint flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left ${
                  active ? 'bg-kumo-tint' : ''
                }`}
              >
                {row}
              </button>
            );
          })}
        </LayerCard.Primary>
      </LayerCard>

      {hoveredByte && (
        <LayerCard className="pointer-events-none absolute bottom-4 left-4 z-10 px-4 py-3">
          <Text variant="mono">
            byte 0x{hoveredByte.offset.toString(16).padStart(4, '0')} · {hoveredByte.label}
          </Text>
        </LayerCard>
      )}
    </div>
  );
}

function hexToCss(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

function makeOffsetLabel(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 80;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(203, 213, 225, 0.75)';
    ctx.font = '600 40px ui-monospace, SFMono-Regular, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width - 8, canvas.height / 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.85, 0.27, 1);
  return sprite;
}
