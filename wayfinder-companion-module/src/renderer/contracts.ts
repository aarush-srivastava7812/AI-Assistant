import type React from 'react';

export type ShortcutStatus = 'ready' | 'running' | 'approval' | 'missing-inputs' | 'unavailable' | 'failed';

export interface CompanionShortcut {
  /** Stable ID of an existing, qualified Wayfinder operation. */
  id: string;
  label: string;
  description?: string;
  status: ShortcutStatus;
  /** Optional status text shown to the user. */
  detail?: string;
}

/** Always render exactly five slots. `null` means the user has not pinned anything there. */
export type CompanionShortcutSlots = readonly [
  CompanionShortcut | null,
  CompanionShortcut | null,
  CompanionShortcut | null,
  CompanionShortcut | null,
  CompanionShortcut | null
];

export interface CompanionPetProps {
  shortcuts: CompanionShortcutSlots;
  onOpenChat: () => void;
  onRunShortcut: (shortcut: CompanionShortcut) => void;
  onOpenApp: () => void;
  onOpenSettings: () => void;
  onHidePet: () => void;
}

export interface CompanionOverlayProps {
  onClose: () => void;
  /** Mount the existing ChatPanel here; do not implement a second chat backend. */
  chatContent: React.ReactNode;
  greeting?: string;
}
