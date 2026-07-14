import { test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { App } from './App.jsx';
import { api } from './api.js';

beforeEach(() => {
  class FakeES {
    constructor() { this.listeners = {}; }
    addEventListener(type, cb) { this.listeners[type] = cb; }
    close() {}
  }
  globalThis.EventSource = FakeES;
});

test('App lists projects from getState and offers an add-session control per project', async () => {
  vi.spyOn(api, 'getState').mockResolvedValue({ sessions: [], projects: { foo: { url: 'u' } } });
  render(<App />);
  await waitFor(() => expect(screen.getByText('foo')).toBeTruthy());
  expect(screen.getByPlaceholderText(/branch/i)).toBeTruthy();
});

test('an existing same-repo folder offers both reuse and replace', async () => {
  vi.spyOn(api, 'getState').mockResolvedValue({ sessions: [], projects: {} });
  vi.spyOn(api, 'addProject').mockImplementation(async (url, opts, onStep) => {
    onStep({ step: 'exists', status: 'fail', name: 'foo', exists: true, sameRepo: true, dirtyFiles: 0, localOnlyCommits: 0, message: '/repos/foo already exists' });
  });
  render(<App />);
  fireEvent.change(screen.getByPlaceholderText('git URL to clone…'), { target: { value: 'https://example.com/foo.git' } });
  fireEvent.click(screen.getByText('Add project'));
  expect(await screen.findByText('reuse it')).toBeTruthy();
  expect(screen.getByText(/replace/)).toBeTruthy();
});

test('a different-repo folder offers replace only — reusing a stranger is meaningless', async () => {
  vi.spyOn(api, 'getState').mockResolvedValue({ sessions: [], projects: {} });
  vi.spyOn(api, 'addProject').mockImplementation(async (url, opts, onStep) => {
    onStep({ step: 'exists', status: 'fail', name: 'foo', exists: true, sameRepo: false, remoteUrl: 'https://example.com/other.git' });
  });
  render(<App />);
  fireEvent.change(screen.getByPlaceholderText('git URL to clone…'), { target: { value: 'https://example.com/foo.git' } });
  fireEvent.click(screen.getByText('Add project'));
  expect(await screen.findByText(/replace/)).toBeTruthy();
  expect(screen.queryByText('reuse it')).toBeNull();
});

test('replace names what will be lost and does nothing if declined', async () => {
  vi.spyOn(api, 'getState').mockResolvedValue({ sessions: [], projects: {} });
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  const addProject = vi.spyOn(api, 'addProject').mockImplementation(async (url, opts, onStep) => {
    onStep({ step: 'exists', status: 'fail', name: 'foo', exists: true, sameRepo: true, dirtyFiles: 2, localOnlyCommits: 1 });
  });
  render(<App />);
  fireEvent.change(screen.getByPlaceholderText('git URL to clone…'), { target: { value: 'https://example.com/foo.git' } });
  fireEvent.click(screen.getByText('Add project'));
  fireEvent.click(await screen.findByText(/replace/));
  expect(confirm.mock.calls[0][0]).toMatch(/2 modified files/);
  expect(confirm.mock.calls[0][0]).toMatch(/1 commit/);
  expect(addProject).toHaveBeenCalledTimes(1); // declined: no retry
  confirm.mockRestore();
});

test('reuse retries the add with onExisting: reuse', async () => {
  vi.spyOn(api, 'getState').mockResolvedValue({ sessions: [], projects: {} });
  const addProject = vi.spyOn(api, 'addProject').mockImplementation(async (url, opts, onStep) => {
    if (!opts.onExisting) onStep({ step: 'exists', status: 'fail', name: 'foo', exists: true, sameRepo: true, dirtyFiles: 0, localOnlyCommits: 0 });
    else onStep({ step: 'done', status: 'ok', name: 'foo' });
  });
  render(<App />);
  fireEvent.change(screen.getByPlaceholderText('git URL to clone…'), { target: { value: 'https://example.com/foo.git' } });
  fireEvent.click(screen.getByText('Add project'));
  fireEvent.click(await screen.findByText('reuse it'));
  expect(addProject.mock.calls[1][1].onExisting).toBe('reuse');
});
