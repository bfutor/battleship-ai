import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import App from './App';

describe('App component', () => {
  it('renders the setup phase', () => {
    render(<App />);
    expect(screen.getByText('Place your fleet')).toBeInTheDocument();
    expect(screen.getByText('Ship Placement')).toBeInTheDocument();
  });

  it('allows randomizing fleet and starting the game', () => {
    render(<App />);

    const randomizeButtons = screen.getAllByText('Randomize Fleet');
    fireEvent.click(randomizeButtons[0]);

    const startButtons = screen.getAllByText('Start Game');
    expect(startButtons[0]).not.toBeDisabled();

    fireEvent.click(startButtons[0]);
    expect(screen.getByText(/Your turn|fire at the enemy/)).toBeInTheDocument();
  });

  it('lets the player fire a shot and advances to the AI turn', () => {
    vi.useFakeTimers();
    render(<App />);

    // Randomize and start.
    fireEvent.click(screen.getAllByText('Randomize Fleet')[0]);
    fireEvent.click(screen.getAllByText('Start Game')[0]);

    // Click the first enabled enemy cell.
    const enemyCells = (screen.getAllByRole('button') as HTMLButtonElement[]).filter(
      (button) => button.className.includes('cell-empty') && !button.disabled
    );
    expect(enemyCells.length).toBeGreaterThan(0);

    fireEvent.click(enemyCells[0]);

    // The AI turn should be active.
    expect(screen.getByText('AI is firing...')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    // After the AI turn, the player can fire again.
    const nextCells = (screen.getAllByRole('button') as HTMLButtonElement[]).filter(
      (button) => button.className.includes('cell-empty') && !button.disabled
    );
    expect(nextCells.length).toBeGreaterThan(0);

    vi.useRealTimers();
  });
});
