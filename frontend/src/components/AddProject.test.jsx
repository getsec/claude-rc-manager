import { test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AddProject } from './AddProject.jsx';
import { api } from '../api.js';

beforeEach(() => {
  vi.spyOn(api, 'listProtocols').mockResolvedValue([{ slug: 'compose-portblock', name: 'Compose port-block' }]);
});

test('submitting a git URL calls onSubmit with the trimmed value and empty opts', () => {
  const onSubmit = vi.fn();
  render(<AddProject onSubmit={onSubmit} busy={false} />);
  fireEvent.change(screen.getByPlaceholderText(/git url/i), { target: { value: '  https://x/foo.git  ' } });
  fireEvent.click(screen.getByText(/add project/i));
  expect(onSubmit).toHaveBeenCalledWith('https://x/foo.git', {});
});

test('does not submit while busy', () => {
  const onSubmit = vi.fn();
  render(<AddProject onSubmit={onSubmit} busy={true} />);
  fireEvent.change(screen.getByPlaceholderText(/git url/i), { target: { value: 'https://x/foo.git' } });
  fireEvent.click(screen.getByText(/add project/i));
  expect(onSubmit).not.toHaveBeenCalled();
});

test('toggling multi-session loads protocols and includes the pick in onSubmit', async () => {
  const onSubmit = vi.fn();
  render(<AddProject onSubmit={onSubmit} busy={false} />);
  fireEvent.click(screen.getByLabelText(/multi-session/i));
  await waitFor(() => expect(screen.getByText('Compose port-block')).toBeTruthy());
  fireEvent.change(screen.getByPlaceholderText(/git url/i), { target: { value: 'https://x/foo.git' } });
  fireEvent.click(screen.getByText(/add project/i));
  expect(onSubmit).toHaveBeenCalledWith('https://x/foo.git', { multiSession: true, protocol: 'compose-portblock' });
});
