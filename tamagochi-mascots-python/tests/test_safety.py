"""python3 -m unittest discover tests"""

import unittest

from tower.display import Frame
from tower.safety import MAX_FLASHES_PER_SECOND, FlashGuard, worst_flash_rate


def strobe(hz, seconds=2, fps=30):
    """Whole facade toggling black/white `hz` times a second."""
    for i in range(seconds * fps):
        yield Frame((255, 255, 255) if int(i * 2 * hz / fps) % 2 else (0, 0, 0))


class FlashAnalyzerTest(unittest.TestCase):
    def test_detects_a_raw_strobe(self):
        rate, _ = worst_flash_rate(strobe(10))
        self.assertGreater(rate, MAX_FLASHES_PER_SECOND)

    def test_guard_tames_a_strobe(self):
        guard = FlashGuard()
        rate, where = worst_flash_rate(guard.filter(f) for f in strobe(10))
        self.assertLessEqual(rate, MAX_FLASHES_PER_SECOND, where)


class ShippedAnimationsTest(unittest.TestCase):
    def test_mascot_lineup(self):
        from mascot_show import lineup_frames
        from tamagotchi import mascots
        rate, where = worst_flash_rate(lineup_frames(mascots.MASCOTS.values()))
        self.assertLessEqual(rate, MAX_FLASHES_PER_SECOND, where)

    def test_tamagotchi_story(self):
        from demo_reel import frames
        rate, where = worst_flash_rate(frames())
        self.assertLessEqual(rate, MAX_FLASHES_PER_SECOND, where)

    def test_mascot_race(self):
        from race import scripted_frames
        rate, where = worst_flash_rate(scripted_frames())
        self.assertLessEqual(rate, MAX_FLASHES_PER_SECOND, where)


if __name__ == "__main__":
    unittest.main()
