# Battleship AI

A polished, fully client-side Battleship game built for an interview assignment. Play a standard 10×10 game against a simple but competent AI opponent.

**Live demo:** [https://battleship-ai-xxx.devinapps.com](https://battleship-ai-xxx.devinapps.com)

## Features

- Human vs. AI on a 10×10 grid
- Standard fleet: Carrier (5), Battleship (4), Cruiser (3), Submarine (3), Destroyer (2)
- Manual ship placement with horizontal/vertical rotation
- One-click **Randomize Fleet** for quick setup
- Clear hit, miss, sunk, and remaining-ship indicators
- Turn-based play with alternating turns
- Win/loss detection and a **Play Again** reset flow
- Responsive layout for desktop and mobile

## Tech stack

- **React 19** with TypeScript
- **Vite 5** for build and dev server
- **Vitest 3** + jsdom for unit and component tests
- Plain CSS for styling

## Getting started

```bash
npm install
npm run dev
```

Open `http://localhost:5173/` in your browser.

## Running tests

```bash
npm test          # run all tests once
npm run test:watch # run tests in watch mode
```

## AI strategy

The AI uses a classic "hunt vs. target" approach:

1. **Hunt mode:** fire at a random unexplored cell.
2. After a hit, switch to **target mode** and try the orthogonal neighbors.
3. Once a second hit lands, extend along the discovered line to finish the ship.
4. When a ship sinks, clear its cells from the target queue and return to hunt mode.
5. The AI never fires at the same cell twice.

All AI logic is pure and isolated in `src/logic/ai.ts` so it can be tested independently of the UI.

## Project structure

```
src/
  logic/
    types.ts      # domain types and constants
    board.ts      # pure board/ship/fire logic
    board.test.ts
    ai.ts         # pure AI decision logic
    ai.test.ts
  components/
    Board.tsx     # reusable 10×10 grid component
    Board.css
  App.tsx         # game state machine and UI
  App.test.tsx
  test/setup.ts   # jsdom test setup
```

## Bug report

See [BUG_REPORT.md](./BUG_REPORT.md) for a record of real bugs found and fixed during development and testing.
