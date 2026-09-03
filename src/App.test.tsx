import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import App from './App';
import { createMemoryHub } from './test/memoryTransport';

function enemyCells(container: HTMLElement) {
  return (within(container).getAllByRole('button') as HTMLButtonElement[]).filter(
    (button) => button.className.includes('cell-empty') && !button.disabled
  );
}

function startAiGame() {
  fireEvent.click(screen.getByRole('button', { name: /Play vs AI/ }));
  fireEvent.click(screen.getAllByText('Randomize Fleet')[0]);
  fireEvent.click(screen.getAllByText('Start Game')[0]);
}

afterEach(() => {
  window.location.hash = '';
  vi.useRealTimers();
});

describe('App component', () => {
  it('renders the mode selection screen', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: /Play vs AI/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Play a Friend/ })).toBeInTheDocument();
    expect(screen.getByText('How to Play')).toBeInTheDocument();
  });

  it('disables online play when no realtime backend is configured', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: /Play a Friend/ }).closest('button')).toBeDisabled();
    expect(screen.getByText('Coming soon')).toBeInTheDocument();
  });

  it('enters the setup phase when choosing Play vs AI', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Play vs AI/ }));
    expect(screen.getByText('Place your fleet')).toBeInTheDocument();
    expect(screen.getByText('Ship Placement')).toBeInTheDocument();
    expect(screen.getByText('vs AI')).toBeInTheDocument();
  });

  it('allows randomizing fleet and starting the game', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Play vs AI/ }));

    fireEvent.click(screen.getAllByText('Randomize Fleet')[0]);
    const startButtons = screen.getAllByText('Start Game');
    expect(startButtons[0]).not.toBeDisabled();

    fireEvent.click(startButtons[0]);
    expect(screen.getByText('Your turn')).toBeInTheDocument();
    expect(screen.getByText(/Fire at the enemy/)).toBeInTheDocument();
  });

  it('lets the player fire a shot and advances to the AI turn', () => {
    vi.useFakeTimers();
    const { container } = render(<App />);
    startAiGame();

    const cells = enemyCells(container);
    expect(cells.length).toBeGreaterThan(0);
    fireEvent.click(cells[0]);

    expect(screen.getByText('AI is firing...')).toBeInTheDocument();
    expect(screen.getByText("AI's turn")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(screen.getByText('Your turn')).toBeInTheDocument();
    expect(enemyCells(container).length).toBeGreaterThan(0);
  });

  it('result modal auto-focuses, traps Tab, and closes on Escape', () => {
    vi.useFakeTimers();
    const { container } = render(<App />);
    startAiGame();

    // Fire at every cell so the enemy fleet is sunk regardless of placement.
    for (let i = 0; i < 100; i++) {
      const cells = enemyCells(container);
      if (cells.length === 0) break;
      fireEvent.click(cells[0]);
      act(() => {
        vi.advanceTimersByTime(1500);
      });
      if (screen.queryByRole('dialog')) break;
    }

    const dialog = screen.getByRole('dialog');
    const buttons = within(dialog).getAllByRole('button');
    expect(document.activeElement).toBe(buttons[0]);

    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(buttons[buttons.length - 1]);
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(buttons[0]);

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Show result')).toBeInTheDocument();
  }, 20000);

  it('returns to the menu from a game', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Play vs AI/ }));
    fireEvent.click(screen.getByText('← Menu'));
    expect(screen.getByRole('button', { name: /Play a Friend/ })).toBeInTheDocument();
  });
});

describe('online multiplayer flow', () => {
  it('hosts a room, shows an invite link, and plays a turn against a joined guest', async () => {
    const { factory } = createMemoryHub();

    const host = render(<App transportFactory={factory} />);
    fireEvent.click(within(host.container).getByRole('button', { name: /Play a Friend/ }));

    const linkInput = (await within(host.container).findByLabelText('Invite link')) as HTMLInputElement;
    expect(linkInput.value).toMatch(/#\/game\/[0-9a-f-]{36}$/);
    expect(window.location.hash).toBe(linkInput.value.slice(linkInput.value.indexOf('#')));
    await within(host.container).findByText('Waiting for opponent to join…');

    // Host locks in a fleet before anyone has joined.
    fireEvent.click(within(host.container).getAllByText('Randomize Fleet')[0]);
    fireEvent.click(within(host.container).getAllByText('Ready')[0]);
    await within(host.container).findByText(/waiting for opponent to place ships/i);

    // A second client opens the same link.
    const roomId = linkInput.value.split('#/game/')[1];
    const guest = render(<App transportFactory={factory} />);
    // The guest's hash listener sees the existing hash on mount and auto-joins.
    await within(guest.container).findByText('Private room');
    expect(window.location.hash).toBe(`#/game/${roomId}`);

    await within(host.container).findByText('Opponent connected');
    await within(guest.container).findByText('Opponent connected');
    await within(guest.container).findByText(/Opponent: Ready/);

    fireEvent.click(within(guest.container).getAllByText('Randomize Fleet')[0]);
    fireEvent.click(within(guest.container).getAllByText('Ready')[0]);

    // Host fires first.
    await within(host.container).findByText('Your turn');
    await within(guest.container).findByText("Opponent's turn");

    fireEvent.click(enemyCells(host.container)[0]);

    await waitFor(() => {
      expect(within(host.container).getByText("Opponent's turn")).toBeInTheDocument();
    });
    expect(within(host.container).getByText(/You fired at A1: (hit!|miss\.)/)).toBeInTheDocument();
    await within(guest.container).findByText(/Opponent fired at A1/);
    expect(within(guest.container).getByText('Your turn')).toBeInTheDocument();

    // Guest shoots back and the turn returns to the host.
    fireEvent.click(enemyCells(guest.container)[0]);
    await within(host.container).findByText('Your turn');
    await within(guest.container).findByText("Opponent's turn");

    // Guest leaves: host sees the disconnect.
    guest.unmount();
    await within(host.container).findByText('Opponent disconnected. Waiting for them to rejoin');
  });
});
