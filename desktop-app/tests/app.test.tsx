import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/renderer/App';
import type { DesktopAPI, Row } from '../src/shared/types';
const ready = { state: 'ready' as const, capabilities: { memory: true, documents: false }, runtime: 'isolated-runtime' };
function mockAPI() {
  const api: Row = Object.fromEntries(['chats','chat','status','connect','listSpaces','createSpace','inventory','source','recall','context','proposeMemory','reviewMemory','rejectMemory','reconcileMemory','revokeMemory','inspectRuntime','capabilities','selectFiles','fileSelection','searchFiles','revokeFiles','analyze','compare','snapshot','run','cancel','clearRun','audit','evaluate','retryRead','readActivity','selectRepository','repositorySelection','observeRepository','proposeBranch','reviewBranch','rejectBranch','reconcileBranch','revokeRepository','revokeBranch','googleStatus','getSettings','setFontSize'].map(name => [name, vi.fn(async () => ({}))]));
  api.setupChoices=vi.fn(async()=>({version:1,pet:false,widget:false,agents:false,folders:[]})); api.chats.mockResolvedValue([]); api.chat.mockResolvedValue({turns:[]}); api.status.mockResolvedValue(ready); api.connect.mockResolvedValue(ready);
  api.listSpaces.mockResolvedValue([{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }]);
  api.fileSelection.mockResolvedValue(null); api.repositorySelection.mockResolvedValue(null); api.inventory.mockResolvedValue({ records: [] }); api.getSettings.mockResolvedValue({ font_size: 14, background: false });
  api.snapshot.mockResolvedValue({ actions: [], workflows: [], jobs: [], metrics: {} });
  window.wayfinder = api as DesktopAPI; return api;
}
async function mount() { const api = mockAPI(); render(<App />); await screen.findByText('Backend connected'); await userEvent.click(screen.getAllByRole('button', { name: 'Memory' })[0]); await screen.findByPlaceholderText('Enter a field, e.g. retention_days'); return api; }
describe('Actual React app with contract fixtures', () => {
  it('renders usable connected navigation without unfinished product tabs', async () => {
    await mount(); expect(screen.getByRole('heading', { name: 'Memory', level: 1 })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Scheduler' })).toBeNull(); expect(screen.getByRole('button', { name: 'Chat' })).toBeTruthy();
    expect(screen.getByText('Backend connected')).toBeTruthy();
  });
  it('sends exact scoped recall and renders attributed evidence', async () => {
    const api = await mount(); api.recall.mockResolvedValue({ packet: { answer_status: 'supported', evidence: [{ value: 30, predicate: 'retention_days', accepted_for_current_use: true, memory_id: 'source' }] } });
    await userEvent.type(screen.getByLabelText('Memory field'), 'retention_days'); await userEvent.click(screen.getByRole('button', { name: 'Recall memory' }));
    await screen.findByText('30'); expect(api.recall).toHaveBeenCalledWith('a', 'me', 'retention_days', 'now');
  });
  it('suppresses a stale result after switching spaces', async () => {
    const api = await mount(); let resolve!: (r: Row) => void; api.recall.mockImplementation(() => new Promise(r => { resolve = r; }));
    await userEvent.type(screen.getByLabelText('Memory field'), 'field'); await userEvent.click(screen.getByRole('button', { name: 'Recall memory' }));
    await userEvent.selectOptions(screen.getByLabelText('Memory space'), 'b');
    resolve({ packet: { answer_status: 'supported', evidence: [{ value: 'ALPHA-PRIVATE', predicate: 'field' }] } });
    await waitFor(() => expect(screen.getByLabelText('Memory space').getAttribute('disabled')).toBeNull());
    expect(screen.queryByText('ALPHA-PRIVATE')).toBeNull();
  });
  it('IME Enter does not submit a recall', async () => {
    const api = await mount(); const field = screen.getByLabelText('Memory field'); fireEvent.change(field, { target: { value: 'field' } });
    fireEvent.compositionStart(field); fireEvent.keyDown(field, { key: 'Enter', keyCode: 229, isComposing: true });
    expect(api.recall).not.toHaveBeenCalled(); fireEvent.compositionEnd(field);
  });
  it('backend failure remains an error and never becomes a successful answer', async () => {
    const api = await mount(); api.recall.mockRejectedValue(new Error('Storage unavailable'));
    await userEvent.type(screen.getByLabelText('Memory field'), 'field'); await userEvent.click(screen.getByRole('button', { name: 'Recall memory' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Storage unavailable'); expect(screen.queryByText('Independently verified receipt')).toBeNull();
  });
  it('keeps model work disabled until an actual runtime inspection', async () => {
    const api = await mount(); api.selectFiles.mockResolvedValue({ grant: { id: 'g', name: 'selected.md', file_only: true }, files: [{ id: 'r', name: 'selected.md', bytes: 40 }] });
    await userEvent.click(screen.getAllByRole('button', { name: 'Documents' })[0]); await userEvent.click(screen.getByRole('button', { name: 'Select document' }));
    await screen.findByText('Analyze with Hermes'); await userEvent.type(screen.getByLabelText('Question'), 'Explain this');
    expect((screen.getByRole('button', { name: 'Analyze document' }) as HTMLButtonElement).disabled).toBe(true); expect(api.analyze).not.toHaveBeenCalled();
  });
  it('does not mistake proposal creation for approval', async () => {
    const api = await mount(); api.proposeMemory.mockResolvedValue({ id: 'p', status: 'pending', plan: { body: { value: 30 } } });
    await userEvent.click(screen.getByRole('button', { name: 'Propose memory' }));
    const form = screen.getByRole('heading', { name: 'Propose a fact' }).closest('form')!;
    await userEvent.type(within(form).getByLabelText('Field'), 'retention_days'); await userEvent.type(within(form).getByLabelText(/Value/), '30'); await userEvent.type(within(form).getByLabelText('Your source statement'), 'Retention is 30 days.');
    await userEvent.click(within(form).getByRole('button', { name: 'Create review' }));
    await screen.findByText('Pending memory review'); expect(api.reviewMemory).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Review exact change' })); expect(api.reviewMemory).toHaveBeenCalledWith('a', 'p');
  });
  it('shows honest offline recovery without enabling resource operations', async () => {
    const api = mockAPI(); api.connect.mockResolvedValue({ state: 'offline', error: 'Owner is unavailable' }); render(<App />);
    await screen.findByText('Your backend needs attention'); expect(screen.getByRole('button', { name: 'Retry connection' })).toBeTruthy(); expect(api.inventory).not.toHaveBeenCalled();
  });
  it('does not execute source markup when inspected', async () => {
    const api = await mount(); api.recall.mockResolvedValue({ packet: { answer_status: 'supported', evidence: [{ value: '<img src=x onerror=alert(1)>', predicate: 'field', memory_id: 'x' }] } });
    await userEvent.type(screen.getByLabelText('Memory field'), 'field'); await userEvent.click(screen.getByRole('button', { name: 'Recall memory' }));
    await screen.findByText('<img src=x onerror=alert(1)>'); expect(document.querySelector('img')).toBeNull();
  });
  it('records no fake Google connection and exposes only setup status', async () => {
    const api = await mount(); api.googleStatus.mockResolvedValue({ credential_file_present: false, live_qualified: false, setup: 'Complete local account consent.' });
    await userEvent.click(screen.getAllByRole('button', { name: 'Settings' })[0]);
    await userEvent.click(within(screen.getByRole('navigation', {name:'Settings categories'})).getByRole('button', {name:'Connections'}));
    await userEvent.click(screen.getByRole('button', { name: 'Check setup status' })); await screen.findByText('Connection import required'); expect(api.googleStatus).toHaveBeenCalledWith('a');
  });
});
