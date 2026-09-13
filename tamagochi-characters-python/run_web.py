"""Run tetris.py with output going to the Green Building sim instead of the local pygame window."""
import sys

import pygame

from gbsim import WebDisplay
from tetris import Tetris

INSTANCE = sys.argv[1] if len(sys.argv) > 1 else "cobalt-mole"

if __name__ == "__main__":
    # tetris.py assumes its Display already brought up pygame's video system (DummyDisplay
    # does this itself); WebDisplay doesn't touch pygame, so bring up a small input-capture
    # window here. This window has keyboard focus and drives the game; visuals go to the sim.
    pygame.init()
    pygame.display.set_mode((300, 100))
    pygame.display.set_caption(f"Tetris controls (streaming to {INSTANCE})")

    display = WebDisplay(INSTANCE)
    tetris = Tetris(display=display)
    print(f"Streaming to https://sundai.willsarg.com/{INSTANCE}")
    tetris.play()
