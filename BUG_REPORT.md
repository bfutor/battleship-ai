# Battleship Debugging Report

The game was tested manually in the browser and with an automated Vitest suite. Manual testing covered setup (placement, rotation, randomize, clear), start game, player/AI turns, rapid clicking, win/loss detection, and reset. Automated tests cover board logic (placement, overlap, bounds, firing, sinking, fleet status) and AI behavior (hunt/target, no duplicate shots, fleet sinking).

## Bugs found, causes, and fixes

| Bug found | Cause | Fix |
| --------- | ----- | --- |
| Status message stayed as "Place your fleet" after clicking **Randomize Fleet** or **Clear**. | `randomizePlayerFleet` and `clearPlayerFleet` updated the board but forgot to call `setMessage`. | Added the correct `setMessage(...)` call in both helpers so the header reflects the new setup state. |
| After the AI finished its turn, the status did not indicate it was the player's turn again. | The AI effect only reported the AI's result (hit/miss/sunk) and did not append a "Your turn" prompt. | Appended `" Your turn."` to the AI result message when the game continues. |
| Ship placement buttons had no accessible label, causing screen readers to read concatenated text like `Carrier5Placed`. | The button content used three inline `<span>` elements with no whitespace or `aria-label`. | Added an explicit `aria-label` to each ship button in the format `"Carrier (5)"` / `"Carrier (5) — placed"`. |
| Rapid clicks on the enemy board could occasionally register two shots before the AI turn began. | The click handler used state (`phase`) to block input, but state updates are batched, so a second click could slip through before the phase switched to `'ai'`. | Introduced a `firingRef` ref that is set to `true` immediately on the first click and only cleared after the AI turn completes. |
| `npm run build` and `npm test` failed out of the box with the initially installed dependencies. | Vite 8 / Rolldown native binding was missing, `jsdom` 27 had ESM `require()` issues, React 19 removed the global `JSX` namespace, and a few unused locals/type mismatches broke `tsc -b`. | Pinned the toolchain to Vite 5.4.11, `@vitejs/plugin-react` 4.3.4, `vitest` 3.2.1, and `jsdom` 24.0.0; updated `Board.tsx` to use `React.ReactNode[]`; removed unused helpers; cast `getAllByRole('button')` to `HTMLButtonElement[]` in tests. |
| Player could not remove a placed ship by clicking it on the board — only via the ship list. | `handleSetupCellClick` only handled placement of the currently selected ship and did not detect clicks on already-occupied cells. | Updated the setup click handler so clicking a cell that already contains a ship removes that ship and selects it for repositioning. |

## Final validation

- `npm run build` completes with no TypeScript or Vite errors.
- `npm test` passes all 20 tests (12 board logic, 5 AI, 3 App component).
- Manual play-throughs completed a full game to the end (loss) and verified reset, randomize, clear, rotation, rapid-click blocking, and turn messaging.
- The deployed production build loads and runs without console errors.
