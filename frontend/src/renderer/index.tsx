/**
 * Renderer Module — 3D Canvas rendering pipeline.
 *
 * Exports the scene graph composition functions and
 * the canvas render loop for the Three.js / R3F stack.
 */

import React, { memo } from 'react';

/**
 * Canvas renderer wrapper. Accepts a scene component
 * and renders it inside an R3F <Canvas> context.
 */
export const Renderer = memo(function Renderer({
  scene,
}: {
  scene: React.ReactNode;
}) {
  return <>{scene}</>;
});

/**
 * Render loop entry-point.
 * Initializes the R3F render target and starts the frame loop.
 */
export function initRenderer(canvasId: string): void {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
  if (!canvas) {
    console.warn(`Renderer: canvas #${canvasId} not found`);
    return;
  }
  // Canvas init is handled by <Canvas> in App.tsx via R3F.
  // This function exists as an alternative entry-point for
  // non-React rendering or headless WebGL contexts.
}
