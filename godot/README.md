# Last Stop

A pixel-art train game made with Godot 4.4+. Stop your train on the platform
before the rival stops. Arriving first does not win. Stopping does.

This is the indie version of the browser game in `../index.html`. It uses the
same physics, step for step.

## Open and run

1. Install Godot 4.4 or later (the standard build, not .NET).
2. Open Godot, click **Import**, and select `godot/project.godot`.
3. Press **F5** to play.

## What is in the game

| Part | Where |
|---|---|
| Physics (a port of `index.html`) | `scripts/race_sim.gd` |
| The campaign route, free-race rules, liveries | `scripts/stations.gd` |
| Screens, pixel-art scene, HUD, input | `scripts/game.gd` |
| 5x7 bitmap font drawn with rectangles | `scripts/pixel_font.gd` |
| Engine, brake, horn, rail clack, jingles, music | `scripts/synth.gd` |
| Save file (`user://last_stop.cfg`) | `scripts/save_game.gd` |
| Headless checks | `tests/test_sim.gd` |

There are no image, font or audio files. Everything is drawn or synthesized
in code at 480x270 and scaled up by whole numbers.

### Modes

- **Campaign**: 8 stations on *The Coastline*. Each has a fixed rail, platform
  length and rival. Win a station to open the next. Stars: one for a win, one
  for a win inside par, one for a stop near the stop board.
- **Free race**: opens when the campaign is complete. A random station, rail
  and rival each race. Wins give points and build a streak. The rival gets
  faster as the streak grows.
- **Garage**: five liveries. Points unlock four of them. All 24 campaign stars
  unlock the last one.

### Controls

| | Keyboard | Touch / mouse | Gamepad |
|---|---|---|---|
| Throttle | `W` / `Up` | right button | RT |
| Brake | `S` / `Down` | left button | LT |
| Pause | `Esc` / `P` | the II button, top right | |
| Restart | `R` | pause menu | |
| Menus | arrows, `Enter`, `Esc` | tap | D-pad, A, B |

On phones the levers show HOLD in place of the key names, the start, a win and
a loss give a short vibration (Android browsers), and a phone held upright
pauses the race and asks to be turned sideways. The web title screen has a
FULL SCREEN item (not on iPhone and iPad, where Safari has no full-screen API
for pages).

## Checks

```
node tools/campaign-check.mjs                          # from the repo root
godot --headless --path godot -s res://tests/test_sim.gd
```

`campaign-check.mjs` sweeps every brake point at each station. It fails if a
station cannot be won or its winning band is under 60 m. It prints the par
times that `stations.gd` uses. Run it after any change to a station.

`test_sim.gd` pins the GDScript physics to reference numbers from the same
script (which matches `index.html` exactly), then drives every screen of the
game. The GitHub Actions workflow `.github/workflows/godot.yml` runs both on
each push that touches `godot/`.

## Export

`export_presets.cfg` has presets for **Web**, **Windows**, **Linux** and
**macOS**. Install the export templates first (Editor > Manage Export
Templates), then use Project > Export. Builds go to `godot/export/`, which git
ignores.

For itch.io, upload the Web build as a zip of `export/web/` and set the
embed size to 960x540 or 1440x810. See `release/itch-page.md` for the page
text.

## Play in the browser

`.github/workflows/pages.yml` exports the Web preset on every push to `main`
and publishes it to GitHub Pages: *Last Stop* at the site root, the original
HTML game at `/classic/`. Pull requests run the same export without
publishing. Each build also runs `tools/web-audio-check.mjs` (the game makes
sound) and `tools/web-touch-check.mjs` (a finger tap reaches the menus) in
headless Chromium. One-time setup: Settings > Pages > Source: **GitHub Actions**.
