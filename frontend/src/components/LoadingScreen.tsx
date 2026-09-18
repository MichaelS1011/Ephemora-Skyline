'use client';

import { useState, useEffect } from 'react';

interface BootLine {
  text: string;
  delay: number; // ms delay before this line appears
}

const BOOT_LINES: BootLine[] = [
  { text: '> INITIALIZING CODECITY CYBERDEFENSE...', delay: 200 },
  { text: '> CONNECTING TO GRID...', delay: 900 },
  { text: '> LOADING CITY MATRIX...', delay: 1600 },
  { text: '> READY', delay: 2400 },
];

interface LoadingScreenProps {
  isVisible: boolean;
}

export function LoadingScreen({ isVisible }: LoadingScreenProps) {
  const [visibleLines, setVisibleLines] = useState<number[]>([]);
  const [isFadingOut, setIsFadingOut] = useState(false);

  // Show lines one by one when visible
  useEffect(() => {
    if (!isVisible) {
      setIsFadingOut(true);
      const t = setTimeout(() => {
        setVisibleLines([]);
        setIsFadingOut(false);
      }, 600);
      return () => clearTimeout(t);
    }

    setVisibleLines([]);
    const timers: ReturnType<typeof setTimeout>[] = [];

    BOOT_LINES.forEach((line, index) => {
      const t = setTimeout(() => {
        setVisibleLines((prev) => [...prev, index]);
      }, line.delay);
      timers.push(t);
    });

    return () => timers.forEach(clearTimeout);
  }, [isVisible]);

  if (!isVisible && !isFadingOut) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading CodeCity CyberDefense"
      className="loading-screen"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: '#000000',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '2rem',
        opacity: isFadingOut ? 0 : 1,
        transition: 'opacity 0.6s ease-out',
        pointerEvents: isVisible ? 'auto' : 'none',
      }}
    >
      {/* Scanline overlay */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,159,0.03) 2px, rgba(0,255,159,0.03) 4px)',
          pointerEvents: 'none',
        }}
      />

      {/* Boot text lines */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          maxWidth: '600px',
          width: '100%',
        }}
      >
        {BOOT_LINES.map((line, index) => (
          <div
            key={index}
            aria-hidden={!visibleLines.includes(index)}
            style={{
              fontFamily: 'monospace',
              fontSize: '0.9rem',
              color: index === BOOT_LINES.length - 1 ? '#00ffff' : '#00ff9f',
              letterSpacing: '0.05em',
              lineHeight: '2',
              opacity: visibleLines.includes(index) ? 1 : 0,
              transform: visibleLines.includes(index) ? 'translateX(0)' : 'translateX(-8px)',
              transition: 'opacity 0.4s ease-out, transform 0.4s ease-out',
              // Respect reduced motion
              ...(typeof window !== 'undefined' &&
              window.matchMedia('(prefers-reduced-motion: reduce)').matches
                ? { transition: 'none' }
                : {}),
            }}
          >
            {line.text}
            {/* Blinking cursor on the last visible line */}
            {index === Math.max(...visibleLines, -1) &&
              visibleLines.includes(index) && (
                <span
                  aria-hidden="true"
                  style={{
                    display: 'inline-block',
                    width: '0.6em',
                    height: '1em',
                    background: index === BOOT_LINES.length - 1 ? '#00ffff' : '#00ff9f',
                    marginLeft: '2px',
                    verticalAlign: 'text-bottom',
                    animation: 'blink-cursor 1s step-end infinite',
                  }}
                />
              )}
          </div>
        ))}
      </div>

      {/* CSS for cursor blink — injected inline to avoid external deps */}
      <style>{`
        @keyframes blink-cursor {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes blink-cursor {
            0%, 100% { opacity: 1; }
          }
        }
      `}</style>
    </div>
  );
}
