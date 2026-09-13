"""Mascots the pet can wear. Each one is a single 9 x 9 drawing; every pose is derived from it.

Sprite chars: palette keys, plus
    E  eye          (closes to `lid` on blink / sleep)
    M  mouth / beak (shows `closed` normally, red when eating or sad)
    .  window off
The baby stage is just the top `head_rows` of the drawing - a big-headed little version.
"""

from dataclasses import dataclass, field

from tower.display import WHITE

COMMON = {
    "R": (255, 30, 30),    # open mouth
    "D": (70, 35, 10),     # closed eye line
    "Q": (80, 160, 255),   # tear
    "T": (190, 190, 180),  # teeth / tusks
    "N": (255, 80, 120),   # nose
    "Y": (255, 190, 0),    # beak / feet
}


@dataclass
class Mascot:
    id: str
    name: str
    tag: str                 # short word that scrolls across the tower
    school: str
    sprite: list
    palette: dict
    eye: tuple = WHITE
    lid: str = "B"           # palette key the eye closes to
    closed: str = "L"        # palette key for a closed mouth
    head_rows: int = 6
    mini: list = None        # 2 x 3 version that fits one race lane (tamagotchi/scenes.py)
    _cache: dict = field(default_factory=dict, repr=False)

    def colors(self):
        return {**COMMON, **self.palette, "E": self.eye, "M": self.palette[self.closed]}

    def poses(self, stage="adult"):
        """{pose: sprite rows} for idle / blink / eat / sleep / sad."""
        if stage not in self._cache:
            base = self.sprite if stage == "adult" else self.sprite[: self.head_rows]
            swap = lambda rows, a, b: [r.replace(a, b) for r in rows]
            sad = swap(base, "M", "R")
            eye_row = next(i for i, r in enumerate(sad) if "E" in r)
            if eye_row + 1 < len(sad):  # a tear under the left eye
                col = sad[eye_row].index("E")
                row = sad[eye_row + 1]
                sad[eye_row + 1] = row[:col] + "Q" + row[col + 1:]
            self._cache[stage] = {
                "idle": base,
                "blink": swap(base, "E", self.lid),
                "eat": swap(base, "M", "R"),
                "sleep": swap(swap(base, "E", "D"), "M", self.closed),
                "sad": sad,
            }
        return self._cache[stage]


MASCOTS = {
    m.id: m
    for m in [
        Mascot(
            "beaver", "Tim the Beaver", "MIT", "mit",
            [
                ".B.....B.",
                ".BBBBBBB.",
                "BBEBBBEBB",
                "BBBLNLBBB",
                ".BBTMTBB.",
                "..BBBBB..",
                ".BLLLLLB.",
                ".BLLLLLBK",
                ".BB...BBK",
            ],
            {"B": (185, 105, 35), "L": (235, 170, 100), "K": (110, 55, 15)},
            mini=["BB", "EE", "LL"],
        ),
        Mascot(
            "husky", "Paws the Husky", "NEU", "neu",
            [
                "B.......B",
                "BB.....BB",
                "BBBBBBBBB",
                "BLELLLELB",
                "BLLLNLLLB",
                ".LLLMLLL.",
                "..BLLLB..",
                ".BBLLLBB.",
                ".BB...BB.",
            ],
            {"B": (120, 130, 150), "L": (185, 190, 200)},
            eye=(90, 190, 255), lid="L", head_rows=6, mini=["BB", "EE", "LL"],
        ),
        Mascot(
            "terrier", "Rhett the Terrier", "BU", "bu",
            [
                "BB.....BB",
                "BBB...BBB",
                "BBBBLBBBB",
                "BEBBLBBEB",
                "BBLLNLLBB",
                ".BLLMLLB.",
                "..KKKKK..",
                ".BBLLLBB.",
                ".BB...BB.",
            ],
            {"B": (80, 95, 200), "L": (190, 190, 190), "K": (204, 0, 0)},
            head_rows=6, mini=["BB", "LL", "KK"],
        ),
        Mascot(
            "elephant", "Jumbo the Elephant", "TUFTS", "tufts",
            [
                "..BBBBB..",
                "BBBBBBBBB",
                "BBEBBBEBB",
                "BBBBBBBBB",
                "BB.TBT.BB",
                ".B..B..B.",
                "...MB....",
                ".KKKKKKK.",
                ".BB...BB.",
            ],
            {"B": (130, 140, 175), "L": (130, 140, 175), "K": (62, 142, 222)},
            head_rows=7,
        ),
        Mascot(
            "eagle", "Baldwin the Eagle", "BC", "bc",
            [
                "...LLL...",
                "..LLLLL..",
                ".LELLLEL.",
                "..LYYYL..",
                ".BBBMBBB.",
                "BBBBBBBBB",
                "BB.BBB.BB",
                "..BBBBB..",
                "..Y...Y..",
            ],
            {"B": (170, 95, 25), "L": (200, 200, 190), "Y": (255, 190, 0)},
            eye=(255, 200, 0), lid="L", closed="Y", head_rows=5,
        ),
        Mascot(
            "john-harvard", "John Harvard", "HARVARD", "harvard",
            [
                "..HHHHH..",
                "..HHYHH..",
                "HHHHHHHHH",
                ".GLLLLLG.",
                ".GELLLEG.",
                ".GLLMLLG.",
                "..CCCCC..",
                ".KKKKKKK.",
                ".KK...KK.",
            ],
            {"H": (90, 90, 140), "G": (150, 150, 165), "L": (230, 170, 130),
             "C": (200, 200, 190), "K": (190, 30, 55)},
            eye=(80, 40, 20), lid="L", closed="L", mini=["HH", "LL", "KK"],
        ),
        Mascot(
            "duckling", "Make Way Duckling", "BOSTON", "other",
            [
                "...BBB...",
                "..BBBBB..",
                "..BEBBYY.",
                "..BBBBM..",
                "...BBB...",
                ".BBBBBBB.",
                "BBBBBBBB.",
                ".BBBBBB..",
                "..Y..Y...",
            ],
            {"B": (200, 160, 10), "Y": (255, 90, 0)},
            eye=(40, 30, 0), closed="Y", head_rows=5, mini=["BB", "BY", "BB"],
        ),
    ]
}

BY_SCHOOL = {m.school: m for m in MASCOTS.values()}
DEFAULT = MASCOTS["beaver"]


def for_school(school_id):
    return BY_SCHOOL.get(school_id, DEFAULT)
