"""python3 -m unittest discover tests

Mirrors race-worker/test/scenes.test.js on the `mascots` branch: the scenes are a port, so
the same invariants have to hold here.
"""

import unittest

from race import PHASES, Race, Renderer, TEAMS
from tamagotchi import scenes
from tower.display import COLS, ROWS


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
        for tenths in range(0, 10 * scenes.INTRO_SECONDS + 1):
            school = scenes.introducing_at(tenths / 10)
            if school and (not seen or seen[-1] != school):
                seen.append(school)
        self.assertEqual(seen, list(scenes.SCHOOLS))
        self.assertIsNone(scenes.introducing_at(5))      # still the king's abdication
        self.assertIsNone(scenes.introducing_at(21.8))   # everyone is on the riverbank already
        # mid-introduction the mascot is shown big over a strip of its school colour
        mid = scenes.intro_frame(9.5 + 1.5)
        self.assertNotEqual(mid.px[scenes.PEDESTAL_ROW][4], scenes.OFF)
        self.assertGreater(sum(1 for r in range(5, 14) for px in mid.px[r] if px != scenes.OFF), 30)

    def test_the_king_waddles_off_the_side(self):
        columns = lambda t: {c for r in range(5, 14) for c in range(COLS)
                             if scenes.intro_frame(t).px[r][c] != scenes.OFF}
        self.assertEqual(min(columns(6.4)), 0)           # still where it bowed
        self.assertLess(min(columns(7.5)), min(columns(8.5)))   # stepping right, a window at a time
        self.assertEqual(columns(9.0), {8})              # last window before the edge
        self.assertEqual(columns(9.3), set())            # gone, before the first introduction

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
