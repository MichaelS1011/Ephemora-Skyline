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

interface WsMessage {
  type: string;
  payload: WsProgressPayload | WsCompletePayload | WsErrorPayload;
  timestamp?: string;
}

export type AnalysisState = 'idle' | 'connecting' | 'analyzing' | 'success' | 'error';

/**
 * Shared repository-analysis flow (WebSocket): send a repo URL, stream
 * progress, load the built city when `analysis_complete` arrives.
 * Used by the landing hero and the in-city analyze panel.
 */
export function useAnalysis() {
  const [url, setUrl] = useState('');
  const [branch, setBranch] = useState('');
  const [state, setState] = useState<AnalysisState>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const wsRef = useRef<WebSocket | null>(null);

  const setCityData = useStore((s) => s.setCityData);
  const setAnalysisProgress = useStore((s) => s.setAnalysisProgress);
  const setAnalysisStage = useStore((s) => s.setAnalysisStage);
  const setAnalysisId = useStore((s) => s.setAnalysisId);
  const analysisProgress = useStore((s) => s.analysisProgress);
  const analysisStage = useStore((s) => s.analysisStage);

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  const disconnectWs = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

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

    setErrorMessage('');
    setAnalysisProgress(0);
    setAnalysisStage('Connecting...');
    setState('connecting');
    disconnectWs();

    const wsUrl = (import.meta.env['VITE_WS_URL'] as string | undefined) ?? 'ws://localhost:4000/ws';
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setState('analyzing');
      setAnalysisStage('Sending request...');
      const payload: AnalyzePayload = { url: url.trim() };
      if (branch.trim()) payload.branch = branch.trim();
      ws.send(JSON.stringify({ type: 'start_analysis', payload }));
    };

    ws.onmessage = (event: MessageEvent) => {
      let msg: WsMessage;
      try {
        msg = JSON.parse(event.data as string) as WsMessage;
      } catch {
        return;
      }
      if (msg.type === 'analysis_progress') {
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
        setErrorMessage(p.message ?? 'Analysis failed — is the repository public and the branch correct?');
        setState('error');
        disconnectWs();
      }
    };

    ws.onerror = () => {
      setErrorMessage('Could not reach the analysis backend. Is it running?');
      setState('error');
      disconnectWs();
    };
  }, [url, branch, disconnectWs, fetchCityData, setAnalysisProgress, setAnalysisStage]);

  const cancel = useCallback(() => {
    disconnectWs();
    setState('idle');
    setAnalysisProgress(0);
    setAnalysisStage('');
  }, [disconnectWs, setAnalysisProgress, setAnalysisStage]);

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
