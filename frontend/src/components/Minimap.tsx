'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '../stores/useStore';
import { getDirLayout } from '../city/layout';
import { languageColor, ENV, SEVERITY_COLOR } from '../city/palette';

/**
 * City map — shows the CURRENT semantic-zoom level with the REAL camera
 * position and heading (the old minimap had a decorative static arrow).
 * Click anywhere to fly there.
 */

const MAP_SIZE = 190;
const PADDING = 12;

export function Minimap({ show = true }: { show?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cityData = useStore((s) => s.cityData);
  const focusPath = useStore((s) => s.focusPath);
  const cameraInfo = useStore((s) => s.cameraInfo);
  const requestFly = useStore((s) => s.requestFly);

  useEffect(() => {
    if (!show || !cityData) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const layout = getDirLayout(cityData, focusPath);
    const extent = Math.max(layout.bounds + 8, 20);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = MAP_SIZE * dpr;
    canvas.height = MAP_SIZE * dpr;
    ctx.scale(dpr, dpr);

    const toX = (x: number): number => PADDING + ((x + extent) / (extent * 2)) * (MAP_SIZE - PADDING * 2);
    const toY = (z: number): number => PADDING + ((z + extent) / (extent * 2)) * (MAP_SIZE - PADDING * 2);

    ctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE);
    ctx.fillStyle = 'rgba(8, 11, 22, 0.85)';
    ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);

    // blocks with their skyline towers
    for (const b of layout.blocks) {
      const x = toX(b.x - b.w / 2);
      const y = toY(b.z - b.d / 2);
      const w = Math.max(3, (b.w / (extent * 2)) * (MAP_SIZE - PADDING * 2));
      const h = Math.max(3, (b.d / (extent * 2)) * (MAP_SIZE - PADDING * 2));
      const alarm = b.dir.findingsBySeverity.P0 > 0;
      ctx.fillStyle = alarm ? 'rgba(255,46,77,0.14)' : 'rgba(90,120,180,0.16)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = alarm ? SEVERITY_COLOR.P0 : 'rgba(120,160,220,0.55)';
      ctx.strokeRect(x, y, w, h);
      // representative skyline towers
      for (const t of b.skyline) {
        const tx = toX(b.x + t.x);
        const ty = toY(b.z + t.z);
        ctx.fillStyle = languageColor(t.file.language);
        ctx.fillRect(tx - 1.2, ty - 1.2, 2.4, 2.4);
        if (t.file.threatLevel === 'critical') {
          ctx.strokeStyle = SEVERITY_COLOR.P0;
          ctx.strokeRect(tx - 2.6, ty - 2.6, 5.2, 5.2);
        }
      }
    }

    // buildings
    for (const b of layout.buildings) {
      const x = toX(b.x);
      const y = toY(b.z);
      ctx.fillStyle = languageColor(b.file.language);
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
      if (b.file.threatLevel === 'critical') {
        ctx.strokeStyle = SEVERITY_COLOR.P0;
        ctx.strokeRect(x - 3, y - 3, 6, 6);
      }
    }

    // podium
    if (layout.podium) {
      const x = toX(layout.podium.x);
      const y = toY(layout.podium.z);
      ctx.strokeStyle = 'rgba(140,160,200,0.6)';
      ctx.strokeRect(x - 2.5, y - 2.5, 5, 5);
    }

    // REAL camera position + heading
    const cx = toX(cameraInfo.x);
    const cy = toY(cameraInfo.z);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-cameraInfo.angle + Math.PI);
    ctx.fillStyle = ENV.selection;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.4, 4.4);
    ctx.lineTo(0, 2);
    ctx.lineTo(-4.4, 4.4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }, [show, cityData, focusPath, cameraInfo]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!cityData) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const layout = getDirLayout(cityData, focusPath);
      const extent = Math.max(layout.bounds + 8, 20);
      const worldX = ((px - PADDING) / (MAP_SIZE - PADDING * 2)) * extent * 2 - extent;
      const worldZ = ((py - PADDING) / (MAP_SIZE - PADDING * 2)) * extent * 2 - extent;
      requestFly(worldX, worldZ, layout.bounds * 1.1);
    },
    [cityData, focusPath, requestFly],
  );

  if (!show) return null;

  return (
    <div
      className="absolute bottom-4 right-4 z-10"
      style={{ background: 'rgba(5, 8, 20, 0.85)', border: '1px solid rgba(0,255,159,0.2)', backdropFilter: 'blur(4px)', padding: 4 }}
    >
      <div className="font-mono text-[9px] tracking-widest mb-1 px-0.5" style={{ color: 'rgba(0,255,159,0.5)' }}>
        CITY MAP {focusPath.length > 0 ? `· /${focusPath.join('/')}` : '· OVERVIEW'}
      </div>
      <canvas
        ref={canvasRef}
        width={MAP_SIZE}
        height={MAP_SIZE}
        style={{ width: MAP_SIZE, height: MAP_SIZE, cursor: 'crosshair', display: 'block' }}
        onClick={handleClick}
        aria-label="City minimap — click to fly"
      />
    </div>
  );
}
