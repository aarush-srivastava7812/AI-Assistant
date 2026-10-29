/**
 * Overlay renderer entry — loaded by the overlay BrowserWindow via ?companion=overlay.
 *
 * The overlay reuses the existing ChatPanel mounted inside CompanionOverlay.
 * If no space is selected, a safe empty state prompts the user to open the main app.
 *
 * Security: same sandbox+contextIsolation model. Both window.wayfinder (the
 * full existing preload API) and window.companionAPI (narrow window-control)
 * are available because the overlay uses both preloads via the same bundle.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Sparkles } from 'lucide-react';
import { AnimatedChatOverlay } from './AnimatedChatOverlay';
import { ChatPanel } from '../Chat';
import type { BackendState, Row } from '../../shared/types';
import './pet-api'; // registers global type only
import '../styles.css';
import '../design.css';
import './companion.css';

type ReadyState = 'starting' | 'ready' | 'offline' | 'setup';

/**
 * Safe empty state: shown when the backend is not ready or no space is selected.
 * Directs user to the main app with an honest explanation; no fake chat is rendered.
 */
function NoSpaceState({ state, onFocusMain }: { state: ReadyState; onFocusMain: () => void }) {
  const messages: Record<ReadyState, { title: string; body: string }> = {
    starting: { title: 'Connecting…', body: 'Waiting for the existing Wayfinder backend to be ready. Open the main app to check the connection.' },
    ready: { title: 'No space selected', body: 'Select or create a workspace space in the main Wayfinder window before using the companion chat.' },
    offline: { title: 'Backend offline', body: 'The Wayfinder backend is not reachable. Check the main app window to reconnect.' },
    setup: { title: 'Setup required', body: 'Complete first-run setup in the main Wayfinder window before using the companion chat.' },
  };
  const { title, body } = messages[state];
  return (
    <div className="wf-no-space">
      <Sparkles size={36} />
      <strong>{title}</strong>
      <p>{body}</p>
      <button onClick={onFocusMain}>Open Wayfinder</button>
    </div>
  );
}

function OverlayApp() {
  const [backend, setBackend] = useState<BackendState>({ state: 'starting' });
  const [spaces, setSpaces] = useState<Row[]>([]);
  const [space, setSpace] = useState('');
  const api = window.wayfinder;
  const companionApi = window.companionAPI;
  const liveRef = useRef(true);

  // Connect to the existing backend on mount — same pattern as App.tsx
  useEffect(() => {
    void (async () => {
      try {
        const result = await api.connect();
        if (!liveRef.current) return;
        setBackend(result);
        if (result.state === 'ready') {
          const list = await api.listSpaces();
          if (!liveRef.current) return;
          setSpaces(list);
          // Restore last-used space from localStorage (presentation preference only)
          const stored = (() => { try { return localStorage.getItem('wayfinder-space') || ''; } catch { return ''; } })();
          setSpace(list.some(s => s.id === stored) ? stored : list[0]?.id || '');
        }
      } catch {
        if (liveRef.current) setBackend({ state: 'offline', error: 'Backend unreachable.' });
      }
    })();
    return () => { liveRef.current = false; };
  }, [api]);

  // Keep space in sync with localStorage writes from the main window
  // (best-effort; no cross-window events needed — space selection from main works fine)
  useEffect(() => {
    if (space) { try { localStorage.setItem('wayfinder-space', space); } catch { /* ignore */ } }
  }, [space]);

  const handleClose = useCallback(() => { void companionApi.hideOverlay(); }, [companionApi]);
  const handleFocusMain = useCallback(() => { void companionApi.focusMain(); }, [companionApi]);

  const isReady = backend.state === 'ready' && !!space;
  const qualified = !!backend.capabilities?.general_chat;

  const chatContent = isReady
    ? <ChatPanel key={space} api={api} space={space} qualified={qualified} />
    : <NoSpaceState state={backend.state} onFocusMain={handleFocusMain} />;

  return (
    <AnimatedChatOverlay onClose={handleClose} chatContent={chatContent} />
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><OverlayApp /></React.StrictMode>
);
