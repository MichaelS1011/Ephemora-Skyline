/** The walkable voxel world and its player/camera boundary. */
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { catalogById } from "../catalog";
import { useForgeStore } from "../store";
import { useStore } from "../../stores/useStore";
import { forgeText, nodeLabel, type ForgeLang } from "../i18n";
import type { ForgeGraph } from "../contracts";
import {
  BLOCK_HEIGHT,
  BLOCK_SIZE,
  LEVEL_STEP,
  PLAYER_EYE_HEIGHT,
  collides,
  raycastGrid,
  sweepVertical,
  targetFromHit,
  type BuildTarget,
} from "./targeting";
import { PlayerAvatar } from "./PlayerAvatar";
import { VoxelTerrain } from "./VoxelTerrain";
import {
  applyThirdPersonCamera,
  avatarForward,
  type PlayerLook,
  type PlayerView,
} from "./playerCamera";

const INTERACTIVE_TARGET =
  "button, a[href], summary, input, textarea, select, [contenteditable='true'], [role='button'], [role='link'], [role='menuitem'], [role='option'], [role='tab'], [role='checkbox'], [role='radio'], [role='switch']";

function isTypingOrInteractive(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest(INTERACTIVE_TARGET);
}

function isTextEntry(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      !!target.closest("[contenteditable='true']") ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

const WORLD_UP = new THREE.Vector3(0, 1, 0);

function Controls({
  locked,
  target,
  onLockChange,
  view,
  playerPosition,
  look,
}: {
  locked: boolean;
  target: BuildTarget | null;
  onLockChange: (locked: boolean) => void;
  view: PlayerView;
  playerPosition: RefObject<THREE.Vector3>;
  look: RefObject<PlayerLook>;
}) {
  const { camera, gl } = useThree();
  const graph = useForgeStore((state) => state.graph);
  const phase = useForgeStore((state) => state.phase);
  const keys = useRef<Set<string>>(new Set());
  const previousView = useRef(view);
  const forward = useRef(new THREE.Vector3()).current;
  const right = useRef(new THREE.Vector3()).current;
  const movement = useRef(new THREE.Vector3()).current;

  useEffect(() => {
    if (previousView.current === view) {
      if (view === "first") playerPosition.current.copy(camera.position);
      return;
    }
    previousView.current = view;
    if (view === "first") {
      camera.position.copy(playerPosition.current);
      camera.rotation.set(look.current.pitch, look.current.yaw, 0, "YXZ");
    }
  }, [camera, look, playerPosition, view]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (isTypingOrInteractive(event.target)) return;
      if (event.code === "Enter" && phase === "build" && target && !target.occupied) {
        event.preventDefault();
        useForgeStore.getState().place(target.cell);
      }
      if (event.code === "Delete" && target?.blockId) {
        event.preventDefault();
        useForgeStore.getState().removeNode(target.blockId);
      }
      if (document.pointerLockElement !== gl.domElement) return;
      keys.current.add(event.code);
      if (["KeyW", "KeyA", "KeyS", "KeyD", "Space", "KeyC"].includes(event.code)) {
        event.preventDefault();
      }
    };
    const up = (event: KeyboardEvent) => keys.current.delete(event.code);
    const clearKeys = () => keys.current.clear();
    const change = () => {
      clearKeys();
      onLockChange(document.pointerLockElement === gl.domElement);
    };
    const click = (event: MouseEvent) => {
      if (!target) return;
      if (event.button === 2 && target.blockId) {
        useForgeStore.getState().removeNode(target.blockId);
      } else if (event.button === 0) {
        if (phase === "connect" && target.blockId) {
          useForgeStore.getState().selectNode(target.blockId);
        } else if (phase === "build" && !target.occupied) {
          useForgeStore.getState().place(target.cell);
        }
      }
    };
    const lock = () => {
      const state = useForgeStore.getState();
      if (locked || state.inventoryOpen || state.previewOpen) return;
      try {
        const request = gl.domElement.requestPointerLock?.();
        void Promise.resolve(request).catch(() => onLockChange(false));
      } catch {
        onLockChange(false);
      }
    };
    const wheel = (event: WheelEvent) => {
      if (document.pointerLockElement !== gl.domElement) return;
      event.preventDefault();
      useForgeStore.getState().selectOffset(event.deltaY > 0 ? 1 : -1);
    };
    const context = (event: Event) => event.preventDefault();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clearKeys);
    window.addEventListener("focusin", clearKeys);
    document.addEventListener("pointerlockchange", change);
    gl.domElement.addEventListener("mousedown", click);
    gl.domElement.addEventListener("click", lock);
    gl.domElement.addEventListener("wheel", wheel, { passive: false });
    gl.domElement.addEventListener("contextmenu", context);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clearKeys);
      window.removeEventListener("focusin", clearKeys);
      document.removeEventListener("pointerlockchange", change);
      gl.domElement.removeEventListener("mousedown", click);
      gl.domElement.removeEventListener("click", lock);
      gl.domElement.removeEventListener("wheel", wheel);
      gl.domElement.removeEventListener("contextmenu", context);
    };
  }, [camera, gl, graph, locked, onLockChange, phase, target]);

  useFrame((_, delta) => {
    if (document.pointerLockElement !== gl.domElement) {
      if (view === "third") {
        applyThirdPersonCamera(
          camera,
          playerPosition.current,
          look.current.yaw,
          look.current.pitch,
          graph,
        );
      }
      return;
    }

    const pressed = keys.current;
    const running = pressed.has("ShiftLeft") || pressed.has("ShiftRight");
    const speed = (running ? 10 : 5) * Math.min(delta, 0.05);
    const position = view === "first" ? camera.position : playerPosition.current;
    if (view === "first") camera.getWorldDirection(forward);
    else avatarForward(look.current.yaw, forward);
    forward.y = 0;
    forward.normalize();
    right.crossVectors(forward, WORLD_UP).normalize();
    movement.set(0, 0, 0);
    if (pressed.has("KeyW")) movement.add(forward);
    if (pressed.has("KeyS")) movement.sub(forward);
    if (pressed.has("KeyD")) movement.add(right);
    if (pressed.has("KeyA")) movement.sub(right);
    if (movement.lengthSq() > 0) {
      movement.normalize().multiplyScalar(speed);
      const x = THREE.MathUtils.clamp(position.x + movement.x, -26, 26);
      if (!collides(graph, { x, y: position.y, z: position.z })) {
        position.x = x;
      }
      const z = THREE.MathUtils.clamp(position.z + movement.z, -26, 26);
      if (!collides(graph, { x: position.x, y: position.y, z })) {
        position.z = z;
      }
    }
    const vertical = pressed.has("Space") ? speed : pressed.has("KeyC") ? -speed : 0;
    position.y = THREE.MathUtils.clamp(
      sweepVertical(graph, position, vertical),
      PLAYER_EYE_HEIGHT,
      15.7,
    );

    if (view === "first") playerPosition.current.copy(camera.position);
    else
      applyThirdPersonCamera(
        camera,
        playerPosition.current,
        look.current.yaw,
        look.current.pitch,
        graph,
      );
  });

  return null;
}

function MouseLook({ view, look }: { view: PlayerView; look: RefObject<PlayerLook> }) {
  const { camera, gl } = useThree();
  const arrows = useRef<Set<string>>(new Set());

  useEffect(() => {
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    look.current.yaw = Math.atan2(-direction.x, -direction.z);
    look.current.pitch = Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1));
    const down = (event: KeyboardEvent) => {
      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) return;
      if (isTypingOrInteractive(event.target)) return;
      arrows.current.add(event.code);
      event.preventDefault();
    };
    const up = (event: KeyboardEvent) => arrows.current.delete(event.code);
    const clear = () => arrows.current.clear();
    const move = (event: MouseEvent) => {
      if (document.pointerLockElement !== gl.domElement) return;
      look.current.yaw -= event.movementX * 0.002;
      look.current.pitch = THREE.MathUtils.clamp(
        look.current.pitch - event.movementY * 0.002,
        -1.2,
        1.2,
      );
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    window.addEventListener("focusin", clear);
    document.addEventListener("mousemove", move);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
      window.removeEventListener("focusin", clear);
      document.removeEventListener("mousemove", move);
    };
  }, [camera, gl, look]);

  useFrame((_, delta) => {
    const amount = Math.min(delta, 0.05) * 1.6;
    if (arrows.current.has("ArrowLeft")) look.current.yaw += amount;
    if (arrows.current.has("ArrowRight")) look.current.yaw -= amount;
    if (arrows.current.has("ArrowUp"))
      look.current.pitch = Math.min(1.2, look.current.pitch + amount);
    if (arrows.current.has("ArrowDown"))
      look.current.pitch = Math.max(-1.2, look.current.pitch - amount);
    if (view === "first") camera.rotation.set(look.current.pitch, look.current.yaw, 0, "YXZ");
  });

  return null;
}

function TargetGhost({ onTarget }: { onTarget: (target: BuildTarget | null) => void }) {
  const mesh = useRef<THREE.Mesh>(null);
  const { camera } = useThree();
  const graph = useForgeStore((state) => state.graph);
  const phase = useForgeStore((state) => state.phase);
  const previous = useRef("");

  useFrame(() => {
    if (!mesh.current) return;
    if (phase !== "build") {
      mesh.current.visible = false;
      if (previous.current) {
        previous.current = "";
        onTarget(null);
      }
      return;
    }
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction).normalize();
    const hit = raycastGrid(graph, camera.position, direction);
    const target = hit ? targetFromHit(graph, hit) : null;
    mesh.current.visible = !!target && target.inBounds;
    if (target) {
      mesh.current.position.set(
        target.cell[0],
        target.cell[2] * LEVEL_STEP + BLOCK_HEIGHT / 2,
        target.cell[1],
      );
      const material = mesh.current.material as THREE.MeshBasicMaterial;
      material.color.set(target.occupied ? "#F7768E" : "#9ECE6A");
    }
    const key = target ? `${target.cell.join(":")}:${target.blockId ?? ""}:${target.occupied}` : "";
    if (key !== previous.current) {
      previous.current = key;
      onTarget(target);
    }
  });

  return (
    <mesh ref={mesh} visible={false} raycast={() => null}>
      <boxGeometry args={[BLOCK_SIZE, BLOCK_HEIGHT, BLOCK_SIZE]} />
      <meshBasicMaterial color="#9ECE6A" transparent opacity={0.28} depthWrite={false} />
    </mesh>
  );
}

function Blocks({ graph }: { graph: ForgeGraph }) {
  const phase = useForgeStore((state) => state.phase);
  const selectedNodeId = useForgeStore((state) => state.selectedNodeId);
  const selectNode = useForgeStore((state) => state.selectNode);
  const lang = useStore((state) => state.prefs.lang);
  const edgePositions = useMemo(() => {
    const positions: number[] = [];
    for (const edge of graph.edges) {
      const from = graph.nodes.find((node) => node.id === edge.from);
      const to = graph.nodes.find((node) => node.id === edge.to);
      if (!from || !to) continue;
      positions.push(
        from.cell[0],
        (from.cell[2] ?? 0) * LEVEL_STEP + BLOCK_HEIGHT / 2,
        from.cell[1],
        to.cell[0],
        (to.cell[2] ?? 0) * LEVEL_STEP + BLOCK_HEIGHT / 2,
        to.cell[1],
      );
    }
    return new Float32Array(positions);
  }, [graph]);

  return (
    <group>
      {graph.edges.length > 0 && (
        <lineSegments>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[edgePositions, 3]} />
          </bufferGeometry>
          <lineBasicMaterial color="#7DCFFF" transparent opacity={0.75} />
        </lineSegments>
      )}
      {graph.nodes.map((node) => {
        const level = node.cell[2] ?? 0;
        const selected = node.id === selectedNodeId;
        return (
          <mesh
            key={node.id}
            position={[node.cell[0], level * LEVEL_STEP + 0.55, node.cell[1]]}
            castShadow
            onClick={(event) => {
              event.stopPropagation();
              if (phase === "connect") selectNode(node.id);
            }}
          >
            <boxGeometry args={[BLOCK_SIZE, BLOCK_HEIGHT, BLOCK_SIZE]} />
            <meshStandardMaterial
              color={node.color}
              roughness={0.58}
              emissive={selected ? node.color : "#000000"}
              emissiveIntensity={selected ? 0.45 : 0}
            />
            {selected && (
              <mesh scale={1.08}>
                <boxGeometry args={[BLOCK_SIZE, BLOCK_HEIGHT, BLOCK_SIZE]} />
                <meshBasicMaterial color="#F2EFE8" wireframe transparent opacity={0.8} />
              </mesh>
            )}
            <Html
              center
              distanceFactor={11}
              position={[0, 0.1, BLOCK_SIZE / 2 + 0.04]}
              style={{ pointerEvents: "none" }}
            >
              <span className="forge-block-label">
                {catalogById(node.catalogId)?.name[lang] ?? nodeLabel(node, lang)}
              </span>
            </Html>
          </mesh>
        );
      })}
    </group>
  );
}

/** Exported for a DOM-free world test and for use by the HUD. */
export function blockSummary(graph: ForgeGraph, lang: ForgeLang = "en"): string {
  return graph.nodes
    .map((node) => catalogById(node.catalogId)?.name[lang] ?? nodeLabel(node, lang))
    .join(", ");
}

export function VoxelWorld() {
  const graph = useForgeStore((state) => state.graph);
  const lang = useStore((state) => state.prefs.lang);
  const [locked, setLocked] = useState(false);
  const [target, setTarget] = useState<BuildTarget | null>(null);
  const [view, setView] = useState<PlayerView>("first");
  const playerPosition = useRef(new THREE.Vector3(0, PLAYER_EYE_HEIGHT, 5.5));
  const look = useRef<PlayerLook>({ yaw: 0, pitch: 0 });
  const toggleView = useCallback(
    () => setView((current) => (current === "first" ? "third" : "first")),
    [],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.code !== "F5" ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        isTextEntry(event.target)
      )
        return;
      event.preventDefault();
      if (!event.repeat) toggleView();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleView]);
  const targetNode = target?.blockId
    ? graph.nodes.find((node) => node.id === target.blockId)
    : undefined;
  const targetText = target
    ? forgeText(lang, "world.target", {
        x: target.cell[0],
        z: target.cell[1],
        level: target.cell[2],
      })
    : forgeText(lang, "world.outOfReach");
  const targetLabel = target
    ? targetNode
      ? forgeText(lang, "world.targetBlock", {
          target: targetText,
          block: nodeLabel(targetNode, lang, catalogById(targetNode.catalogId)?.name),
        })
      : targetText
    : forgeText(lang, "world.outOfReach");

  return (
    <div
      className="forge-world"
      data-testid="forge-world"
      data-view={view}
      aria-label={forgeText(lang, "world.aria")}
    >
      <Canvas
        camera={{ position: [0, PLAYER_EYE_HEIGHT, 5.5], fov: 68 }}
        dpr={[1, 1.5]}
        shadows
        onCreated={({ gl }) => {
          gl.domElement.tabIndex = 0;
          gl.domElement.setAttribute("aria-label", forgeText(lang, "world.canvas"));
        }}
      >
        <ambientLight intensity={1.25} />
        <directionalLight position={[8, 14, 6]} intensity={1.8} castShadow />
        <VoxelTerrain />
        <Blocks graph={graph} />
        <MouseLook view={view} look={look} />
        <TargetGhost onTarget={setTarget} />
        <PlayerAvatar view={view} playerPosition={playerPosition} look={look} />
        <Controls
          locked={locked}
          target={target}
          onLockChange={setLocked}
          view={view}
          playerPosition={playerPosition}
          look={look}
        />
      </Canvas>
      <button
        type="button"
        className="forge-view-toggle"
        data-testid="forge-view-toggle"
        aria-pressed={view === "third"}
        onClick={toggleView}
      >
        {forgeText(lang, "world.viewToggle")} <kbd>F5</kbd>
      </button>
      <div className="forge-crosshair" aria-hidden="true" />
      <div className="forge-world-readout forge-pointer-state" aria-live="polite">
        <strong>{targetLabel}</strong>
        <span>{forgeText(lang, locked ? "world.locked" : "world.unlocked")}</span>
      </div>
    </div>
  );
}
