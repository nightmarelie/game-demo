# Pixel Scroller — Hero vs Goblin

## How to run
1. Copy your generated sprite sheets into `assets/` with these filenames:
   - `assets/hero.png` — your **new hero** sheet (e.g., the green-hood rogue).
   - `assets/goblin.png` — your **goblin** enemy sheet.
2. Open `index.html` in a browser (double-click). For best results, use a simple HTTP server.

## Controls
- **Arrow Left/Right** — move
- **Space** — jump
- **K** — attack

## Adjusting to your sheet
Edit `CONFIG` at the top of `game.js`:
- `cols`, `rows` must match your sheet's grid.
- The frame size is auto-calculated from the image and `cols/rows`.
- Update each `anim` mapping to reflect the row (0-based) and the range of columns for each action.
- Tweak `hitbox` and `attackBox` if your art is tighter/looser.

## Notes
- Health is shown as hearts. Kill the goblin to win.
- You can add more enemies by cloning the goblin logic.
