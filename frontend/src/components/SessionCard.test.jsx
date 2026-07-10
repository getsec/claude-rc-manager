import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SessionCard } from './SessionCard.jsx';
import { api } from '../api.js';

function session(activeState, subState = 'running') {
  return { instance: 'app', unit: 'claude-rc@app.service', activeState, subState, restarts: 0, enabled: true };
}

beforeEach(() => {
  vi.spyOn(api, 'sessionGit').mockResolvedValue({ branch: null, added: 0, removed: 0 });
});
afterEach(() => { vi.restoreAllMocks(); });

async function settle() {
  await waitFor(() => expect(api.sessionGit).toHaveBeenCalled());
}

test('does not render the open button for an inactive/dead session', async () => {
  render(<SessionCard session={session('inactive', 'dead')} onAction={() => {}} onLogs={() => {}} onRemove={() => {}} />);
  await settle();
  expect(screen.queryByText('open ↗')).toBeNull();
});

test('renders the open button for a running session', async () => {
  render(<SessionCard session={session('active')} onAction={() => {}} onLogs={() => {}} onRemove={() => {}} />);
  await settle();
  expect(screen.getByText('open ↗')).toBeTruthy();
});

test('delete button confirms before calling onRemove', async () => {
  const onRemove = vi.fn();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  render(<SessionCard session={session('active')} onAction={() => {}} onLogs={() => {}} onRemove={onRemove} />);
  await settle();
  fireEvent.click(screen.getByText('delete'));
  expect(onRemove).toHaveBeenCalledWith('app');
});

test('delete button does nothing when confirm is cancelled', async () => {
  const onRemove = vi.fn();
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  render(<SessionCard session={session('active')} onAction={() => {}} onLogs={() => {}} onRemove={onRemove} />);
  await settle();
  fireEvent.click(screen.getByText('delete'));
  expect(onRemove).not.toHaveBeenCalled();
});

test('renders the branch and diff stat once loaded', async () => {
  api.sessionGit.mockResolvedValue({ branch: 'feat/detect', added: 42, removed: 7 });
  render(<SessionCard session={session('active')} onAction={() => {}} onLogs={() => {}} onRemove={() => {}} />);
  await waitFor(() => expect(screen.getByText('⎇ feat/detect')).toBeTruthy());
  expect(screen.getByText('+42')).toBeTruthy();
  expect(screen.getByText('-7')).toBeTruthy();
});

test('omits the diff stat when there are no changes', async () => {
  api.sessionGit.mockResolvedValue({ branch: 'main', added: 0, removed: 0 });
  render(<SessionCard session={session('active')} onAction={() => {}} onLogs={() => {}} onRemove={() => {}} />);
  await waitFor(() => expect(screen.getByText('⎇ main')).toBeTruthy());
  expect(screen.queryByText('+0')).toBeNull();
});
