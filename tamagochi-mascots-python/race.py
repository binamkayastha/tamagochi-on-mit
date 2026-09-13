"""Mascot Race - four schools cheer their colour up the 17 x 9 Green Building facade.

    python3 race.py --instance <name>     # race on the simulator (or the real building)
    python3 race.py                       # phones only, no display

Each school owns two window columns; every cheer from a phone raises that school's bar by
one floor's worth. The first school to fill all 17 floors takes the whole facade: a flash,
its colour sweeping sideways, then its mascot wearing a crown while confetti falls.

The phone UI is `race-site/index.html` from main - the same page the Cloudflare Worker
serves - so this process is a drop-in backend for it: same `/api/cheer` + `/api/state`
contract, same four schools, but the frames come from `Renderer` below instead of the
Worker's solid bars. Players open http://<this machine>:8000/ - put that behind a QR code.
"""

import argparse
import json
import math
import random
import socket
import threading
import time
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from tamagotchi import scenes
from tamagotchi.mascots import MASCOTS
from tower.display import COLS, MAX_FPS, ROWS, WHITE, Frame, MultiDisplay, WebDisplay, mix, scale
from tower.safety import FlashGuard

SITE = Path(__file__).resolve().parent.parent / "race-site"  # the frontend, straight from main
TAPS_TO_WIN = 60   # floors' worth of cheers; ~15 per school per floor at the event
COOLDOWN = 0.6     # seconds between cheers from one phone, so nobody can solo the race
FINISH_COLS = 8    # the site draws progress as 0..8 columns; the tower is 17 floors


@dataclass(frozen=True)
class Team:
    id: str
    label: str
    mascot: str
    cols: tuple     # the two window columns this school fills
    color: tuple    # tower colour - the four have to stay apart at 400 m


# Roster, ids and lanes are the site's (race-site/index.html): MIT, Harvard, BU, Northeastern.
# Colours come from scenes.SCHOOL_COLORS - the tower's own, not the site's CSS: school crimsons
# are too close to tell apart at 400 m (MIT #a31f34 vs BU #cc0000), and NEU's near-white blooms.
TEAMS = {
    t.id: t
    for t in [
        Team("mit", "MIT", "beaver", (0, 1), scenes.SCHOOL_COLORS["mit"]),
        Team("harvard", "Harvard", "john-harvard", (2, 3), scenes.SCHOOL_COLORS["harvard"]),
        Team("bu", "BU", "terrier", (5, 6), scenes.SCHOOL_COLORS["bu"]),
        Team("neu", "Northeastern", "husky", (7, 8), scenes.SCHOOL_COLORS["neu"]),
    ]
}

RACE_TOP = 1                 # the lanes fill rows 1-15, between the finish line and the river
RACE_BOTTOM = scenes.RIVER_ROW - 1
FLOORS = RACE_BOTTOM - RACE_TOP + 1
MASCOT_TOP = 8               # the 9 x 9 mascot sits on floors 8-16
CROWN_TOP = MASCOT_TOP - 2   # the king's own crown, now on the winner's head
SKY = CROWN_TOP              # everything above the crown is sky: confetti only

# "race" runs until somebody wins; the rest are on a clock (seconds). The three scenes before
# it are tamagotchi/scenes.py, ported from the `mascots` branch: last race's winner reigns as
# King of the Charles, abdicates over the intro, and the challengers line up for the count.
PHASES = {"flash": 1.4, "expand": 2.0, "mascot": 15.0,
          "reign": 6.0, "intro": scenes.INTRO_SECONDS, "countdown": scenes.COUNTDOWN_SECONDS}
NEXT_PHASE = {"flash": "expand", "expand": "mascot", "mascot": "reign",
              "reign": "intro", "intro": "countdown", "countdown": "race"}


class Race:
    """Tap counts + the phase clock. Every method is safe to call from any thread."""

    def __init__(self, taps_to_win=TAPS_TO_WIN, now=None):
        self.taps_to_win = taps_to_win
        self._lock = threading.Lock()
        self.winner = None
        self._reset(time.monotonic() if now is None else now)

    def _reset(self, now):
        """Back to the top of the loop: whoever just won reigns over the next intro."""
        self.taps = dict.fromkeys(TEAMS, 0)
        self.champion, self.winner = self.winner, None
        self.phase, self.since = "reign", now

    def tap(self, team_id, now=None):
        now = time.monotonic() if now is None else now
        with self._lock:
            if self.phase == "race":  # taps after the finish belong to the next race
                self.taps[team_id] += 1
                if self.taps[team_id] >= self.taps_to_win:
                    self.phase, self.winner, self.since = "flash", team_id, now
            return self._snapshot(now)

    def tick(self, now=None):
        """Advance the phase clock and hand the renderer the state to draw."""
        now = time.monotonic() if now is None else now
        with self._lock:
            while self.phase != "race" and now - self.since >= PHASES[self.phase]:
                self.since += PHASES[self.phase]
                if NEXT_PHASE[self.phase] == "reign":
                    self._reset(self.since)
                else:
                    self.phase = NEXT_PHASE[self.phase]
            return self._snapshot(now)

    def state(self, now=None):
        with self._lock:
            return self._snapshot(time.monotonic() if now is None else now)

    def restart(self, now=None):
        """Play the show from the top, exactly as it runs at startup: nobody has won yet, so
        the Duck King is back on the throne."""
        with self._lock:
            self.winner = None
            self._reset(time.monotonic() if now is None else now)

    def _snapshot(self, now):
        return {
            "phase": self.phase,
            "winner": self.winner,
            "champion": self.champion,   # last race's winner: the king the intro dethrones
            "elapsed": now - self.since,
            "remaining": PHASES[self.phase] - (now - self.since) if self.phase in PHASES else None,
            "taps_to_win": self.taps_to_win,
            "taps": dict(self.taps),
            "fills": {k: min(1.0, v / self.taps_to_win) for k, v in self.taps.items()},
        }


class Renderer:
    """Race state -> 17 x 9 frames."""

    def __init__(self, seed=7):
        self.rng = random.Random(seed)
        self.i = 0
        self.phase = None
        self.bits = []  # sparks / confetti: [col, row, floors per second, colour, life]

    def render(self, state):
        if state["phase"] != self.phase:
            self.bits, self.phase = [], state["phase"]
        t = state["elapsed"]
        if self.phase == "reign":
            frame = scenes.reign_frame(t, state["champion"])
        elif self.phase == "intro":
            frame = scenes.intro_frame(t, state["champion"], PHASES["intro"])
        elif self.phase == "countdown":
            frame = scenes.countdown_frame(t, PHASES["countdown"])
        else:
            frame = Frame()
            if self.phase == "race":
                self._race(frame, state["fills"], t)
            elif self.phase == "flash":
                self._flash(frame, state, t / PHASES["flash"])
            elif self.phase == "expand":
                self._expand(frame, state, t / PHASES["expand"])
            else:
                self._mascot(frame, state)
        self.i += 1
        return frame

    def _race(self, frame, fills, t, winner=None):
        """The race: each school's two windows fill with its colour, floor by floor.

        It plays on the stage the scenes left behind - gold finish line on top, the Charles
        at the bottom - so the countdown hands over without the building changing shape.
        """
        for row in range(ROWS):
            frame.fill_row(row, scenes.OFF)
        # the finish line: gold, or the winner's colour once someone's won
        frame.fill_row(0, TEAMS[winner].color if winner else scenes.BANNER)
        frame.fill_row(scenes.RIVER_ROW, scenes.RIVER)       # the Charles
        for team in TEAMS.values():
            height = fills[team.id] * FLOORS
            for floor in range(FLOORS):
                level = height - floor   # >1 submerged, 0-1 the crest, <=0 still empty
                for col in team.cols:
                    if level <= 0:
                        px = mix(scenes.OFF, team.color, 0.18)   # unlit lane, still a lane
                    else:
                        shimmer = 0.80 + 0.16 * math.sin(t * 2.4 - floor * 0.55 + col)
                        px = scale(team.color, shimmer * min(1.0, level))
                        if level <= 1.0:                         # the surface catches the light
                            px = mix(px, WHITE, 0.3 * level)
                    frame.set(RACE_BOTTOM - floor, col, px)

    def _flash(self, frame, state, p):
        """The winner's lane whites out; the rest of the climb fades off the building."""
        win = TEAMS[state["winner"]]
        self._race(frame, state["fills"], 0.0, state["winner"])
        for row in range(ROWS):
            for col in range(COLS):
                if col in win.cols:
                    frame.px[row][col] = mix(win.color, WHITE, min(1.0, 1.6 * p))
                else:
                    frame.px[row][col] = scale(frame.px[row][col], max(0.0, 1.0 - p))

    def _expand(self, frame, state, p):
        win = TEAMS[state["winner"]]
        reach = p * (COLS + 1)
        for col in range(COLS):
            distance = min(abs(col - c) for c in win.cols)
            if distance > reach:
                continue
            px = mix(win.color, WHITE, 0.55 * max(0.0, 1.0 - (reach - distance)))
            for row in range(ROWS):
                frame.set(row, col, px)
        if self.rng.random() < 0.6:
            self.bits.append([self.rng.randrange(COLS), float(self.rng.randrange(ROWS)), 0.0,
                              mix(WHITE, win.color, 0.3), 1.0])
        self._bits(frame, decay=0.07, floor=ROWS)

    def _mascot(self, frame, state):
        win = TEAMS[state["winner"]]
        mascot = MASCOTS[win.mascot]
        for row in range(ROWS):
            frame.fill_row(row, scale(win.color, 0.10))  # the school tints the whole facade
        if self.rng.random() < 0.10:
            self.bits.append([self.rng.randrange(COLS), -1.0, 1.5,
                              self.rng.choice([win.color, scenes.GOLD, WHITE]), 1.0])
        self._bits(frame, decay=0.0, floor=SKY)
        scenes.blit(frame, scenes.CROWN[0], CROWN_TOP, (COLS - 5) // 2, scenes.CROWN[1])
        pose = "blink" if self.i % 100 < 10 else "idle"
        frame.blit(mascot.poses()[pose], MASCOT_TOP, 0, mascot.colors())

    def _bits(self, frame, decay, floor):
        """Move, draw and retire the particles; they stop at `floor`."""
        alive = []
        for col, row, fall, color, life in self.bits:
            row, life = row + fall / MAX_FPS, life - decay
            if life <= 0 or row >= floor:
                continue
            frame.add(round(row), col, color, min(1.0, life))
            alive.append([col, row, fall, color, life])
        self.bits = alive


# main's index.html knows idle / running / finished, so the three scenes all report `idle` -
# "Waiting for the race to start...", cheer buttons disabled. The mascots branch's page reads
# intro / countdown / champion / introducing instead; those fields are sent either way, so
# pointing --site at that checkout is the only change needed to drive it.
SITE_STATUS = {"reign": "idle", "intro": "idle", "countdown": "idle", "race": "running",
               "flash": "finished", "expand": "finished", "mascot": "finished"}


def site_state(state):
    """The race in the Worker's shape: status, who's on the throne, who's being introduced,
    and progress in 0..8 columns."""
    now_ms = time.time() * 1000
    return {
        "status": SITE_STATUS[state["phase"]],
        "winner": state["winner"],
        "champion": state["champion"],
        "introducing": scenes.introducing_at(state["elapsed"]) if state["phase"] == "intro" else None,
        "progressCols": {k: round(v * FINISH_COLS, 2) for k, v in state["fills"].items()},
        "serverTime": round(now_ms),
        "phaseEndsAt": round(now_ms + state["remaining"] * 1000) if state["remaining"] else None,
    }


def page(site):
    """The site's index.html, with the lane colours repainted to the tower's.

    The page ships school hex codes (MIT #a31f34, BU #cc0000, NEU #f4f4f4); the building can't
    use those - see TEAMS. Rather than fork the file, override the CSS variables on the way out
    so a phone and the facade show each school in the same one colour.
    """
    css = "".join(f"--{i}: rgb({c[0]},{c[1]},{c[2]});" for i, c in scenes.SCHOOL_COLORS.items())
    html = (site / "index.html").read_text()
    return html.replace("</head>", f"<style>:root{{{css}}}</style>\n</head>", 1).encode()


def make_handler(race, cooldown, site=SITE, restart_on_load=True):
    last_cheer = {}
    html = page(site)
    # The site's own config.js points at the deployed Worker; serving our own sends it here.
    config = b'const API_BASE = "";\n'

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def _send(self, status, body, content_type="application/json"):
            data = body if isinstance(body, bytes) else json.dumps(body).encode()
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            path = self.path.split("?")[0]
            if path == "/":
                if restart_on_load:      # reloading the page replays the show from the duck
                    race.restart()
                self._send(200, html, "text/html; charset=utf-8")
            elif path == "/config.js":
                self._send(200, config, "application/javascript")
            elif path == "/api/state":
                self._send(200, site_state(race.state()))
            elif path == "/state":
                self._send(200, race.state())  # the raw phase/fills, for debugging the tower
            else:
                self._send(404, {"error": "not found"})

        def do_POST(self):
            if self.path.split("?")[0] not in ("/api/cheer", "/tap"):
                return self._send(404, {"error": "not found"})
            try:
                body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
                school = body["school"]
            except (ValueError, KeyError):
                return self._send(400, {"error": 'expected {"school": "mit"}'})
            if school not in TEAMS:
                return self._send(400, {"error": f"unknown school {school}"})
            client = self.client_address[0]
            now = time.monotonic()
            if now - last_cheer.get(client, -cooldown) < cooldown:
                return self._send(429, {"error": "cheering too fast"})
            state = race.tap(school, now)
            if state["phase"] != "race":  # the scenes and the finale don't take cheers
                return self._send(409, {"error": "the race isn't running", "state": site_state(state)})
            last_cheer[client] = now
            self._send(200, {"ok": True, "state": site_state(state)})

    return Handler


def render_loop(race, renderer, display, fps):
    interval = 1 / fps
    while True:
        started = time.monotonic()
        display.send(renderer.render(race.tick(started)))
        time.sleep(max(0.0, interval - (time.monotonic() - started)))


def scripted_frames(seconds=60, fps=MAX_FPS, seed=5):
    """The whole show played by fake thumbs - reign, intro, countdown, climb, win, reset."""
    rng = random.Random(seed)
    race, renderer, guard = Race(now=0.0), Renderer(seed), FlashGuard()
    for i in range(int(seconds * fps)):
        t = i / fps
        if race.phase == "race" and rng.random() < 0.7:
            race.tap(rng.choice(list(TEAMS)), t)
        yield guard.filter(renderer.render(race.tick(t)))


def local_ip():
    """The address a phone on the same wifi can reach, not 127.0.0.1."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--instance", help="simulator instance name (from sundai.willsarg.com)")
    p.add_argument("--api", default="https://sundai.willsarg.com/api")
    p.add_argument("--port", type=int, default=8000)
    p.add_argument("--taps", type=int, default=TAPS_TO_WIN, help="cheers needed to fill the tower")
    p.add_argument("--cooldown", type=float, default=COOLDOWN, help="seconds between cheers from one phone")
    p.add_argument("--fps", type=int, default=MAX_FPS)
    p.add_argument("--site", type=Path, default=SITE, help="race-site checkout to serve")
    p.add_argument("--no-restart-on-load", action="store_true",
                   help="don't replay the show when a phone loads the page (use this with a crowd)")
    args = p.parse_args()

    if not (args.site / "index.html").exists():
        p.error(f"no index.html in {args.site} - get it with: git checkout origin/main -- race-site")

    race = Race(args.taps)
    web = WebDisplay(args.instance, args.api) if args.instance else None
    display = FlashGuard(MultiDisplay(web))
    threading.Thread(target=render_loop, args=(race, Renderer(), display, args.fps), daemon=True).start()

    print(f"Server running on http://{local_ip()}:{args.port}   (QR code this)")
    print(f"Serving {args.site}/index.html")
    print(f"Rendering to {web.url}" if web else "No --instance: rendering nowhere")
    print(f"{args.taps} cheers to win, {args.cooldown}s per phone between cheers")
    print("Loading the page replays the show from the duck"
          if not args.no_restart_on_load else "Page loads don't interrupt the show")
    handler = make_handler(race, args.cooldown, args.site, not args.no_restart_on_load)
    ThreadingHTTPServer(("0.0.0.0", args.port), handler).serve_forever()


if __name__ == "__main__":
    main()
