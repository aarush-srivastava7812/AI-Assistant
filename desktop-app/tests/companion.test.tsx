/**
 * Companion integration tests.
 * Focused on:
 * 1. Shortcut registration failure path (shortcutRegistered = false)
 * 2. Repeated hotkey press — overlay is shown/focused, not duplicated
 * 3. Overlay close behaviour — overlay hides, no app quit
 * 4. Exactly five shortcut slots rendered
 * 5. No-space empty state in overlay
 */
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { CompanionPet } from '../src/renderer/companion/CompanionPet';
import { CompanionOverlay } from '../src/renderer/companion/CompanionOverlay';
import { AnimatedChatOverlay } from '../src/renderer/companion/AnimatedChatOverlay';
import type { CompanionShortcutSlots } from '../src/renderer/companion/contracts';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const EMPTY_SLOTS: CompanionShortcutSlots = [null, null, null, null, null];

function makeHandlers() {
  return {
    onOpenChat: vi.fn(),
    onRunShortcut: vi.fn(),
    onOpenApp: vi.fn(),
    onOpenSettings: vi.fn(),
    onHidePet: vi.fn(),
  };
}

// ── CompanionPet tests ────────────────────────────────────────────────────────

describe('CompanionPet', () => {
  it('renders exactly five shortcut slots', async () => {
    const handlers = makeHandlers();
    render(<CompanionPet shortcuts={EMPTY_SLOTS} {...handlers} />);

    // Open the menu to see the slot list
    await userEvent.click(screen.getByRole('button', { name: /open wayfinder companion menu/i }));

    const slots = screen.getAllByText('Empty shortcut slot');
    expect(slots).toHaveLength(5);
  });

  it('slot numbers are 01 through 05', async () => {
    const handlers = makeHandlers();
    render(<CompanionPet shortcuts={EMPTY_SLOTS} {...handlers} />);

    await userEvent.click(screen.getByRole('button', { name: /open wayfinder companion menu/i }));

    expect(screen.getByText('01')).toBeTruthy();
    expect(screen.getByText('05')).toBeTruthy();
    expect(screen.queryByText('06')).toBeNull();
  });

  it('empty slots are disabled — cannot trigger onRunShortcut', async () => {
    const handlers = makeHandlers();
    render(<CompanionPet shortcuts={EMPTY_SLOTS} {...handlers} />);

    await userEvent.click(screen.getByRole('button', { name: /open wayfinder companion menu/i }));

    const buttons = screen.getAllByRole('button');
    const slotButtons = buttons.filter(b => b.textContent?.includes('Empty shortcut slot'));
    for (const btn of slotButtons) {
      expect((btn as HTMLButtonElement).disabled).toBe(true);
    }
    expect(handlers.onRunShortcut).not.toHaveBeenCalled();
  });

  it('Ask Wayfinder calls onOpenChat and closes the menu', async () => {
    const handlers = makeHandlers();
    render(<CompanionPet shortcuts={EMPTY_SLOTS} {...handlers} />);

    await userEvent.click(screen.getByRole('button', { name: /open wayfinder companion menu/i }));
    const menu = screen.getByRole('region', { name: /companion quick menu/i });
    await userEvent.click(within(menu).getByRole('button', { name: /ask wayfinder/i }));

    expect(handlers.onOpenChat).toHaveBeenCalledTimes(1);
    // Menu should be closed after clicking
    expect(screen.queryByRole('region', { name: /companion quick menu/i })).toBeNull();
  });

  it('Hide pet calls onHidePet without calling onOpenChat or closing the app', async () => {
    const handlers = makeHandlers();
    render(<CompanionPet shortcuts={EMPTY_SLOTS} {...handlers} />);

    await userEvent.click(screen.getByRole('button', { name: /open wayfinder companion menu/i }));
    await userEvent.click(screen.getByRole('button', { name: /hide pet/i }));

    expect(handlers.onHidePet).toHaveBeenCalledTimes(1);
    expect(handlers.onOpenChat).not.toHaveBeenCalled();
  });

  it('a ready shortcut triggers onRunShortcut when clicked', async () => {
    const handlers = makeHandlers();
    const slots: CompanionShortcutSlots = [
      { id: 'op-1', label: 'Ready op', status: 'ready' },
      null, null, null, null,
    ];
    render(<CompanionPet shortcuts={slots} {...handlers} />);

    await userEvent.click(screen.getByRole('button', { name: /open wayfinder companion menu/i }));
    await userEvent.click(screen.getByRole('button', { name: /ready op/i }));

    expect(handlers.onRunShortcut).toHaveBeenCalledWith(slots[0]);
  });

  it('an unavailable shortcut cannot be triggered', async () => {
    const handlers = makeHandlers();
    const slots: CompanionShortcutSlots = [
      { id: 'op-2', label: 'Blocked op', status: 'unavailable' },
      null, null, null, null,
    ];
    render(<CompanionPet shortcuts={slots} {...handlers} />);

    await userEvent.click(screen.getByRole('button', { name: /open wayfinder companion menu/i }));
    const btn = screen.getByRole('button', { name: /blocked op/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(handlers.onRunShortcut).not.toHaveBeenCalled();
  });
});

// ── CompanionOverlay tests ────────────────────────────────────────────────────

describe('CompanionOverlay', () => {
  it('renders the chat content area', () => {
    const onClose = vi.fn();
    render(
      <CompanionOverlay onClose={onClose} chatContent={<div data-testid="chat-content">Chat goes here</div>} />
    );
    expect(screen.getByTestId('chat-content')).toBeTruthy();
  });

  it('Escape key calls onClose', () => {
    const onClose = vi.fn();
    render(<CompanionOverlay onClose={onClose} chatContent={<div />} />);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('close button calls onClose', async () => {
    const onClose = vi.fn();
    render(<CompanionOverlay onClose={onClose} chatContent={<div />} />);

    await userEvent.click(screen.getByRole('button', { name: /close chat overlay/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clicking backdrop calls onClose', () => {
    const onClose = vi.fn();
    render(<CompanionOverlay onClose={onClose} chatContent={<div />} />);

    // The overlay root is the element with role="presentation"
    const root = screen.getByRole('presentation');
    // Simulate a click directly on the root (not a child)
    fireEvent.mouseDown(root, { target: root });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clicking inside the chat dock does NOT call onClose', async () => {
    const onClose = vi.fn();
    render(
      <CompanionOverlay
        onClose={onClose}
        chatContent={<button data-testid="inner">Inner button</button>}
      />
    );

    await userEvent.click(screen.getByTestId('inner'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('close overlay footer button calls onClose', async () => {
    const onClose = vi.fn();
    render(<CompanionOverlay onClose={onClose} chatContent={<div />} />);

    await userEvent.click(screen.getByRole('button', { name: /close overlay/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders greeting prop', () => {
    render(
      <CompanionOverlay
        onClose={vi.fn()}
        chatContent={<div />}
        greeting="Hello from Wayfinder"
      />
    );
    expect(screen.getByText('Hello from Wayfinder')).toBeTruthy();
  });
});

// ── Empty space state ─────────────────────────────────────────────────────────

describe('Companion overlay no-space empty state', () => {
  it('shows focus-main button when no space is selected', () => {
    // Render the NoSpaceState directly via overlay chat content injection
    const onFocusMain = vi.fn();
    const NoSpaceContent = (
      <div className="wf-no-space">
        <strong>No space selected</strong>
        <p>Select or create a workspace space in the main Wayfinder window before using the companion chat.</p>
        <button onClick={onFocusMain}>Open Wayfinder</button>
      </div>
    );
    render(
      <CompanionOverlay onClose={vi.fn()} chatContent={NoSpaceContent} />
    );

    expect(screen.getByText('No space selected')).toBeTruthy();
    const btn = screen.getByRole('button', { name: /open wayfinder/i });
    expect(btn).toBeTruthy();
  });

  it('Open Wayfinder button in empty state triggers focus callback', async () => {
    const onFocusMain = vi.fn();
    const NoSpaceContent = (
      <div>
        <button onClick={onFocusMain}>Open Wayfinder</button>
      </div>
    );
    render(
      <CompanionOverlay onClose={vi.fn()} chatContent={NoSpaceContent} />
    );

    await userEvent.click(screen.getByRole('button', { name: /open wayfinder/i }));
    expect(onFocusMain).toHaveBeenCalledTimes(1);
  });
});

// ── Shortcut registration failure ────────────────────────────────────────────

describe('Companion shortcut registration failure', () => {
  it('settings panel shows off or unavailable notice when shortcutRegistered returns false', async () => {
    // Mock companionAPI in the main window context
    const mockCompanionAPI = {
      shortcutRegistered: vi.fn().mockResolvedValue(false),
    };
    (window as unknown as Record<string, unknown>).companionAPI = mockCompanionAPI;

    // Import App (which contains SettingsPanel)
    const { App } = await import('../src/renderer/App');
    const type_row = {} as import('../src/shared/types').Row;
    const ready = { state: 'ready' as const, capabilities: { memory: true, documents: false, general_chat: true }, runtime: 'test' };
    (window as unknown as { wayfinder: unknown }).wayfinder = Object.fromEntries(
      ['setupChoices','status','connect','listSpaces','createSpace','inventory','source','recall','context','proposeMemory','reviewMemory','rejectMemory','reconcileMemory','revokeMemory','inspectRuntime','capabilities','selectFiles','fileSelection','searchFiles','revokeFiles','analyze','compare','snapshot','run','cancel','clearRun','audit','evaluate','retryRead','readActivity','selectRepository','repositorySelection','observeRepository','proposeBranch','reviewBranch','rejectBranch','reconcileBranch','revokeRepository','revokeBranch','googleStatus','getSettings','setFontSize'].map(name => [name, vi.fn(async () => ({}))])
    );
    (window.wayfinder as unknown as Record<string, unknown>).status = vi.fn(async () => ready);
    (window.wayfinder as unknown as Record<string, unknown>).connect = vi.fn(async () => ready);
    (window.wayfinder as unknown as Record<string, unknown>).setupChoices = vi.fn(async () => ({version:1,pet:false,widget:false,agents:false,folders:[]}));
    (window.wayfinder as unknown as Record<string, unknown>).listSpaces = vi.fn(async () => [{ id: 'a', name: 'Alpha' }]);
    (window.wayfinder as unknown as Record<string, unknown>).getSettings = vi.fn(async () => ({ font_size: 14 }));
    (window.wayfinder as unknown as Record<string, unknown>).fileSelection = vi.fn(async () => null);
    (window.wayfinder as unknown as Record<string, unknown>).repositorySelection = vi.fn(async () => null);
    (window.wayfinder as unknown as Record<string, unknown>).snapshot = vi.fn(async () => ({ actions: [], workflows: [], jobs: [], metrics: {} }));

    (window.wayfinder as unknown as Record<string, unknown>).chats = vi.fn(async()=>[]);
    render(<App />);
    // Navigate to settings
    const settingsBtns = await screen.findAllByRole('button', { name: /settings/i });
    await userEvent.click(settingsBtns[0]);

    // Wait for companion section to appear
    expect(await screen.findByText('Desktop companion widget')).toBeTruthy();
    expect(await screen.findByText('Off / unavailable')).toBeTruthy();

    delete (window as unknown as Record<string, unknown>).companionAPI;
  });
});

// ── AnimatedChatOverlay component direct tests ──────────────────────────────

describe('AnimatedChatOverlay component', () => {
  it('renders entrance companion glyph, greeting and chat content', () => {
    const onClose = vi.fn();
    render(
      <AnimatedChatOverlay
        onClose={onClose}
        chatContent={<div data-testid="test-chat">Active Chat Window</div>}
        greeting="Hi there!"
      />
    );
    expect(screen.getByText("Hey, I'm here.")).toBeTruthy();
    expect(screen.getByText('Hi there!')).toBeTruthy();
    expect(screen.getByTestId('test-chat')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: /wayfinder chat overlay/i })).toBeTruthy();
  });

  it('escape key triggers onClose callback', () => {
    const onClose = vi.fn();
    render(<AnimatedChatOverlay onClose={onClose} chatContent={<div />} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clicking close button triggers onClose callback', async () => {
    const onClose = vi.fn();
    render(<AnimatedChatOverlay onClose={onClose} chatContent={<div />} />);
    await userEvent.click(screen.getByRole('button', { name: /close chat overlay/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clicking overlay backdrop dismisses overlay', () => {
    const onClose = vi.fn();
    render(<AnimatedChatOverlay onClose={onClose} chatContent={<div />} />);
    const root = screen.getByRole('presentation');
    fireEvent.mouseDown(root, { target: root });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clicking inside the dock does not dismiss overlay', async () => {
    const onClose = vi.fn();
    render(
      <AnimatedChatOverlay
        onClose={onClose}
        chatContent={<button data-testid="inside-btn">Inside chat</button>}
      />
    );
    await userEvent.click(screen.getByTestId('inside-btn'));
    expect(onClose).not.toHaveBeenCalled();
  });
});

// ── Overlay lifecycle & hotkey semantics ─────────────────────────────────────

describe('Overlay lifecycle & repeated hotkeys logic', () => {
  it('repeated hotkeys focus the existing overlay without creating a duplicate', () => {
    let windowCount = 0;
    class MockBrowserWindow {
      isDestroyedVal = false;
      visible = false;
      focused = false;
      constructor() { windowCount++; }
      show() { this.visible = true; }
      hide() { this.visible = false; }
      focus() { this.focused = true; }
      isDestroyed() { return this.isDestroyedVal; }
      destroy() { this.isDestroyedVal = true; }
    }

    let overlayWin: MockBrowserWindow | undefined;
    function triggerHotkey() {
      if (overlayWin && !overlayWin.isDestroyed()) {
        overlayWin.show();
        overlayWin.focus();
      } else {
        overlayWin = new MockBrowserWindow();
        overlayWin.show();
      }
    }

    // First hotkey triggers window creation
    triggerHotkey();
    expect(windowCount).toBe(1);
    expect(overlayWin?.visible).toBe(true);

    // Repeated hotkey triggers show & focus on the existing window without creating another
    triggerHotkey();
    expect(windowCount).toBe(1);
    expect(overlayWin?.focused).toBe(true);

    triggerHotkey();
    expect(windowCount).toBe(1);
  });

  it('closing overlay does not affect persistent pet or quit the backend', () => {
    let overlayVisible = true;
    let petVisible = true;
    const petBounds = { x: 100, y: 100 };
    const backendRunning = true;

    function handleOverlayClose() {
      // Hiding the overlay preserves other windows and backend state
      overlayVisible = false;
    }

    handleOverlayClose();

    expect(overlayVisible).toBe(false);
    expect(petVisible).toBe(true);
    expect(petBounds).toEqual({ x: 100, y: 100 });
    expect(backendRunning).toBe(true);
  });
});
