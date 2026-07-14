import { test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EnableMultiSession } from './EnableMultiSession.jsx';
import { api } from '../api.js';

beforeEach(() => {
  vi.spyOn(api, 'listProtocols').mockResolvedValue([{ slug: 'compose-portblock', name: 'Compose port-block' }]);
});

test('reveals a protocol picker on click, and enabling calls the API then onDone', async () => {
  const onDone = vi.fn();
  vi.spyOn(api, 'enableMultiSession').mockImplementation(async (name, opts, onStep) => {
    onStep({ step: 'done', status: 'ok' });
  });
  render(<EnableMultiSession project="foo" onDone={onDone} />);
  fireEvent.click(screen.getByText(/enable multi-session/i));
  await waitFor(() => expect(screen.getByText('Compose port-block')).toBeTruthy());
  fireEvent.click(screen.getByText('enable'));
  await waitFor(() => expect(api.enableMultiSession).toHaveBeenCalledWith('foo', { protocol: 'compose-portblock' }, expect.any(Function)));
  await waitFor(() => expect(onDone).toHaveBeenCalled());
});
