/**
 * Companion preload API surface — the narrow set of window-control operations
 * exposed to the pet and overlay renderer windows.
 *
 * This type is implemented by the companion preload (preload/companion.ts)
 * and used by PetApp and OverlayApp. It must NOT include wayfinder backend
 * methods; those are available to the overlay via window.wayfinder which is
 * exposed by the standard preload (also loaded in companion windows).
 */
export interface CompanionAPI {
  resizePet?(expanded:boolean):Promise<void>;
  showPet?():Promise<void>;
  setSpace?(space:string):Promise<void>;
  getContext():Promise<{space:string}>;
  onNavigate?(callback:(page:string)=>void):()=>void;
  /** Show (or focus) the overlay window. */
  showOverlay(): Promise<void>;
  /** Hide the overlay window. */
  hideOverlay(): Promise<void>;
  /** Focus the main Wayfinder application window. */
  focusMain(): Promise<void>;
  /** Hide the pet window. The backend and main app are unaffected. */
  hidePet(): Promise<void>;
  /** Navigate main app to the settings page (widget settings affordance). */
  showSettings(): Promise<void>;
  /**
   * Read the currently registered global shortcut accelerator.
   * Returns the accelerator string (e.g. "Alt+Shift+W") or null if not set.
   */
  getShortcut(): Promise<string | null>;
  /**
   * Whether shortcut registration succeeded at startup.
   * False means the hotkey was taken by another app; the UI should show a notice.
   */
  shortcutRegistered(): Promise<boolean>;
}

declare global {
  interface Window {
    companionAPI: CompanionAPI;
  }
}
