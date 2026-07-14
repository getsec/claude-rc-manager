import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SessionCard } from './SessionCard.jsx';
import { api } from '../api.js';

function session(activeState, subState = 'running') {
  return { instance: 'app', unit: 'claude-rc@app.service', activeState, subState, restarts: 0, enabled: true };
}

const rcSession = (rc) => ({
  instance: 'app', activeState: 'active', subState: 'running',
  restarts: 0, since: '', enabled: true, remoteControl: rc,
});

beforeEach(() => {
  vi.spyOn(api, 'sessionGit').mockResolvedValue({ branch: null, added: 0, removed: 0 });
});
afterEach(() => { vi.restoreAllMocks(); });

async function settle() {
  await waitFor(() => expect(api.sessionGit).toHaveBeenCalled());
}

test('does not render the open button for an inactive/dead session', async () => {
  render(<SessionCard session={session('inactive', 'dead')} onAction={() => {}} onTerminal={() => {}} onRemove={() => {}} />);
  await settle();
  expect(screen.queryByText('open ↗')).toBeNull();
});

test('renders the open button for a running session', async () => {
  render(<SessionCard session={{ ...session('active'), remoteControl: true }} onAction={() => {}} onTerminal={() => {}} onRemove={() => {}} />);
  await settle();
  expect(screen.getByText('open ↗')).toBeTruthy();
});

test('delete button confirms before calling onRemove', async () => {
  const onRemove = vi.fn();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  render(<SessionCard session={session('active')} onAction={() => {}} onTerminal={() => {}} onRemove={onRemove} />);
  await settle();
  fireEvent.click(screen.getByText('delete'));
  expect(onRemove).toHaveBeenCalledWith('app');
});

test('delete button does nothing when confirm is cancelled', async () => {
  const onRemove = vi.fn();
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  render(<SessionCard session={session('active')} onAction={() => {}} onTerminal={() => {}} onRemove={onRemove} />);
  await settle();
  fireEvent.click(screen.getByText('delete'));
  expect(onRemove).not.toHaveBeenCalled();
});

test('renders the branch and diff stat once loaded', async () => {
  api.sessionGit.mockResolvedValue({ branch: 'feat/detect', added: 42, removed: 7 });
  render(<SessionCard session={session('active')} onAction={() => {}} onTerminal={() => {}} onRemove={() => {}} />);
  await waitFor(() => expect(screen.getByText('⎇ feat/detect')).toBeTruthy());
  expect(screen.getByText('+42')).toBeTruthy();
  expect(screen.getByText('-7')).toBeTruthy();
});

test('omits the diff stat when there are no changes', async () => {
  api.sessionGit.mockResolvedValue({ branch: 'main', added: 0, removed: 0 });
  render(<SessionCard session={session('active')} onAction={() => {}} onTerminal={() => {}} onRemove={() => {}} />);
  await waitFor(() => expect(screen.getByText('⎇ main')).toBeTruthy());
  expect(screen.queryByText('+0')).toBeNull();
});

test('hides the open-session button when remote control is off', () => {
  render(<SessionCard session={rcSession(false)} onAction={() => {}} onTerminal={() => {}} onRemove={() => {}} onRemoteControl={() => {}} />);
  // With RC off there is no claude.ai/code URL to open — the button would
  // only ever report "no session url yet".
  expect(screen.queryByText('open ↗')).toBeNull();
});

test('shows the open-session button when remote control is on', () => {
  render(<SessionCard session={rcSession(true)} onAction={() => {}} onTerminal={() => {}} onRemove={() => {}} onRemoteControl={() => {}} />);
  expect(screen.getByText('open ↗')).toBeTruthy();
});

test('toggling remote control confirms first, then reports the new value', () => {
  const calls = [];
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
  render(<SessionCard session={rcSession(false)} onAction={() => {}} onTerminal={() => {}} onRemove={() => {}} onRemoteControl={(n, e) => calls.push([n, e])} />);
  fireEvent.click(screen.getByTitle('remote control'));
  expect(confirm).toHaveBeenCalled();
  expect(calls).toEqual([['app', true]]);
  confirm.mockRestore();
});

test('declining the confirm does not toggle remote control', () => {
  const calls = [];
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  render(<SessionCard session={rcSession(true)} onAction={() => {}} onTerminal={() => {}} onRemove={() => {}} onRemoteControl={(n, e) => calls.push([n, e])} />);
  fireEvent.click(screen.getByTitle('remote control'));
  expect(calls).toEqual([]);
  confirm.mockRestore();
});
