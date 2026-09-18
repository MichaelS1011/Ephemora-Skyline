'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { CityScene } from './components/CityScene';
import { Landing } from './components/Landing';
import { InfoPanel } from './components/InfoPanel';
import { SearchBar } from './components/SearchBar';
import { AnalyzePanel } from './components/AnalyzePanel';
import { KeyboardHints } from './components/KeyboardHints';
import { LoadingScreen } from './components/LoadingScreen';
import { Tooltip } from './components/Tooltip';
import { ScanSummary } from './components/ScanSummary';
import { Minimap } from './components/Minimap';
import { HudOverlay } from './components/HudOverlay';
import { Breadcrumbs } from './components/Breadcrumbs';
import { SecurityTour } from './components/SecurityTour';
import { CoachMarks } from './components/CoachMarks';
import { ActionBar } from './components/ActionBar';
import { ContextCard } from './components/ContextCard';
import { useStore } from './stores';
import { getDirLayout } from './city/layout';
import type { CityData } from './city/types';

export default function App() {
  const cityData = useStore((s) => s.cityData);
  const setCityData = useStore((s) => s.setCityData);
  const resetFocus = useStore((s) => s.resetFocus);
  const setIsLoading = useStore((s) => s.setIsLoading);
  const selectedUnit = useStore((s) => s.selectedUnit);
  const setSelectedUnit = useStore((s) => s.setSelectedUnit);
  const navigateToFile = useStore((s) => s.navigateToFile);

  const [apiStatus, setApiStatus] = useState<'connecting' | 'live' | 'demo'>('connecting');
  const [showKeyboardHints, setShowKeyboardHints] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  const canvasWrapperRef = useRef<HTMLDivElement | null>(null);

  // ── City loading: only ?city=<id> permalinks auto-load. A fresh visit
  // lands on the empty world (the Landing hero), never a prebuilt city. ────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cityId = params.get('city');
    if (!cityId) {
      setApiStatus('demo');
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    (async (): Promise<void> => {
      try {
        const res = await fetch(`/api/result/${encodeURIComponent(cityId)}/city`, {
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as CityData;
        if (!cancelled) {
          setCityData(data);
          setApiStatus('live');
        }
      } catch {
        // Permalink expired (in-memory store) — land on the empty world
        if (!cancelled) setApiStatus('demo');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setCityData, setIsLoading]);

  // Establishing shot whenever a new city arrives
  useEffect(() => {
    if (cityData) resetFocus();
  }, [cityData, resetFocus]);

  // ── Mouse position for the tooltip ───────────────────────────────────────
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent): void => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // ── Keyboard navigation ──────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      if (e.key === 'Escape') {
        if (showKeyboardHints) {
          setShowKeyboardHints(false);
          return;
        }
        if (selectedUnit) {
          setSelectedUnit(null);
          canvasWrapperRef.current?.focus();
          return;
        }
        return;
      }

      if (e.key === '?' && !isInput) {
        e.preventDefault();
        setShowKeyboardHints((v) => !v);
        return;
      }

      if (e.key === '/' && !isInput && cityData) {
        e.preventDefault();
        const searchInput = document.querySelector<HTMLInputElement>('input[aria-label="Search buildings"]');
        searchInput?.focus();
        return;
      }

      // Tab / Shift+Tab — walk the buildings of the current level
      if (e.key === 'Tab' && !isInput && cityData) {
        e.preventDefault();
        const layout = getDirLayout(cityData, useStore.getState().focusPath);
        if (layout.buildings.length === 0) return;
        const currentId = selectedUnit?.kind === 'file' ? selectedUnit.id : null;
        const currentIndex = currentId ? layout.buildings.findIndex((b) => b.file.id === currentId) : -1;
        const nextIndex = e.shiftKey
          ? (currentIndex <= 0 ? layout.buildings.length - 1 : currentIndex - 1)
          : (currentIndex >= layout.buildings.length - 1 ? 0 : currentIndex + 1);
        const next = layout.buildings[nextIndex];
        if (next) navigateToFile(next.file.id);
      }
    },
    [showKeyboardHints, selectedUnit, setSelectedUnit, cityData, navigateToFile],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const inCity = cityData !== null;

  return (
    <div className="w-full h-screen relative bg-[#0b1026]">
      <LoadingScreen isVisible={useStore((s) => s.isLoading)} />

      {/* 3D world — empty at first, city rises into it */}
      <div
        ref={canvasWrapperRef}
        tabIndex={-1}
        aria-label="3D city visualization"
        role="application"
        className="w-full h-full outline-none"
        style={{ outline: 'none' }}
      >
        <Canvas
          camera={{ position: [0, 100, 150], fov: 52, near: 0.5, far: 1600 }}
          dpr={[1, 1.75]}
          gl={{ antialias: true, preserveDrawingBuffer: true }}
        >
          <CityScene />
          <EffectComposer enableNormalPass={false}>
            <Bloom luminanceThreshold={0.55} intensity={0.55} mipmapBlur />
          </EffectComposer>
        </Canvas>
      </div>

      {/* Landing hero — only on the empty world */}
      {!inCity && <Landing />}

      {/* ── In-city UI ──────────────────────────────────────────────────── */}
      {inCity && (
        <>
          <div className="absolute inset-0 pointer-events-none">
            <HudOverlay apiStatus={apiStatus} />

            <div className="absolute top-2 right-4 z-30 pointer-events-auto">
              <AnalyzePanel />
            </div>

            <div className="absolute top-[54px] left-1/2 -translate-x-1/2 pointer-events-auto z-20">
              <SearchBar />
            </div>

            <InfoPanel />
            <ScanSummary />
            <SecurityTour />
            <ActionBar />
            <ContextCard />
            <Minimap show />
            <CoachMarks />

            <div className="absolute bottom-16 left-4 pointer-events-auto z-20">
              <button
                onClick={() => setShowKeyboardHints((v) => !v)}
                aria-label="Toggle keyboard shortcuts (press ? key)"
                aria-expanded={showKeyboardHints}
                aria-controls="keyboard-hints-overlay"
                className="font-mono text-[10px] text-[#445566] hover:text-[#00d4ff] transition-colors
                           focus:outline-none focus:ring-1 focus:ring-[#00d4ff] rounded px-1 py-0.5"
              >
                [?] shortcuts
              </button>
            </div>
          </div>

          <Breadcrumbs />
        </>
      )}

      <div id="keyboard-hints-overlay">
        <KeyboardHints isOpen={showKeyboardHints} onClose={() => setShowKeyboardHints(false)} />
      </div>

      <Tooltip mousePosition={mousePosition} />
    </div>
  );
}
