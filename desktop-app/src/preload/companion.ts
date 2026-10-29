/**
 * Companion preload — exposes ONLY the narrow window-control IPC operations
 * needed by the pet and overlay windows. It additionally re-exposes the
 * existing wayfinder API from the standard preload so that the overlay can
 * call chat methods without a separate bridge.
 *
 * Security model (same as main preload):
 * - contextIsolation: true, nodeIntegration: false, sandbox: true
 * - No generic ipcRenderer.invoke exposed — only named wrappers
 * - No filesystem, shell, credential, or unrestricted URL access
 */
import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopAPI } from '../shared/types';
import type { CompanionAPI } from '../renderer/companion/pet-api';
import release from '../../FEATURES.json';

// ── Existing wayfinder API (re-exposed for overlay's ChatPanel) ──────────────
const methods = release.preload_methods as (keyof DesktopAPI)[];
const wayfinderApi = Object.fromEntries(
  methods.map(name => [
    name,
    async (...args: unknown[]) => {
      const response = await ipcRenderer.invoke(`wayfinder:${name}`, ...args);
      if (!response?.ok) throw new Error(response?.error || 'Request failed.');
      return response.data;
    }
  ])
) as unknown as DesktopAPI;

contextBridge.exposeInMainWorld('wayfinder', Object.freeze(wayfinderApi));

// ── Narrow companion API ──────────────────────────────────────────────────────
const COMPANION_CHANNELS = [
  'companion:showOverlay',
  'companion:hideOverlay',
  'companion:focusMain',
  'companion:hidePet',
  'companion:showSettings',
  'companion:getShortcut',
  'companion:shortcutRegistered',
] as const;

const companionApi: CompanionAPI = {
  showOverlay: () => ipcRenderer.invoke('companion:showOverlay'),
  hideOverlay: () => ipcRenderer.invoke('companion:hideOverlay'),
  focusMain:   () => ipcRenderer.invoke('companion:focusMain'),
  hidePet:     () => ipcRenderer.invoke('companion:hidePet'),
  showSettings:() => ipcRenderer.invoke('companion:showSettings'),
  getShortcut: () => ipcRenderer.invoke('companion:getShortcut'),
  shortcutRegistered: () => ipcRenderer.invoke('companion:shortcutRegistered'),
};

contextBridge.exposeInMainWorld('companionAPI', Object.freeze(companionApi));

// COMPANION_CHANNELS is used as an audit list for review; TypeScript sees it
// as a const tuple. Keep it assigned to avoid lint-unused warnings.
const _channels: readonly string[] = COMPANION_CHANNELS;
void _channels;
