'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from '../stores/useStore';
import type { CityData } from '../city/types';

interface AnalyzePayload {
  url: string;
  branch?: string;
}

interface WsProgressPayload {
  progress?: number;
  stage?: string;
  connected?: boolean;
}

interface WsCompletePayload {
  id?: string;
  totalFiles?: number;
}

interface WsErrorPayload {
  message?: string;
}

interface WsStartedPayload {
  id?: string;
}

interface WsMessage {
  type: string;
  payload: WsProgressPayload | WsCompletePayload | WsErrorPayload | WsStartedPayload;
  timestamp?: string;
}

export type AnalysisState = 'idle' | 'connecting' | 'analyzing' | 'success' | 'error';

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 15 * 60 * 1000;
const WS_SILENCE_TIMEOUT_MS = 120 * 1000;

/**
 * Shared repository-analysis flow (WebSocket): send a repo URL, stream
 * progress, load the built city when `analysis_complete` arrives.
 * Used by the landing hero and the in-city analyze panel.
 *
 * Resilience: when the WS connection drops or goes silent mid-analysis, the
 * hook falls back to polling GET /api/status/:id (the job keeps running on
 * the backend) so the progress UI never hangs forever.
 */
export function useAnalysis() {
  const [url, setUrl] = useState('');
  const [branch, setBranch] = useState('');
  const [state, setState] = useState<AnalysisState>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const wsRef = useRef<WebSocket | null>(null);
  const jobIdRef = useRef('');
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastActivityRef = useRef(Date.now());
  const intentionalCloseRef = useRef(false);
  const erroredRef = useRef(false);
  const stateRef = useRef<AnalysisState>('idle');
  stateRef.current = state;

  const setCityData = useStore((s) => s.setCityData);
  const setAnalysisProgress = useStore((s) => s.setAnalysisProgress);
  const setAnalysisStage = useStore((s) => s.setAnalysisStage);
  const setAnalysisId = useStore((s) => s.setAnalysisId);
  const analysisProgress = useStore((s) => s.analysisProgress);
  const analysisStage = useStore((s) => s.analysisStage);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (watchdogRef.current) {
      clearInterval(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopPolling();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [stopPolling]);

  const disconnectWs = useCallback(() => {
    stopPolling();
    if (wsRef.current) {
      intentionalCloseRef.current = true;
      wsRef.current.close();
      wsRef.current = null;
    }
  }, [stopPolling]);

  const fetchCityData = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/result/${encodeURIComponent(id)}/city`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as CityData;
        if (data.totalFiles === 0) {
          throw new Error('No analyzable files found — is the repository public and the branch correct?');
        }
        setCityData(data);
        setAnalysisId(id);
        window.history.replaceState(null, '', `?city=${encodeURIComponent(id)}`);
        setState('success');
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load city data');
        setState('error');
      }
    },
    [setCityData, setAnalysisId],
  );

  /**
   * Poll GET /api/status/:id until the backend job finishes. Used when the
   * WebSocket connection is lost mid-analysis (the job keeps running there).
   */
  const startPollingFallback = useCallback(() => {
    if (pollTimerRef.current || !jobIdRef.current) return;
    const startedAt = Date.now();
    setAnalysisStage('Connection lost — polling status…');
    pollTimerRef.current = setInterval(() => {
      void (async () => {
        const id = jobIdRef.current;
        if (!id) return;
        if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
          stopPolling();
          setErrorMessage('Analysis timed out. Is the backend still running?');
          setState('error');
          return;
        }
        try {
          const res = await fetch(`/api/status/${encodeURIComponent(id)}`);
          if (!res.ok) return; // transient — retry on next tick
          const data = (await res.json()) as { status?: string; progress?: number; stage?: string };
          if (typeof data.progress === 'number') setAnalysisProgress(Math.min(100, Math.max(0, data.progress)));
          if (typeof data.stage === 'string' && data.stage) setAnalysisStage(data.stage);
          if (data.status === 'complete') {
            stopPolling();
            void fetchCityData(id);
          } else if (data.status === 'failed') {
            stopPolling();
            setErrorMessage('Analysis failed on the server — check the backend logs.');
            setState('error');
          }
        } catch {
          // network hiccup — retry on next tick
        }
      })();
    }, POLL_INTERVAL_MS);
  }, [fetchCityData, setAnalysisProgress, setAnalysisStage, stopPolling]);

  const startAnalysis = useCallback(() => {
    if (!url.trim()) {
      setErrorMessage('Please enter a GitHub URL');
      setState('error');
      return;
    }
    if (!url.startsWith('https://github.com/')) {
      setErrorMessage('URL must start with https://github.com/');
      setState('error');
      return;
    }

    stopPolling();
    jobIdRef.current = '';
    intentionalCloseRef.current = false;
    erroredRef.current = false;
    setErrorMessage('');
    setAnalysisProgress(0);
    setAnalysisStage('Connecting...');
    setState('connecting');
    disconnectWs();

    const wsUrl = (import.meta.env['VITE_WS_URL'] as string | undefined) ?? 'ws://localhost:4000/ws';
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    // Watchdog: a silently-stalled connection (no messages for 2 min) is
    // closed on purpose — onclose then switches to polling.
    lastActivityRef.current = Date.now();
    watchdogRef.current = setInterval(() => {
      if (Date.now() - lastActivityRef.current > WS_SILENCE_TIMEOUT_MS && wsRef.current === ws) {
        intentionalCloseRef.current = false;
        try {
          ws.close();
        } catch {
          /* already closing */
        }
      }
    }, 30 * 1000);

    ws.onopen = () => {
      lastActivityRef.current = Date.now();
      setState('analyzing');
      setAnalysisStage('Sending request...');
      const payload: AnalyzePayload = { url: url.trim() };
      if (branch.trim()) payload.branch = branch.trim();
      ws.send(JSON.stringify({ type: 'start_analysis', payload }));
    };

    ws.onmessage = (event: MessageEvent) => {
      lastActivityRef.current = Date.now();
      let msg: WsMessage;
      try {
        msg = JSON.parse(event.data as string) as WsMessage;
      } catch {
        return;
      }
      if (msg.type === 'analysis_started') {
        const p = msg.payload as WsStartedPayload;
        if (typeof p.id === 'string') jobIdRef.current = p.id;
      } else if (msg.type === 'analysis_progress') {
        const p = msg.payload as WsProgressPayload;
        if (typeof p.progress === 'number') setAnalysisProgress(Math.min(100, Math.max(0, p.progress)));
        if (typeof p.stage === 'string') setAnalysisStage(p.stage);
      } else if (msg.type === 'analysis_complete') {
        const p = msg.payload as WsCompletePayload;
        setAnalysisProgress(100);
        setAnalysisStage('Complete!');
        disconnectWs();
        if (typeof p.id === 'string' && p.id) void fetchCityData(p.id);
      } else if (msg.type === 'error') {
        const p = msg.payload as WsErrorPayload;
        erroredRef.current = true;
        setErrorMessage(p.message ?? 'Analysis failed — is the repository public and the branch correct?');
        setState('error');
        disconnectWs();
      }
    };

    ws.onerror = () => {
      erroredRef.current = true;
      setErrorMessage('Could not reach the analysis backend. Is it running?');
      setState('error');
      disconnectWs();
    };

    ws.onclose = () => {
      if (watchdogRef.current) {
        clearInterval(watchdogRef.current);
        watchdogRef.current = null;
      }
      // Intentional closes and already-reported errors must not trigger the fallback
      if (intentionalCloseRef.current || erroredRef.current || stateRef.current !== 'analyzing') {
        intentionalCloseRef.current = false;
        return;
      }
      // Unexpected drop mid-analysis: the backend job is still running — poll it
      startPollingFallback();
    };
  }, [url, branch, disconnectWs, fetchCityData, setAnalysisProgress, setAnalysisStage, startPollingFallback, stopPolling]);

  const cancel = useCallback(() => {
    stopPolling();
    jobIdRef.current = '';
    disconnectWs();
    setState('idle');
    setAnalysisProgress(0);
    setAnalysisStage('');
  }, [disconnectWs, setAnalysisProgress, setAnalysisStage, stopPolling]);

  const reset = useCallback(() => {
    setErrorMessage('');
    setState('idle');
  }, []);

  return {
    url,
    setUrl,
    branch,
    setBranch,
    state,
    errorMessage,
    analysisProgress,
    analysisStage,
    startAnalysis,
    cancel,
    reset,
    isAnalyzing: state === 'analyzing' || state === 'connecting',
  };
}
