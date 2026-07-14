import { test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from './Modal.jsx';

test('renders title and children and closes on the close button', () => {
  const onClose = vi.fn();
  render(<Modal title="Protocols" onClose={onClose}><p>body</p></Modal>);
  expect(screen.getByText('Protocols')).toBeTruthy();
  expect(screen.getByText('body')).toBeTruthy();
  fireEvent.click(screen.getByLabelText('close'));
  expect(onClose).toHaveBeenCalled();
});

test('closes on Escape', () => {
  const onClose = vi.fn();
  render(<Modal title="X" onClose={onClose}><span /></Modal>);
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(onClose).toHaveBeenCalled();
});
