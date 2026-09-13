# Tamagochi on the MIT green building

On a 17 x 9 grid :D

This may be displayed on the actual MIT Green Building (Ames St, Cambridge, MA
02139) on the evening of September 29th, 2026. You can view it from the
[Charles River Esplanade](https://www.google.com/maps/place/Charles+River+Esplanade/@42.3565201,-71.0849577,1345m/data=!3m1!1e3!4m6!3m5!1s0x89e37a0a0667d9bf:0xf01e15e2d5decf7a!8m2!3d42.3555785!4d-71.0788785!16s%2Fm%2F0j441wr?entry=ttu&g_ep=EgoyMDI2MDkwOS4wIKXMDSoASAFQAw%3D%3D)
across the river.

All the code lives in [`tamagochi-characters-python/`](tamagochi-characters-python) —
the original Tetris game plus the pet character picker and the client for the
[Green Building sim](https://sundai.willsarg.com).

School mascots (MIT beaver, NEU husky, BU terrier, Tufts elephant, BC eagle, Boston duckling),
a flash-safe display guard, the crowd-raised pet game, and the four-school tapping race
(`race.py`) live in [`tamagochi-mascots-python/`](tamagochi-mascots-python) — stdlib only,
see its README.

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install pygame numpy keyboard
```

## Get a simulator instance

The sim hands out one random adjective-animal instance name per request — you can't
pick your own. Grab one at https://sundai.willsarg.com with the event password, or:

```bash
curl -X POST https://sundai.willsarg.com/api/instances \
  -H "Content-Type: application/json" -d '{"password":"<event password>"}'
```

This copies a `send_url`/`view_url`/`ws_url` back. Both scripts below default to the
instance `cobalt-mole` — the same one the [race website](race-worker) uses in
production (its `SIM_INSTANCE` secret) — so the whole project stays on one simulator
instance instead of everyone spinning up their own. Pass a different name as the first
argument if you want to test something without disturbing the shared one; only one
program should target a given instance at a time, or the display flickers between them.

## Run

Character picker — buttons for each pet, at 9x17 / 5x5 / 4x4, pushed live to the sim:

```bash
source .venv/bin/activate
python3 tamagochi-characters-python/character_picker.py [instance-name]
```

Tetris, streamed to the sim instead of the local pygame window:

```bash
source .venv/bin/activate
python3 tamagochi-characters-python/run_web.py [instance-name]
```

Then watch either one live at `https://sundai.willsarg.com/<instance-name>`
(add `?view=street` or `?view=river` for the other camera angles).

## The event: a mascot race

Since the display window is short (~20 min), the live show is a race: 4 school mascots
(MIT's beaver, Harvard's John Harvard, BU's terrier, Northeastern's husky) climb the
building as the crowd cheers for them from their phones. That's a separate app:

- [`race-worker/`](race-worker) — Cloudflare Worker + Durable Object: holds the race
  state, exposes the cheer/admin API, and is the only thing that talks to the sim (the
  event password stays server-side). See its README for setup/deploy.
- [`race-site/`](race-site) — the Cloudflare Pages frontend: a public cheer page and an
  admin page to start/stop/reset the race.

Someone else owns the mascot art/animation ("cheering models", `mascots` branch) and the
frame transitions; `race-worker/src/render.js` draws simple solid lane bars for now and is
meant to be swapped out once those land.
