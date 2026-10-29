/**
 * Pet renderer entry — loaded by the pet BrowserWindow via ?companion=pet.
 *
 * Must NOT import App or workspace panels. Uses only the companion subset of
 * the preload bridge (window.companionAPI) plus the design-only companion.css.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { CompanionPet } from './CompanionPet';
import type { CompanionShortcutSlots } from './contracts';
import './pet-api'; // registers global type only

// All five shortcut slots are empty: FEATURES.json excludes
// workflow_builder_scheduler_quick_chat and arbitrary task execution.
// Empty slots are shown with honest "Pin an available workflow" text.
const EMPTY_SLOTS: CompanionShortcutSlots = [null, null, null, null, null];

function PetApp() {
  const api = window.companionAPI;
  return (
    <CompanionPet
      shortcuts={EMPTY_SLOTS}
      onOpenChat={() => { void api.showOverlay(); }}
      onRunShortcut={() => {
        // No supported shortcut operations in this build. Slots are empty.
      }}
      onOpenApp={() => { void api.focusMain(); }}
      onOpenSettings={() => { void api.showSettings(); }}
      onHidePet={() => { void api.hidePet(); }}
    />
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><PetApp /></React.StrictMode>
);
