import { test, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MultiAgentEditor } from './MultiAgentEditor.jsx';
import { api } from '../api.js';

test('loads and displays the stored markdown, then saves edits', async () => {
  vi.spyOn(api, 'getMultiAgent').mockResolvedValue({ multiAgentMd: '# hi' });
  const save = vi.spyOn(api, 'saveMultiAgent').mockResolvedValue({ ok: true });
  render(<MultiAgentEditor project="foo" onClose={() => {}} />);
  await waitFor(() => expect(screen.getByDisplayValue('# hi')).toBeTruthy());
  fireEvent.change(screen.getByDisplayValue('# hi'), { target: { value: '# updated' } });
  fireEvent.click(screen.getByText('Save'));
  expect(save).toHaveBeenCalledWith('foo', '# updated');
});

test('re-sync replaces the editor content with the server response', async () => {
  vi.spyOn(api, 'getMultiAgent').mockResolvedValue({ multiAgentMd: '# old' });
  vi.spyOn(api, 'resyncMultiAgent').mockResolvedValue({ multiAgentMd: '# synced' });
  render(<MultiAgentEditor project="foo" onClose={() => {}} />);
  await waitFor(() => expect(screen.getByDisplayValue('# old')).toBeTruthy());
  fireEvent.click(screen.getByText(/re-sync/i));
  await waitFor(() => expect(screen.getByDisplayValue('# synced')).toBeTruthy());
});
