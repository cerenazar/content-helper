import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type ChatEntry, type ClaudeEvent } from './api';
import { useStore } from './store';

export interface ClaudeState {
  log: ChatEntry[];
  running: boolean;
  error: string | null;
  send(message: string, context?: string): Promise<void>;
  stop(): void;
  reset(): Promise<void>;
  revert(snapshot: string): Promise<void>;
  onEvent(e: ClaudeEvent): void;
}

export function useClaude(slug: string): ClaudeState {
  const [log, setLog] = useState<ChatEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runningRef = useRef(false);

  const setRun = (r: boolean) => {
    runningRef.current = r;
    setRunning(r);
    useStore.setState({ claudeRunning: r });
  };

  useEffect(() => {
    api.claudeHistory(slug).then((r) => {
      setLog(r.history);
      setRun(r.running);
    });
  }, [slug]);

  const onEvent = useCallback((e: ClaudeEvent) => {
    setLog((l) => [...l, e]);
    if (e.kind === 'start') setRun(true);
    if (e.kind === 'end') setRun(false);
  }, []);

  return {
    log,
    running,
    error,
    onEvent,
    async send(message, context) {
      setError(null);
      // Bekleyen elle kaydı Claude başlamadan diske yaz
      const st = useStore.getState();
      if (st.saveState !== 'saved') await api.save(slug, st.project, st.scenes).catch(() => {});
      setLog((l) => [...l, { role: 'user', turn: 'pending', text: message, context }]);
      try {
        await api.ask(slug, message, context);
      } catch (e) {
        setError((e as Error).message);
      }
    },
    stop() {
      void api.stopClaude(slug);
    },
    async reset() {
      await api.resetClaude(slug);
      setLog([]);
    },
    async revert(snapshot) {
      const r = await api.restore(slug, snapshot);
      useStore.getState().fromServer(r.project, r.scenes, 'external');
    },
  };
}
