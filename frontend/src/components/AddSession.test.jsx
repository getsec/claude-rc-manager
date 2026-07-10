import { test, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AddSession } from './AddSession.jsx';
import { api } from '../api.js';

test('shows an enable-multi-session picker when the backend blocks on missing coord', async () => {
  vi.spyOn(api, 'addSession').mockImplementation(async (project, branch, onStep) => {
    onStep({ step: 'coord', status: 'fail', message: 'no foo-coord exists; create it before adding a session' });
  });
  vi.spyOn(api, 'listProtocols').mockResolvedValue([{ slug: 'compose-portblock', name: 'Compose port-block' }]);
  render(<AddSession project="foo" />);
  fireEvent.change(screen.getByPlaceholderText(/branch/i), { target: { value: 'feat/x' } });
  fireEvent.click(screen.getByText(/add session/i));
  await waitFor(() => expect(screen.getByText(/^enable multi-session$/i)).toBeTruthy());
});

test('enabling multi-session retries adding the session', async () => {
  let calls = 0;
  vi.spyOn(api, 'addSession').mockImplementation(async (project, branch, onStep) => {
    calls += 1;
    if (calls === 1) onStep({ step: 'coord', status: 'fail', message: 'blocked' });
    else onStep({ step: 'done', status: 'ok' });
  });
  const enableSpy = vi.spyOn(api, 'enableMultiSession').mockImplementation(async (project, opts, onStep) => {
    onStep({ step: 'done', status: 'ok' });
  });
  vi.spyOn(api, 'listProtocols').mockResolvedValue([{ slug: 'compose-portblock', name: 'Compose port-block' }]);
  render(<AddSession project="foo" />);
  fireEvent.change(screen.getByPlaceholderText(/branch/i), { target: { value: 'feat/x' } });
  fireEvent.click(screen.getByText(/add session/i));
  await waitFor(() => expect(screen.getByText(/^enable multi-session$/i)).toBeTruthy());
  fireEvent.click(screen.getByText(/^enable multi-session$/i));
  await waitFor(() => expect(enableSpy).toHaveBeenCalledWith('foo', { protocol: 'compose-portblock' }, expect.any(Function)));
  await waitFor(() => expect(calls).toBe(2));
});
