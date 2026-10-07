"use client";

import { useEffect, useMemo, useRef } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { BlockPlacement } from "../city/layout";
import { ENV, SEVERITY_COLOR } from "../city/palette";
import { reducedSettle } from "../city/motion";
import { claimHover, easeGlow, inkOpacity, releaseHover } from "../interaction/hover";
import { FOOTPRINT_EDGES, makeInkMaterial } from "../interaction/hoverInk";
import { useStore } from "../stores/useStore";
import { Building } from "./Building";

/**
 * A district — a BUILT plot: curb, nameplate and a skyline of up to six
 * real towers (the subtree's most at-risk + largest files). Clicking the
 * plot dives in: the full neighbourhood opens underneath the camera.
 *
 * The plot answers the pointer. Before the hover contract existed, moving onto
 * a district changed the world by -0.03 luminance (measured, 240 px field):
 * the cursor went to a hand and a tooltip appeared, and nothing here did. The
 * plot now draws the same ink cut line a file building does, its curb firms
 * up, and the towers standing on it light individually — they are real files,
 * and "which of these is this one" is a question a reader asks.
 */

export interface DistrictProps {
  placement: BlockPlacement;
  /** Epoch ms when this district's plot opens. */
  appearAt: number;
  /**
   * Epoch ms per skyline tower, in `placement.skyline` order — the city-wide
   * build schedule hands each tower its own slot, so a district fills up
   * one building at a time instead of appearing as a finished clump.
   */
  skylineAt: number[];
  constructing: boolean;
}

export function District({ placement, appearAt, skylineAt, constructing }: DistrictProps) {
  const drillIn = useStore((s) => s.drillIn);
  const setHoveredId = useStore((s) => s.setHoveredId);

  const { dir, x, z, w, d, skyline } = placement;
  const hasP0 = dir.findingsBySeverity.P0 > 0;

  const curbColor = hasP0 ? ENV.windowAlarm : "#3a4a68";
  /** Emissive level of the curb at rest and under the pointer. */
  const curbBase = useMemo(() => (hasP0 ? 1.1 : 0.3), [hasP0]);
  const blockId = `block:${dir.path}`;

  // Etappe K review: single-click drill-in stays. Districts are large — the
  // flight IS the point (unlike buildings, where a click only selects and a
  // double-click flies). drillIn frames the district via flyToDirOverview;
  // with the new camera duration logic that flight shortens automatically.
  // No selectBuilding equivalent needed: the click never selected a file.
  const handleClick = (e: { stopPropagation: () => void }): void => {
    e.stopPropagation();
    drillIn(dir.name);
  };

  // One token for the whole plot: the curb, the podium marker and the towers
  // all stand for the same district, so they claim and release together and
  // the tooltip never blinks while the pointer travels across them.
  const ownerRef = useRef<object>({ block: dir.path });
  const hoverTargetRef = useRef(0);
  const hoverGlowRef = useRef(0);

  const handleOver = (e: { stopPropagation: () => void }): void => {
    e.stopPropagation();
    hoverTargetRef.current = 1;
    claimHover(ownerRef.current, blockId, setHoveredId);
  };

  const handleOut = (): void => {
    hoverTargetRef.current = 0;
    releaseHover(ownerRef.current, setHoveredId);
  };

  // A district that unmounts under the pointer (drill-in re-render, filter
  // change) must not leave the cursor claimed.
  useEffect(() => {
    return () => {
      if (hoverTargetRef.current === 1) releaseHover(ownerRef.current, setHoveredId);
    };
  }, [setHoveredId]);

  // The curb is one material for all four stones (it used to be four fresh
  // materials per render of the district), so the hover can write it.
  const curbMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: curbColor,
        emissive: curbColor,
        emissiveIntensity: curbBase,
        roughness: 0.7,
      }),
    [curbColor, curbBase],
  );
  useEffect(() => () => curbMaterial.dispose(), [curbMaterial]);
  const inkMaterial = useMemo(() => makeInkMaterial(), []);
  useEffect(() => () => inkMaterial.dispose(), [inkMaterial]);
  const inkRef = useRef<THREE.LineSegments>(null);

  const groupRef = useRef<THREE.Group>(null);
  const riseSettledRef = useRef({ current: false });

  // Construction / drill-in rise + the pointer's answer
  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    // Reduced motion skips the rise: the district is placed at full height once
    // and the tween never runs, so nothing is left half-built on screen.
    const settled = reducedSettle(riseSettledRef.current, () => {
      g.scale.y = 1;
      g.visible = true;
    });
    if (!settled) {
      if (!constructing) {
        if (g.scale.y !== 1) g.scale.y = 1;
        g.visible = true;
      } else {
        const now = Date.now();
        if (now < appearAt) {
          g.visible = false;
        } else {
          g.visible = true;
          const k = Math.min(1, (now - appearAt) / 550);
          const ease = 1 - Math.pow(1 - k, 3);
          g.scale.y = Math.max(0.001, ease);
        }
      }
    }

    // The hover ease runs outside the rise branch: reduced motion removes the
    // travel, not the information — `easeGlow` lands it in one frame instead.
    // Only while something is moving, so a city nobody points at writes nothing.
    if (hoverTargetRef.current > 0 || hoverGlowRef.current > 0) {
      const next = easeGlow(hoverGlowRef.current, hoverTargetRef.current);
      hoverGlowRef.current = next;
      curbMaterial.emissiveIntensity = curbBase + next * 0.5;
      inkMaterial.opacity = inkOpacity(next);
      if (inkRef.current) inkRef.current.visible = next > 0.02;
    }
  });

  return (
    <group ref={groupRef} position={[x, 0, z]}>
      {/* Plot — dark asphalt lot */}
      <mesh
        position={[0, 0.09, 0]}
        onClick={handleClick}
        onPointerOver={handleOver}
        onPointerOut={handleOut}
      >
        <boxGeometry args={[w + 2.4, 0.18, d + 2.4]} />
        <meshStandardMaterial color={ENV.plot} roughness={0.95} />
      </mesh>

      {/* Curb — subtle frame; alarm-red when P0 lives inside */}
      {(
        [
          [0, -d / 2 - 1.1, w + 2.8, 0],
          [0, d / 2 + 1.1, w + 2.8, 0],
          [-w / 2 - 1.1, 0, 0, d + 2.8],
          [w / 2 + 1.1, 0, 0, d + 2.8],
        ] as Array<[number, number, number, number]>
      ).map(([ex, ez, ew, ed], i) => (
        <mesh key={i} position={[ex, 0.16, ez]} material={curbMaterial}>
          <boxGeometry args={[ew || 0.3, 0.22, ed || 0.3]} />
        </mesh>
      ))}

      {/* The pointer's cut line around the plot — same contract as a building */}
      <lineSegments
        ref={inkRef}
        geometry={FOOTPRINT_EDGES}
        material={inkMaterial}
        position={[0, 0.24, 0]}
        scale={[w + 2.9, 1, d + 2.9]}
        visible={false}
        raycast={() => null}
      />

      {/* The skyline — real buildings of this subtree. They stand for files
          that have no plaza on this level, so they answer the pointer (seam,
          cursor, tooltip) but leave the click to the plot underneath. */}
      {skyline.map((b, i) => (
        <Building
          key={b.file.id}
          file={b.file}
          x={b.x}
          z={b.z}
          w={b.w}
          d={b.d}
          h={b.h}
          interactive={false}
          hoverOnly
          hoverId={blockId}
          appearAt={skylineAt[i] ?? appearAt}
          constructing={constructing}
        />
      ))}

      {/* Podium marker — files not individually rendered */}
      {dir.remainingFiles > 0 && (
        <group position={[w / 2 - 1.4, 0, d / 2 - 1.4]}>
          <mesh
            position={[0, 0.5, 0]}
            onClick={handleClick}
            onPointerOver={handleOver}
            onPointerOut={handleOut}
          >
            <boxGeometry args={[2.2, 1, 2.2]} />
            <meshStandardMaterial color={ENV.curb} roughness={0.9} />
          </mesh>
          <mesh position={[0, 1.06, 0]}>
            <boxGeometry args={[2.3, 0.08, 2.3]} />
            <meshStandardMaterial
              color={ENV.plotEdge}
              emissive={ENV.plotEdge}
              emissiveIntensity={0.35}
            />
          </mesh>
          <Html center distanceFactor={44} position={[0, 1.7, 0]} zIndexRange={[8, 0]}>
            <div
              style={{
                fontFamily: "'JetBrains Mono', ui-monospace, Menlo, monospace",
                fontSize: 11,
                color: "var(--meta-strong)",
                background: "#121210",
                border: "1px solid rgba(90,120,180,0.35)",
                borderRadius: 3,
                padding: "1px 5px",
                whiteSpace: "nowrap",
                pointerEvents: "none",
              }}
            >
              +{dir.remainingFiles}
            </div>
          </Html>
        </group>
      )}

      {/* Nameplate — a street sign at the plot edge, not a floating label */}
      <Html center distanceFactor={52} position={[0, 0.6, d / 2 + 2.2]} zIndexRange={[8, 0]}>
        <div
          style={{
            fontFamily: "'JetBrains Mono', ui-monospace, Menlo, monospace",
            fontSize: 12,
            color: hasP0 ? "#ffb3bc" : "#a9bbdd",
            background: "#121210",
            border: `1px solid ${hasP0 ? "rgba(255,46,77,0.5)" : "rgba(90,120,180,0.4)"}`,
            borderRadius: 3,
            padding: "2px 7px",
            whiteSpace: "nowrap",
            pointerEvents: "none",
            textAlign: "center",
          }}
        >
          {dir.name}
          {hasP0 && <span style={{ color: SEVERITY_COLOR.P0, marginLeft: 5 }}>●</span>}
          <span style={{ opacity: 0.7, marginLeft: 6, fontSize: 11 }}>{dir.fileCount}</span>
        </div>
      </Html>
    </group>
  );
}
