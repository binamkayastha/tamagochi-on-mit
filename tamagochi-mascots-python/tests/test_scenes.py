"""python3 -m unittest discover tests

Mirrors race-worker/test/scenes.test.js on the `mascots` branch: the scenes are a port, so
the same invariants have to hold here.
"""

import unittest

from race import PHASES, Race, Renderer, TEAMS
from tamagotchi import scenes
from tower.display import COLS, ROWS


# The king is 9 rows tall and its escort walks under it, so they overlap; these are the king's
# own rows, and the band where only ducklings can be once it has left.
KING_ROWS = range(scenes.KING_TOP, scenes.DUCKLING_TOP - 1)
TRAIL_ROWS = range(scenes.DUCKLING_TOP - 1, scenes.DUCKLING_TOP + 5)   # a 5x5 duckling, bob included


def lit_columns(t, rows):
    frame = scenes.intro_frame(t)
    return {c for r in rows for c in range(COLS) if frame.px[r][c] != scenes.OFF}


def race_start_frame():
    """The climb's first frame: nobody has moved yet."""
    renderer = Renderer()
    renderer.phase = "race"
    state = Race(now=0.0).state(0.0)
    state["phase"], state["fills"] = "race", dict.fromkeys(TEAMS, 0.0)
    return renderer.render(state)


class SceneTest(unittest.TestCase):
    def test_every_scene_frame_is_17x9_rgb(self):
        for champion in [None, "mit", "harvard", "bu", "neu"]:
            for t in range(0, 13):
                for frame in (scenes.reign_frame(t, champion),
                              scenes.intro_frame(t, champion),
                              scenes.countdown_frame(t % 3)):
                    self.assertEqual(len(frame.px), ROWS)
                    for row in frame.px:
                        self.assertEqual(len(row), COLS)
                        for px in row:
                            self.assertEqual(len(px), 3)
                            self.assertTrue(all(isinstance(v, int) and 0 <= v <= 255 for v in px), px)

    def test_scene_handoffs_dont_jump(self):
        # intro end = countdown before its first digit fades in
        self.assertEqual(scenes.intro_frame(scenes.INTRO_SECONDS).px, scenes.countdown_frame(0).px)

    def test_the_race_takes_over_the_stage_the_countdown_leaves(self):
        """The race is this repo's own (lanes filling), not the `mascots` branch's climb, so
        its first frame isn't the countdown's last one - but it plays on the same stage."""
        last, first = scenes.countdown_frame(PHASES["countdown"]), race_start_frame()
        self.assertEqual(last.px[0], first.px[0])                        # the gold finish line
        self.assertEqual(last.px[scenes.RIVER_ROW], first.px[scenes.RIVER_ROW])   # the Charles
        for row in range(1, scenes.RIVER_ROW):                           # the gap between lanes
            self.assertEqual(first.px[row][4], scenes.OFF)

    def test_intro_beats_scale_with_the_configured_length(self):
        # 40% into a 10 s and a 20 s intro is the same beat; the river ripple runs in real
        # time on purpose, so the river row is left out.
        short = scenes.intro_frame(4, intro_seconds=10).px[:-1]
        long = scenes.intro_frame(8, intro_seconds=20).px[:-1]
        self.assertEqual(short, long)

    def test_every_challenger_is_introduced_in_lane_order(self):
        seen = []
        for tenths in range(0, int(10 * scenes.INTRO_SECONDS) + 1):
            school = scenes.introducing_at(tenths / 10)
            if school and (not seen or seen[-1] != school):
                seen.append(school)
        self.assertEqual(seen, list(scenes.SCHOOLS))
        self.assertIsNone(scenes.introducing_at(5))      # still the king's abdication
        self.assertIsNone(scenes.introducing_at(scenes.INTRO_SECONDS - 0.2))   # all on the bank
        # mid-introduction the mascot is shown big over a strip of its school colour
        mid = scenes.intro_frame(scenes.INTRO_BEATS["introductions"] / 1000 + 1.5)
        self.assertNotEqual(mid.px[scenes.PEDESTAL_ROW][4], scenes.OFF)
        self.assertGreater(sum(1 for r in range(5, 14) for px in mid.px[r] if px != scenes.OFF), 30)

    def test_the_king_waddles_off_the_side(self):
        self.assertLess(min(lit_columns(6.6, KING_ROWS)), min(lit_columns(8.0, KING_ROWS)))
        self.assertEqual(lit_columns(9.5, KING_ROWS), set())     # off the right edge

    def test_ducklings_follow_the_king_off_the_tower(self):
        self.assertEqual(lit_columns(9.5, KING_ROWS), set())     # the king has already gone,
        trailing = lit_columns(9.6, TRAIL_ROWS)                  # so this is its escort
        self.assertGreaterEqual(len(trailing), 4)                # a line of them, mid-crossing
        # and they clear the building before the first challenger is introduced
        self.assertEqual(lit_columns(scenes.INTRO_BEATS["introductions"] / 1000, TRAIL_ROWS), set())

    def test_only_the_duck_king_is_escorted(self):
        """A school mascot that won its way onto the throne abdicates alone."""
        late = 13.5   # by now a lone king has walked off; only an escort could still be there
        self.assertTrue(lit_columns(late, TRAIL_ROWS))                    # the Duck King's ducklings
        for champion in ("mit", "harvard", "bu", "neu"):
            frame = scenes.intro_frame(late, champion)
            lit = {c for r in TRAIL_ROWS for c in range(COLS) if frame.px[r][c] != scenes.OFF}
            self.assertEqual(lit, set(), f"{champion} should not have ducklings")

    def test_countdown_shows_3_2_1(self):
        def lit(frame):
            return sum(1 for r in range(4, 9) for px in frame.px[r][3:6] if px != scenes.OFF)

        self.assertGreater(lit(scenes.countdown_frame(0.5, countdown_seconds=3)), 0)
        self.assertEqual(lit(scenes.countdown_frame(0.5, countdown_seconds=6)), 0)  # "6" isn't drawn
        self.assertGreater(lit(scenes.countdown_frame(3.5, countdown_seconds=6)), 0)

    def test_the_king_is_the_last_winner(self):
        self.assertEqual(scenes.king_mascot(None).id, "duckling")     # nobody has won yet
        self.assertEqual(scenes.king_mascot("harvard").id, "john-harvard")


if __name__ == "__main__":
    unittest.main()
