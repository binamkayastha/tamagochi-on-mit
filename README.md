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
instance `misty-newt`; pass a different name as the first argument if that one is
ever reset (only one program should target an instance at a time — two at once makes
the display flicker between them).

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
