/**
 * Companion windows controller — creates and manages the pet and overlay
 * BrowserWindows; registers the global shortcut; handles sender-validated IPC.
 *
 * Security invariants preserved:
 * - contextIsolation: true, nodeIntegration: false, sandbox: true (identical
 *   to the main window)
 * - Each companion IPC handler validates that the event.sender belongs to
 *   a known companion window (pet or overlay). The requireCompanionSender
 *   check below mirrors requireMainSender from sender.ts.
 * - No new backend, agent loop, or memory engine is started.
 * - globalShortcut is registered after app.whenReady(); success is checked.
 * - Shortcut is unregistered in will-quit.
 * - Display work areas are used; no hardcoded screen coordinates.
 * - Windows are single-instance; no duplicate creation on repeated hotkey presses.
 */

import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  screen,
  type IpcMainInvokeEvent,
} from 'electron';
import path from 'node:path';

// ── Default hotkey (documented; not user-configurable in this build) ────────
// TODO: Add safe user-configurable hotkey in a future build with conflict
// detection and explicit key-binding validation. For now, a single documented
// default is used. The shortcutRegistered IPC method lets the UI report when
// the key was taken by another app.
export const DEFAULT_ACCELERATOR = 'CommandOrControl+Shift+Space';

let pet: BrowserWindow | undefined;
let overlay: BrowserWindow | undefined;
let shortcutRegistered = false;
let preloadFile = '';
let rendererFile = '';
let mainWindow: BrowserWindow | undefined;

/** Only allow IPC from known companion renderers; mirrors requireMainSender. */
function requireCompanionSender(event: IpcMainInvokeEvent) {
  const sender = event.sender;
  const isPet = pet && sender === pet.webContents;
  const isOverlay = overlay && sender === overlay.webContents;
  if (!isPet && !isOverlay) {
    throw new Error('Untrusted companion sender.');
  }
}

/** Bounds for the pet window: anchored to bottom-right of primary display work area. */
function petBounds() {
  const display = screen.getPrimaryDisplay();
  const { width, height, x, y } = display.workArea;
  const w = 180, h = 180;
  return { x: x + width - w - 24, y: y + height - h - 24, width: w, height: h };
}

/** Bounds for the overlay window: full work area of primary display. */
function overlayBounds() {
  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.workArea;
  return { x, y, width, height };
}

function createPet() {
  if (pet && !pet.isDestroyed()) { pet.show(); pet.focus(); return; }
  const b = petBounds();
  pet = new BrowserWindow({
    ...b,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    show: false,
    title: 'Wayfinder Companion',
    webPreferences: {
      preload: preloadFile,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });
  pet.setIgnoreMouseEvents(false);
  pet.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  pet.webContents.on('will-navigate', e => e.preventDefault());
  pet.webContents.on('will-attach-webview', e => e.preventDefault());
  pet.once('ready-to-show', () => pet!.show());
  pet.on('closed', () => { pet = undefined; });
  void pet.loadFile(rendererFile, { query: { companion: 'pet' } });
}

function createOverlay() {
  if (overlay && !overlay.isDestroyed()) {
    overlay.show(); overlay.focus(); return;
  }
  const b = overlayBounds();
  overlay = new BrowserWindow({
    ...b,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    show: false,
    title: 'Wayfinder Companion Chat',
    webPreferences: {
      preload: preloadFile,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });
  overlay.setIgnoreMouseEvents(false);
  overlay.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  overlay.webContents.on('will-navigate', e => e.preventDefault());
  overlay.webContents.on('will-attach-webview', e => e.preventDefault());
  overlay.once('ready-to-show', () => overlay!.show());
  overlay.on('closed', () => { overlay = undefined; });
  void overlay.loadFile(rendererFile, { query: { companion: 'overlay' } });
}

/** Show or focus the overlay; create it if it doesn't exist yet. */
function showOverlay() {
  if (overlay && !overlay.isDestroyed()) {
    overlay.show(); overlay.focus();
  } else {
    createOverlay();
  }
}

/** Hide the overlay without destroying it (preserves React state). */
function hideOverlay() {
  if (overlay && !overlay.isDestroyed()) overlay.hide();
}

/** Handle display change: re-position overlay if it's visible. */
function onDisplayChange() {
  if (overlay && !overlay.isDestroyed() && overlay.isVisible()) {
    overlay.setBounds(overlayBounds());
  }
}

// ── IPC handlers ─────────────────────────────────────────────────────────────
function registerIPC() {
  ipcMain.handle('companion:showOverlay', (event) => {
    requireCompanionSender(event);
    showOverlay();
  });

  ipcMain.handle('companion:hideOverlay', (event) => {
    requireCompanionSender(event);
    hideOverlay();
  });

  ipcMain.handle('companion:focusMain', (event) => {
    requireCompanionSender(event);
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show(); mainWindow.focus();
    }
  });

  ipcMain.handle('companion:hidePet', (event) => {
    requireCompanionSender(event);
    // Hide only the pet window; backend and main app are not affected.
    if (pet && !pet.isDestroyed()) pet.hide();
  });

  ipcMain.handle('companion:showSettings', (event) => {
    requireCompanionSender(event);
    // Focus main app; it will render the settings page via URL hash set by
    // the companion (no cross-window messaging needed for this affordance).
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show(); mainWindow.focus();
    }
  });

  ipcMain.handle('companion:getShortcut', (event) => {
    requireCompanionSender(event);
    return DEFAULT_ACCELERATOR;
  });

  ipcMain.handle('companion:shortcutRegistered', (event) => {
    requireCompanionSender(event);
    return shortcutRegistered;
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Initialise companion windows and shortcut. Call after app.whenReady().
 *
 * @param appDir      __dirname of the main entry (used to resolve preload path)
 * @param htmlFile    Absolute path to dist/renderer/index.html
 * @param main        The main BrowserWindow so focusMain can bring it forward
 */
export function initCompanion(appDir: string, htmlFile: string, main: BrowserWindow) {
  mainWindow = main;
  rendererFile = htmlFile;
  preloadFile = path.join(appDir, '../preload/companion.cjs');

  registerIPC();

  // Register global shortcut — only after app.whenReady()
  try {
    shortcutRegistered = globalShortcut.register(DEFAULT_ACCELERATOR, () => {
      showOverlay();
    });
    if (!shortcutRegistered) {
      // Key is taken by another app. The companion:shortcutRegistered IPC
      // allows the settings UI to surface a non-blocking notice.
      console.warn(`[companion] Global shortcut ${DEFAULT_ACCELERATOR} could not be registered (key may be in use by another app).`);
    }
  } catch (err) {
    console.warn('[companion] globalShortcut.register threw:', err);
    shortcutRegistered = false;
  }

  // Spawn the pet immediately (it appears in bottom-right corner)
  createPet();

  // Handle display changes (multi-monitor / resolution changes)
  screen.on('display-added', onDisplayChange);
  screen.on('display-removed', onDisplayChange);
  screen.on('display-metrics-changed', onDisplayChange);
}

/**
 * Tear down companion windows and unregister the shortcut.
 * Call on will-quit (before app.quit()).
 */
export function shutdownCompanion() {
  globalShortcut.unregisterAll();
  if (pet && !pet.isDestroyed()) pet.destroy();
  if (overlay && !overlay.isDestroyed()) overlay.destroy();
  pet = undefined; overlay = undefined;
  screen.removeAllListeners('display-added');
  screen.removeAllListeners('display-removed');
  screen.removeAllListeners('display-metrics-changed');
}

/** Exported for testing and programmatic overlay control */
export { showOverlay, hideOverlay };
export function getOverlayWindow(): BrowserWindow | undefined { return overlay; }
export function getPetWindow(): BrowserWindow | undefined { return pet; }
export function isShortcutRegistered(): boolean { return shortcutRegistered; }
