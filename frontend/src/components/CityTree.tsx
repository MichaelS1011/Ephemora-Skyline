'use client';

import { useEffect, useMemo, useState } from 'react';
import { Html } from '@react-three/drei';
import { useStore } from '../stores/useStore';
import { getDirLayout, landmarkFileId } from '../city/layout';
import { ENV } from '../city/palette';
import { RoadSystem } from './RoadSystem';
import { District } from './District';
import { Building } from './Building';
import { CityConnections } from './CityConnections';

/**
 * Renders the visible semantic-zoom level. Every level is a REAL city:
 * districts are built plots with skylines (representative towers), the
 * level's own files are full buildings on the central plaza. Repo size
 * changes drill depth — never the amount on screen.
 */
export function CityTree() {
  const cityData = useStore((s) => s.cityData);
  const focusPath = useStore((s) => s.focusPath);
  const threatFilter = useStore((s) => s.threatFilter);
  const buildPhase = useStore((s) => s.buildPhase);
  const buildStartedAt = useStore((s) => s.buildStartedAt);
  const setConstructionProgress = useStore((s) => s.setConstructionProgress);

  const layout = useMemo(
    () => (cityData ? getDirLayout(cityData, focusPath) : null),
    [cityData, focusPath],
  );
  const landmarkId = useMemo(() => (cityData ? landmarkFileId(cityData) : null), [cityData]);

  // Short rise animation whenever a new level is entered (drill in/out)
  const [levelBornAt, setLevelBornAt] = useState(0);
  const [entering, setEntering] = useState(false);
  useEffect(() => {
    if (!cityData) return;
    setLevelBornAt(Date.now());
    setEntering(true);
    const t = setTimeout(() => setEntering(false), 950);
    return () => clearTimeout(t);
  }, [focusPath, cityData]);

  const constructing = buildPhase === 'constructing' && layout !== null;
  const animating = (constructing || entering) && layout !== null;
  const unitTotal = layout ? layout.blocks.length + layout.buildings.length + (layout.podium ? 1 : 0) : 0;
  const step = constructing
    ? Math.min(420, Math.max(110, 3400 / Math.max(unitTotal, 1)))
    : entering
      ? 55
      : 0;
  const animBase = constructing ? buildStartedAt + 700 : levelBornAt;

  // Build director: reports progress, flips to 'built' when done
  useEffect(() => {
    if (!constructing || step === 0) return;
    setConstructionProgress(0, unitTotal);
    const interval = setInterval(() => {
      const done = Math.min(unitTotal, Math.max(0, Math.floor((Date.now() - buildStartedAt) / step)));
      useStore.getState().setConstructionProgress(done, unitTotal);
      if (done >= unitTotal) {
        clearInterval(interval);
        setTimeout(() => useStore.getState().setBuildPhase('built'), 450);
      }
    }, 110);
    return () => clearInterval(interval);
  }, [constructing, step, unitTotal, buildStartedAt, setConstructionProgress]);

  if (!cityData || !layout) return null;

  const isRoot = focusPath.length === 0;
  const blockAppear = (i: number): number => animBase + i * step;
  const buildingAppear = (i: number): number => animBase + (layout.blocks.length + i) * step;
  const podiumAppear = animBase + unitTotal * step;

  const fileDimmed = (fileId: string): boolean => {
    if (threatFilter === 'all') return false;
    const b = layout.buildings.find((x) => x.file.id === fileId);
    if (!b) return false;
    return !b.file.findings.some((v) => v.severity === threatFilter);
  };

  const podiumVisible = !animating || Date.now() >= podiumAppear;

  return (
    <group>
      <RoadSystem layout={layout} />

      {/* Districts — built plots with skylines */}
      {layout.blocks.map((b, i) => (
        <District
          key={b.dir.path}
          placement={b}
          appearAt={blockAppear(i)}
          constructing={animating}
        />
      ))}

      {/* This level's own files on the central plaza */}
      {layout.buildings.map((b, i) => (
        <Building
          key={b.file.id}
          file={b.file}
          x={b.x}
          z={b.z}
          w={b.w}
          d={b.d}
          h={b.h}
          isLandmark={b.file.id === landmarkId}
          dimmed={fileDimmed(b.file.id)}
          appearAt={buildingAppear(i)}
          constructing={animating}
        />
      ))}

      {/* Podium — honest aggregate of files not rendered as buildings */}
      {layout.podium && podiumVisible && (
        <group position={[layout.podium.x, 0, layout.podium.z]}>
          <mesh position={[0, 0.5, 0]}>
            <boxGeometry args={[3.4, 1, 3.4]} />
            <meshStandardMaterial color="#1a2130" roughness={0.9} />
          </mesh>
          <mesh position={[0, 1.12, 0]}>
            <boxGeometry args={[3.4, 0.08, 3.4]} />
            <meshStandardMaterial color={ENV.plotEdge} emissive={ENV.plotEdge} emissiveIntensity={0.4} />
          </mesh>
          <Html center distanceFactor={40} position={[0, 1.9, 0]} zIndexRange={[8, 0]}>
            <div
              style={{
                fontFamily: "'JetBrains Mono', ui-monospace, Menlo, monospace",
                fontSize: 10,
                color: '#8fa3c4',
                background: 'rgba(6, 9, 20, 0.75)',
                border: '1px solid rgba(90,120,180,0.35)',
                borderRadius: 3,
                padding: '2px 6px',
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
              }}
            >
              +{layout.podium.count} more files
            </div>
          </Html>
        </group>
      )}

      {/* Import arcs connect once the district stands */}
      <CityConnections
        layout={layout}
        fileConnections={cityData.fileConnections}
        dirConnections={cityData.dirConnections}
        showDirArcs={isRoot && buildPhase === 'built'}
        showFileArcs={buildPhase === 'built'}
      />
    </group>
  );
}
