import { test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { Protocols } from './Protocols.jsx';
import { api } from '../api.js';

beforeEach(() => {
  vi.spyOn(api, 'listProtocols').mockResolvedValue([{ slug: 'compose-portblock', name: 'Compose port-block', description: 'd', vars: { PG_BASE: '5432' } }]);
  vi.spyOn(api, 'getProtocol').mockResolvedValue({ slug: 'compose-portblock', name: 'Compose port-block', description: 'd', vars: { PG_BASE: '5432' }, body: '# hi' });
});

test('lists protocols and loads one into the editor on select', async () => {
  render(<Protocols onClose={() => {}} />);
  await waitFor(() => expect(screen.getByText('Compose port-block')).toBeTruthy());
  fireEvent.click(screen.getByText('Compose port-block'));
  await waitFor(() => expect(screen.getByDisplayValue('# hi')).toBeTruthy());
});
