# Tower Tamagotchi

A crowd-raised pet for the MIT Green Building facade (17 floors x 9 windows, RGB, 30 fps).
Students from Boston/Cambridge schools feed and play with one shared mascot on the building.
Pure Python stdlib, no installs.

```bash
python3 mascot_show.py --instance <name>              # mascot lineup on the simulator (loops)
python3 mascot_show.py --instance <name> --only husky # one mascot
python3 mascot_show.py --clips clips/                 # .bin demo clips in the simulator's format
python3 main.py --instance <name>                     # the interactive pet + phone API
python3 main.py --bots 20 --hatched                   # fake crowd, local preview at :8140/preview
python3 race.py --instance <name>                     # four-school tapping race, phones at :8000
python3 -m unittest discover tests                    # flash-safety checks
```

Create a simulator instance at sundai.willsarg.com (event password required) and pass its name.

## Photosensitivity safety

Every output path runs through `tower/safety.py`'s `FlashGuard`:

- brightness fades instead of cutting (a full 0 → 255 swing takes at least 0.3 s)
- each window and the facade as a whole are tracked with the WCAG 2.3.1 flash definition
  (10% relative-luminance reversals); anything that would exceed **2 flashes/s** is held back
  (WCAG's limit is 3)

`tests/test_safety.py` proves the guard stops a 10 Hz strobe and checks every shipped animation.
Design rules on top of the guard: no strobes, no full-facade colour flashes, no blinking warnings,
slow hops (fast motion reads as flicker on a building this size), no pure 255 white (it blooms).

## Mascots

One 9 x 9 drawing each in `tamagotchi/mascots.py`; idle / blink / eat / sleep / sad poses are derived
from it (`E` = eye, `M` = mouth). The baby stage is the top rows of the drawing.

| Mascot | School |
| --- | --- |
| Tim the Beaver | MIT |
| Paws the Husky | Northeastern |
| Rhett the Terrier | BU |
| Jumbo the Elephant | Tufts |
| Baldwin the Eagle | Boston College |
| Make Way Duckling | everyone else |

The showcase routine (12 s each, on black): ride down the floors → idle + blink → eat → one hop →
doze off → wake → ride back up. In the interactive game the pet wears the mascot of whichever school
has interacted most in the last 5 minutes.

## Interactive game

| Floors | What's shown |
| --- | --- |
| 0 | Dim colour of the school that acted last |
| 1-11 | The mascot; food drops in, hearts float up |
| 12 | Ground; poop piles up when nobody cleans |
| 13-16 | Stat bars: hunger, happy, energy, clean (solid red under 20) |

The egg hatches after 50 crowd taps; baby → adult after 1500 care points; every 2 minutes a school
leaderboard takes over; 1-7am the pet sleeps and the facade dims.

### HTTP API (for the website)

| Method | Path | Body / response |
| --- | --- | --- |
| `POST` | `/api/action` | `{"action": "feed" \| "play" \| "pet" \| "clean" \| "sleep" \| "cheer", "school": "<id>"}` → `{"ok": true, "state": {...}}`; `429` if the same client acts within 0.6 s |
| `GET` | `/api/state` | `{stage, mood, stats{hunger,happy,energy,clean}, care, hatch_at, adult_at, hype, leaderboard[[school, n]], totals}` |
| `GET` | `/api/schools` | `[[id, display name], ...]` |
| `GET` | `/api/frame` | current 17 x 9 x `[r,g,b]` frame (draw a mini tower on the site) |

`tamagotchi/web/controller.html` is a bare reference client. The rate limit is keyed on client IP; if
the website proxies calls through its backend, forward a per-user id instead.

## Mascot Race

`race.py` is the crowd game for the night of the event: MIT, Harvard, BU and Northeastern each
own two window columns and the crowd cheers their colour up the tower. Players open
`http://<this machine>:8000/` (QR code it) and hit their school's cheer button; one cheer per
phone per 0.6 s (`--cooldown`), 60 cheers to fill the tower (`--taps`).

The phone UI is `race-site/index.html` from `main` - the same page Cloudflare Pages serves -
so `race.py` is a drop-in replacement for the `race-worker` backend: same `/api/cheer` and
`/api/state` contract, same four school ids, but the frames come from `Renderer` instead of
the Worker's solid bars. It serves its own `config.js` (`API_BASE = ""`) so the page talks to
this process rather than the deployed Worker, and rewrites the page's `--mit` / `--harvard` /
`--bu` / `--neu` CSS variables to `scenes.SCHOOL_COLORS` on the way out, so a phone and the
facade show each school in the same one colour. Get the frontend with
`git checkout origin/main -- race-site`, or point `--site` at any checkout of it - including
the `mascots` branch's page, which reads the `champion` / `introducing` / `phaseEndsAt` fields
this server already sends and names each mascot as it is introduced.

| Phase | What the building shows |
| --- | --- |
| Reign (6 s) | the King of the Charles - last race's winner, the Duck King until someone wins - idles crowned over the river |
| Intro (22 s) | the king bows, its crown lifts to the top and melts into the gold finish line, the king waddles off the side of the tower, then each challenger in turn rises big over a strip of its school colour, cheers, blinks and takes its lane |
| Countdown (3 s) | 3, 2, 1 above the challengers |
| Race | each school's two windows fill with its colour, floor by floor, crest lit, on the stage the scenes left: gold finish line on top, the Charles at the bottom |
| Flash (1.4 s) | the winner's lane goes white, the other three fade out |
| Expand (2 s) | the winner's colour sweeps sideways across all nine windows, sparks |
| Mascot (15 s) | the winner's 9x9 mascot wearing the king's own crown, confetti overhead - then the loop starts over with them on the throne |

The first three are `tamagotchi/scenes.py`, ported beat-for-beat from `race-worker/src/scenes.js`
on the `mascots` branch; `tests/test_scenes.py` keeps the port honest, including the hand-off
rule that the last frame of each scene is the first frame of the next. Only the palette differs:
lane, pedestal and finish-line colours come from `scenes.SCHOOL_COLORS`, which are the tower's
own rather than the site's CSS.

| Method | Path | Body / response |
| --- | --- | --- |
| `GET` | `/` | `race-site/index.html` - the cheer page |
| `GET` | `/config.js` | `API_BASE = ""`, overriding the site's deployed-Worker config |
| `POST` | `/api/cheer` | `{"school": "mit"}` → `{"ok": true, "state": {...}}`; `429` inside the cooldown |
| `GET` | `/api/state` | `{status, winner, progressCols{}}` - what the site polls every 500 ms |
| `GET` | `/state` | the raw `{phase, winner, elapsed, taps{}, fills{}}`, for debugging the tower |

## Layout

```
mascot_show.py          mascot-only showcase: simulator, JSON export, .bin clips
main.py                 interactive game server + render loop
race.py                 four-school tapping race: server, phone UI, render loop
demo_reel.py            scripted 72 s story of the game
tamagotchi/mascots.py   mascot drawings + derived poses (+ 2x3 lane minis)
tamagotchi/scenes.py    reign / intro / countdown, ported from the `mascots` branch
tamagotchi/pet.py       stats, stages, actions, crowd metrics
tamagotchi/render.py    game state -> 17 x 9 frames
tamagotchi/sprites.py   egg + heart pixel art
tamagotchi/schools.py   school ids + tower colours
tower/display.py        Frame, WebDisplay (simulator), colour helpers
tower/safety.py         FlashGuard + WCAG flash analyzer
tower/font.py           3x5 pixel font + scroller
```
