# Battleship AI

A polished Battleship game. Play a standard 10×10 game against a simple but competent AI opponent, or invite a friend with a shareable link for realtime human-vs-human play.

**Play now:** [https://dist-vtepytuc.devinapps.com](https://dist-vtepytuc.devinapps.com) (AI mode; online play is coming soon)

**Repository:** [https://github.com/bfutor/battleship-ai](https://github.com/bfutor/battleship-ai)

## Features

- Human vs. AI on a 10×10 grid
- **Play a Friend:** realtime online multiplayer via a shareable `#/game/<roomId>` link (Supabase Realtime)
- Standard fleet: Carrier (5), Battleship (4), Cruiser (3), Submarine (3), Destroyer (2)
- Manual ship placement with horizontal/vertical rotation
- One-click **Randomize Fleet** for quick setup
- Naval-themed UI with animated hit/miss/sunk cells, ship silhouettes, and a pulsing active board
- Prominent turn banner with a per-turn timer
- Live scoreboard: hits, misses, and moves
- Win/loss overlay with confetti and **Play Again** / **New Game** actions
- Local "Best Wins" ranking by number of moves
- Collapsible **How to Play** instructions for first-time players
- Responsive layout for desktop and mobile

## Tech stack

- **React 19** with TypeScript
- **Vite 5** for build and dev server
- **Vitest 3** + jsdom for unit and component tests
- **Supabase Realtime** (broadcast + presence) for online play
- Plain CSS with CSS variables for styling

## Getting started

```bash
npm install
npm run dev
```

Open `http://localhost:5173/` in your browser. AI mode works out of the box; online play needs the env vars below.

### Online multiplayer setup

Multiplayer uses [Supabase Realtime](https://supabase.com/docs/guides/realtime) channels — no database tables or server code are needed, just a free Supabase project.

1. Create a project at [supabase.com](https://supabase.com) and copy the **Project URL** and **anon public** key from *Project Settings → API*.
2. Copy `.env.example` to `.env` and fill in:

   | Variable | Description |
   | --- | --- |
   | `VITE_SUPABASE_URL` | Your Supabase project URL |
   | `VITE_SUPABASE_ANON_KEY` | Your Supabase anon (public) key |

3. Restart `npm run dev`. The **Play a Friend** card shows **Coming soon** and stays disabled until both variables are present.

For production builds set the same variables in your hosting provider's environment.

### How the shareable link works

- Choosing **Play a Friend** generates a `roomId` with `crypto.randomUUID()`, joins the Supabase channel `battleship:<roomId>`, and sets the URL hash to `#/game/<roomId>`.
- The invite card shows the full link with a **Copy** button. Anyone opening `https://<host>/#/game/<roomId>` auto-joins that room as the guest; a third visitor is told the room is full.
- Both players place their fleets locally and press **Ready**. The match starts when both are ready; the host fires first.
- Turns alternate over realtime events. Only shot coordinates and their result (hit / miss / sunk, plus the sunk ship's cells) are ever sent — nobody's ship layout leaves their browser until a ship is sunk.
- Status messages cover waiting for an opponent, waiting for the opponent to place ships, and opponent disconnects.

The transport is abstracted behind a small `RoomTransport` interface in `src/logic/multiplayer.ts`, so swapping Supabase for another backend (Firebase, PeerJS/WebRTC) only requires a new transport factory.

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
    multiplayer.ts      # framework-agnostic room/turn sync + Supabase transport
    multiplayer.test.ts
  components/
    Board.tsx     # reusable 10×10 grid component
    Board.css
  App.tsx         # mode selection, game state machine and UI
  App.test.tsx
  test/setup.ts   # jsdom test setup
  test/memoryTransport.ts # in-memory RoomTransport used by tests
```

## Bug report

See [BUG_REPORT.md](./BUG_REPORT.md) for a record of real bugs found and fixed during development and testing.
