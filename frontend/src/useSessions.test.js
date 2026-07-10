import { test, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSessions } from './useSessions.js';

let instances;
beforeEach(() => {
  instances = [];
  class FakeES {
    constructor() { this.listeners = {}; instances.push(this); }
    addEventListener(type, cb) { this.listeners[type] = cb; }
    emit(type, data) { this.listeners[type]?.({ data: JSON.stringify(data) }); }
    close() {}
  }
  globalThis.EventSource = FakeES;
});

test('useSessions updates from a sessions event', async () => {
  const { result } = renderHook(() => useSessions());
  act(() => instances[0].emit('sessions', [{ instance: 'app', activeState: 'active' }]));
  await waitFor(() => expect(result.current.sessions.length).toBe(1));
  expect(result.current.sessions[0].instance).toBe('app');
});
