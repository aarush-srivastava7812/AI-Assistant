import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import './design.css';

// Companion mode routing: the pet and overlay BrowserWindows load the same
// HTML file with a ?companion=pet or ?companion=overlay query string.
// Normal startup (no query parameter) mounts the regular App as before.
const params = new URLSearchParams(window.location.search);
const companionParam = params.get('companion') || params.get('view') || params.get('route');
const isPet = companionParam === 'pet' || params.has('pet');
const isOverlay = companionParam === 'overlay' || params.has('overlay');

if (isPet) {
  // Pet window — import only pet code; no workspace panels or backend polling
  import('./companion/PetApp');
} else if (isOverlay) {
  // Overlay window — imports ChatPanel + companion overlay (AnimatedChatOverlay)
  import('./companion/OverlayApp');
} else {
  // Normal main window — unchanged
  import('./App').then(({ App }) => {
    createRoot(document.getElementById('root')!).render(
      <React.StrictMode><App /></React.StrictMode>
    );
  });
}
