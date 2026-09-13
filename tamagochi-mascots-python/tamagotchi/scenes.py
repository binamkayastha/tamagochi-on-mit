"""The story around the race, ported from `race-worker/src/scenes.js` on the `mascots` branch.

    reign      the King of the Charles (the Duck King until someone wins) idles, crowned
    intro      the king bows, its crown lifts off and melts into the finish line, the king
               waddles off the side of the tower, then each challenger is introduced in turn:
               it rises big over a strip of its school colour, cheers, blinks, and takes its lane
    countdown  3, 2, 1 in soft digits while the challengers wait

Beat boundaries, colours and geometry are kept identical to the JS so the building tells the
same story whichever backend is driving it. The last frame of each scene is the first frame
of the next, so hand-offs don't jump.
"""

import math

from tamagotchi.mascots import MASCOTS, for_school
from tower.display import COLS, ROWS, Frame, mix

SCHOOLS = ("mit", "harvard", "bu", "neu")
LANE_COLS = (0, 2, 5, 7)     # left column of each school's lane, in SCHOOLS order
MASCOT_HEIGHT = 3
RIVER_ROW = ROWS - 1
START_TOP = RIVER_ROW - MASCOT_HEIGHT   # challengers stand on rows 13-15, feet on the bank

OFF = (12, 16, 26)           # faint building-blue, never true black, so the grid reads as "on"
RIVER = (0, 35, 80)
RIPPLE = (30, 80, 140)
BANNER = (150, 110, 20)      # the finish line the crown melted into
GOLD = (210, 160, 20)
DIGIT_COLOR = (150, 150, 150)
DIGIT_TOP = 4

KING_TOP = 5                 # 9x9 king on rows 5-13, crown on rows 3-4
CROWN_REST_TOP = KING_TOP - 2
CROWN = (["Y.Y.Y", "YYRYY"], {"Y": GOLD, "R": (200, 20, 40)})
PEDESTAL_ROW = KING_TOP + 9  # just under a centred 9x9 mascot

INTRO_SECONDS = 22
COUNTDOWN_SECONDS = 3

# The lane colours, kept here so race.py and the introductions' pedestals agree. These are the
# tower's own, not the site's CSS: school crimsons are too close to tell apart at 400 m.
SCHOOL_COLORS = {
    "mit": (220, 140, 50),
    "harvard": (138, 43, 226),
    "bu": (220, 30, 30),
    "neu": (90, 190, 255),
}

# Beat boundaries in ms for a 22 s intro; they stretch or shrink with the configured length.
INTRO_BEATS = {
    "hold_end": 1500,        #     0-1.5   the king, crowned, stands still
    "bow_end": 2500,         #   1.5-2.5   bows: closes its eyes and dips one floor
    "rise_end": 4500,        #   2.5-4.5   the crown lifts off, floor by floor, to the top
    "shine_end": 5500,       #   4.5-5.5   the crown waits at the top
    "melt_end": 6500,        #   5.5-6.5   the crown spreads into the gold finish line
    "waddle_end": 9500,      #   6.5-9.5   the king waddles off the side, a window at a time
    "introductions": 9500,   #  9.5-21.5   each challenger in turn, INTRODUCTION ms each
    "end": 22000,
}
INTRODUCTION = {
    "length": 3000,
    "rise_end": 900,         # rises from the river to the middle of the tower
    "cheer_start": 1100,     # mouth open
    "cheer_end": 1600,
    "blink_start": 1900,
    "blink_end": 2050,
    "hold_end": 2200,        # then sinks back down while its mini climbs onto the riverbank
    "sink_end": 2500,
    "mini_start": 2000,
}

# 3 x 5 digits for the countdown, the same glyphs as tower/font.py.
DIGITS = {
    1: [".#.", "##.", ".#.", ".#.", "###"],
    2: ["###", "..#", "###", "#..", "###"],
    3: ["###", "..#", "###", "..#", "###"],
}


def ease(x):
    return 0.5 - 0.5 * math.cos(math.pi * max(0.0, min(1.0, x)))


def between(t, start, end):
    return max(0.0, min(1.0, (t - start) / (end - start)))


def blit(frame, sprite, top, left, colors, alpha=1.0):
    """Draw `sprite` with its top-left at (top, left); off-grid pixels are clipped."""
    for r, line in enumerate(sprite):
        for c, ch in enumerate(line):
            color = colors.get(ch)
            row, col = int(top) + r, int(left) + c
            if color is None or not (0 <= row < ROWS and 0 <= col < COLS):
                continue
            frame.px[row][col] = color if alpha >= 1 else mix(frame.px[row][col], color, alpha)


def king_mascot(champion=None):
    """Whoever wears the crown: last race's winner, or the Duck King if nobody has won yet."""
    return for_school(champion) if champion else MASCOTS["duckling"]


def _river(frame, ms, ripple=True):
    frame.fill_row(RIVER_ROW, RIVER)
    if ripple:
        frame.set(RIVER_ROW, int(ms / 700) % COLS, RIPPLE)


def _crown(frame, top, alpha=1.0):
    blit(frame, CROWN[0], top, (COLS - 5) // 2, CROWN[1], alpha)


def _challenger(frame, i, rise=1.0):
    """One challenger's mini on the riverbank; `rise` 0..1 (0 = still under the water)."""
    k = ease(rise)
    if k <= 0:
        return
    mascot = for_school(SCHOOLS[i])
    top = round(RIVER_ROW + 1 - k * (RIVER_ROW + 1 - START_TOP))
    blit(frame, mascot.mini, top, LANE_COLS[i], mascot.colors())


def _beats(intro_seconds):
    """Intro beat times in ms, scaled to the configured intro length."""
    k = intro_seconds * 1000 / INTRO_BEATS["end"]
    beats = {name: ms * k for name, ms in INTRO_BEATS.items()}
    beats["intro"] = {name: ms * k for name, ms in INTRODUCTION.items()}
    return beats


def introducing_at(t, intro_seconds=INTRO_SECONDS):
    """Which school is being introduced `t` seconds in (None outside the introductions)."""
    b = _beats(intro_seconds)
    i = math.floor((t * 1000 - b["introductions"]) / b["intro"]["length"])
    return SCHOOLS[i] if 0 <= i < len(SCHOOLS) else None


def reign_frame(t, champion=None):
    ms = t * 1000
    frame = Frame(OFF)
    king = king_mascot(champion)
    bob = 0 if ms % 2000 < 1000 else 1               # slow breathing
    pose = "blink" if ms % 4000 > 3850 else "idle"
    blit(frame, king.poses()[pose], KING_TOP - bob, 0, king.colors())
    _crown(frame, CROWN_REST_TOP - bob)
    _river(frame, ms)
    return frame


def _abdication(frame, ms, b, king):
    """The king bows, gives up the crown (it becomes the finish line) and waddles off."""
    if ms < b["waddle_end"]:
        bow = round(ease(between(ms, b["hold_end"], b["bow_end"])))
        # Whole-window steps at a steady pace; faster steps or hops read as flicker at this scale.
        left = math.floor(between(ms, b["melt_end"], b["waddle_end"]) * (COLS + 1)) if ms >= b["melt_end"] else 0
        pose = "idle" if ms < b["hold_end"] or ms >= b["melt_end"] else "sleep"   # eyes shut while bowing
        blit(frame, king.poses()[pose], KING_TOP + (0 if ms >= b["melt_end"] else bow), left, king.colors())

    # the crown: lifts off to rows 0-1, waits, then spreads along row 0 into the finish line
    crown_top = round(CROWN_REST_TOP * (1 - ease(between(ms, b["bow_end"], b["rise_end"]))))
    melt = ease(between(ms, b["shine_end"], b["melt_end"]))
    if melt < 1:
        _crown(frame, crown_top, 1 - melt)
    if melt > 0:
        reach = 2 + 2.5 * melt                        # from the crown's width to the whole row
        for col in range(COLS):
            if abs(col - (COLS - 1) / 2) <= reach:
                frame.set(0, col, mix(GOLD, BANNER, melt))


def _introductions(frame, ms, b):
    """Each challenger rises big over its school colour, cheers, blinks, then takes its lane."""
    intro = b["intro"]
    for i, school in enumerate(SCHOOLS):
        local = ms - b["introductions"] - i * intro["length"]
        if local < 0 or local >= intro["length"]:      # not yet, or already on the riverbank
            continue
        mascot = for_school(school)
        up = ease(between(local, 0, intro["rise_end"]))
        down = ease(between(local, intro["hold_end"], intro["sink_end"]))
        top = round(RIVER_ROW + 1 - up * (RIVER_ROW + 1 - KING_TOP) + down * (RIVER_ROW + 1 - KING_TOP))
        frame.fill_row(PEDESTAL_ROW, mix(OFF, SCHOOL_COLORS[school], 0.45 * up * (1 - down)))

        if intro["cheer_start"] <= local < intro["cheer_end"]:
            pose = "eat"                               # mouth open, cheering
        elif intro["blink_start"] <= local < intro["blink_end"]:
            pose = "blink"
        else:
            pose = "idle"
        if top <= RIVER_ROW:
            blit(frame, mascot.poses()[pose], top, 0, mascot.colors())
        _challenger(frame, i, between(local, intro["mini_start"], intro["length"]))


def intro_frame(t, champion=None, intro_seconds=INTRO_SECONDS):
    ms = t * 1000
    b = _beats(intro_seconds)
    frame = Frame(OFF)
    _abdication(frame, ms, b, king_mascot(champion))
    _introductions(frame, ms, b)
    _river(frame, ms, ripple=ms < b["introductions"])
    for i in range(len(SCHOOLS)):                      # minis already on the bank stay in front
        if ms - b["introductions"] - i * b["intro"]["length"] >= b["intro"]["length"]:
            _challenger(frame, i)
    return frame


def countdown_frame(t, countdown_seconds=COUNTDOWN_SECONDS):
    ms = t * 1000
    frame = Frame(OFF)
    frame.fill_row(0, BANNER)
    _river(frame, ms, ripple=False)
    for i in range(len(SCHOOLS)):
        _challenger(frame, i)

    remaining = countdown_seconds * 1000 - ms
    digit = math.ceil(remaining / 1000)
    if digit in DIGITS:
        u = 1000 - (remaining - (digit - 1) * 1000)   # 0..1000 within this digit's second
        alpha = max(0.0, min(1.0, u / 250, (1000 - u) / 250))
        blit(frame, DIGITS[digit], DIGIT_TOP, (COLS - 3) // 2, {"#": DIGIT_COLOR}, alpha)
    return frame
