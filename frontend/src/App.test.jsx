import { test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
