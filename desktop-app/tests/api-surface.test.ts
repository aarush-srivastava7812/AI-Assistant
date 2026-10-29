import { expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createHandlers } from '../src/main/broker';
import release from '../FEATURES.json';
it('every exposed preload intent has one actual privileged handler, with no generic escape hatch', () => {
  const source = readFileSync(path.resolve(process.cwd(), 'src/preload/index.ts'), 'utf8');
  expect(source).toContain('const methods = release.preload_methods');
  const names = release.preload_methods;
  const handlers = createHandlers({ call: vi.fn() }, { pick: vi.fn(), confirm: vi.fn() }, { status: vi.fn(), connect: vi.fn() });
  expect(new Set(names.filter(n=>!n.startsWith('setup')&&!['importConnections','disconnectConnection','quitApp'].includes(n)))).toEqual(new Set(Object.keys(handlers)));
  expect(names).not.toContain('invoke'); expect(names).not.toContain('exec'); expect(names).not.toContain('call');
});
it('uses one declared set for routes and palette, excluding unfinished features', () => {
  expect(release.variant).toBe('workspace-parity');
  expect(new Set(release.navigation.map(p => p.id)).size).toBe(release.navigation.length);
  expect(release.navigation.map(p => p.id)).not.toContain('scheduler');
  for (const route of ['chat_start','schedule_create','connections_configure','worker_action_decide']) expect(release.backend_operations).not.toContain(route);
});
