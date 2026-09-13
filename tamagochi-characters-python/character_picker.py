"""Tkinter picker: click a character, see it locally and on the Green Building sim.

The real display/simulator is a fixed 9x17 grid, so smaller pets (5x5, 4x4) are
centered inside that canvas rather than changing the display's resolution.
"""
import sys
import tkinter as tk
from tkinter import ttk

from gbsim import Color, WebDisplay

INSTANCE = sys.argv[1] if len(sys.argv) > 1 else "cobalt-mole"
CANVAS_W, CANVAS_H = 9, 17
OFF = "#212a40"
EYE = "#14121a"

# -- brightness: the real panels blow out on near-white and pure yellow, so those
# two hue families get scaled down; every other color is left alone. -------------


def _hex_to_rgb(hexcolor):
    hexcolor = hexcolor.lstrip("#")
    return tuple(int(hexcolor[i:i + 2], 16) for i in (0, 2, 4))


def _rgb_to_hex(rgb):
    return "#%02x%02x%02x" % rgb


def dim_bright(hexcolor, factor=0.7):
    r, g, b = _hex_to_rgb(hexcolor)
    mx, mn = max(r, g, b), min(r, g, b)
    whitish = mx > 230 and (mx - mn) < 70
    yellowish = r > 200 and g > 170 and b < 140 and (r - g) < 50
    if whitish or yellowish:
        r, g, b = int(r * factor), int(g * factor), int(b * factor)
    return _rgb_to_hex((r, g, b))


def center(rows, width, height, canvas_w=CANVAS_W, canvas_h=CANVAS_H):
    """Pad a small rows/width/height sprite to the full canvas size, centered."""
    top, left = (canvas_h - height) // 2, (canvas_w - width) // 2
    canvas = [["." for _ in range(canvas_w)] for _ in range(canvas_h)]
    for r, row in enumerate(rows):
        for c, ch in enumerate(row):
            canvas[top + r][left + c] = ch
    return ["".join(row) for row in canvas]


# -- 9x17 characters ---------------------------------------------------------

CHARACTERS_17 = {
    "Blob": (
        [
            "....X....", "...XXX...", "..XXXXX..", ".XXXXXXX.", ".XXXXXXX.",
            ".XKXXXKX.", ".XXXXXXX.", ".XXXXXXX.", "XXXXXXXXX", "XXXXXXXXX",
            "XXXXXXXXX", "XXXXXXXXX", "XXXXXXXXX", "XXXXXXXXX", "XXXXXXXXX",
            "XXXXXXXXX", "XXXXXXXXX",
        ],
        {"X": "#7be0ad", "K": EYE},
    ),
    "Bunny": (
        [
            ".X.....X.", ".X.....X.", ".X.....X.", ".X.....X.", ".XX...XX.",
            "..XXXXX..", ".XXXXXXX.", ".XKXXXKX.", ".XXXXXXX.", "..XXXXX..",
            ".XXXXXXX.", "XXXXXXXXX", "XXXXXXXXX", "XXXXXXXXX", "XXXXXXXXX",
            "..X...X..", "..X...X..",
        ],
        {"X": "#ffb6c8", "K": EYE},
    ),
    "Cat": (
        [
            "..X...X..", ".XX..XX..", ".XXX.XXX.", ".XXXXXXX.", ".XKXXXKX.",
            ".XXXNXXX.", ".XXWWWXX.", ".XXXXXXX.", "..XXXXX..", ".XXXXXXX.",
            "XXXXXXXXX", "XXWWWWWXX", "XXWWWWWXX", "XXXXXXXXX", "SXXXXXXX.",
            "S.X...X..", "..X...X..",
        ],
        {"X": "#ffb454", "S": "#b5762a", "K": EYE, "N": "#ff8fae", "W": "#fff2df"},
    ),
    "Dog": (
        [
            ".........", "XX.....XX", "XX.....XX", ".XXXXXXX.", ".XXXXXXX.",
            ".XKXXXKX.", ".XXXXXXX.", ".XXXXXXX.", "..XXXXX..", ".XXXXXXX.",
            "XXXXXXXXX", "XXXXXXXXX", "XXXXXXXXX", "XXXXXXXXX", "XXXXXXXXX",
            "..X...X..", "..X...X..",
        ],
        {"X": "#e3a857", "K": EYE},
    ),
    "Frog": (
        [
            "X.......X", "XX.....XX", ".XXXXXXX.", ".XKXXXKX.", ".XXXXXXX.",
            ".XXXXXXX.", "XXXXXXXXX", "XXXXXXXXX", "XXXXXXXXX", "XXXXXXXXX",
            "XXXXXXXXX", "XXXXXXXXX", "XXXXXXXXX", "XXXXXXXXX", "XXXXXXXXX",
            "X.X...X.X", "X.......X",
        ],
        {"X": "#8fd14f", "K": EYE},
    ),
    "Chick": (
        [
            ".........", "...XXX...", "..XXXXX..", ".XXXXXXX.", ".XKXXXKX.",
            ".XXOOOXX.", ".XXXXXXX.", "XXXXXXXXX", "XXXXXXXXX", "XXXXXXXXX",
            ".XXXXXXX.", ".XXXXXXX.", ".XXXXXXX.", "..XXXXX..", "...XXX...",
            "...O.O...", "..OO.OO..",
        ],
        {"X": "#ffe066", "K": EYE, "O": "#ff8a4c"},
    ),
    "Penguin": (
        [
            "...XXX...", "..XXXXX..", ".XXXXXXX.", ".XKXXXKX.", "..XXBXX..",
            ".XXXXXXX.", "XXXXXXXXX", "XXXWWWXXX", "XXWWWWWXX", "XXWWWWWXX",
            "XXWWWWWXX", "XXXXXXXXX", "XXXXXXXXX", "XXXXXXXXX", "XXXXXXXXX",
            "..B...B..", ".BB...BB.",
        ],
        {"X": "#6fb8e0", "K": EYE, "B": "#ff9a3c", "W": "#eaf6ff"},
    ),
    "Ghost": (
        [
            "...XXX...", "..XXXXX..", ".XXXXXXX.", ".XXXXXXX.", ".XKXXXKX.",
            ".XXXXXXX.", ".XBXXXBX.", ".XXXXXXX.", "XXXXXXXXX", "XXXXXXXXX",
            "XXXXXXXXX", "XXXXXXXXX", "XXXXXXXXX", "XXXXXXXXX", "XXXXXXXXX",
            "X.X.X.X.X", ".........",
        ],
        {"X": "#b9a6ff", "K": EYE, "B": "#ff9ecb"},
    ),
    "Star": (
        [
            "....X....", "....X....", "....X....", "..X.X.X..", "...XXX...",
            "..XXXXX..", "XXXXXXXXX", "..XXXXX..", "...XXX...", "..X.X.X..",
            "....X....", "....X....", "....X....", ".........", ".........",
            ".........", ".........",
        ],
        {"X": "#ffd23f"},
    ),
    "Alien": (
        [
            "X.......X", "X.......X", ".X.....X.", "..XXXXX..", ".XXXXXXX.",
            ".XXXXXXX.", "XKXXXXXKX", "XKXXXXXKX", ".XXXXXXX.", "..XXXXX..",
            "..XXXXX..", "..XXXXX..", "..X...X..", "..X...X..", "..X...X..",
            "..X...X..", ".........",
        ],
        {"X": "#a6ff6f", "K": EYE},
    ),
    "Robot": (
        [
            "....X....", "....X....", ".XXXXXXX.", ".XXXXXXX.", ".XKXXXKX.",
            ".XXXXXXX.", ".XXXXXXX.", "..XXXXX..", ".XXXXXXX.", "XXXXXXXXX",
            "XXXXXXXXX", "XXXXXXXXX", "XXXXXXXXX", "XXXXXXXXX", "XXXXXXXXX",
            "..X...X..", "..X...X..",
        ],
        {"X": "#9fb8d9", "K": EYE},
    ),
    "Bear": (
        [
            ".........", ".XX...XX.", ".XEX.XEX.", ".XXXXXXX.", ".XKXXXKX.",
            ".XXXXXXX.", ".XXWWWXX.", ".XXXXXXX.", "..XXXXX..", ".XXXXXXX.",
            "XXXXXXXXX", "XXWWWWWXX", "XXWWWWWXX", "XXXXXXXXX", ".XXXXXXX.",
            "..X...X..", "..X...X..",
        ],
        {"X": "#ff7a45", "E": "#ffcf9e", "K": EYE, "W": "#ffe3c2"},
    ),
}

# -- 5x5 minis, centered onto the 9x17 canvas at load time -------------------

_MINI_5 = {
    "Blob": (["·XXX·", "XXXXX", "XKXKX", "XXXXX", "XXXXX"], {"X": "#7be0ad", "K": EYE}),
    "Bunny": (["X···X", "X···X", "·XXX·", "XKXKX", "·XXX·"], {"X": "#ffb6c8", "K": EYE}),
    "Cat": (["X···X", "·XXX·", "XKXKX", "·XXX·", "·X·X·"], {"X": "#ffb454", "K": EYE}),
    "Dog": (["·····", "XXXXX", "XKXKX", "XXXXX", "·X·X·"], {"X": "#e3a857", "K": EYE}),
    "Chick": (["··X··", "·XXX·", "XKXKX", "·XOX·", "·X·X·"], {"X": "#ffe066", "K": EYE, "O": "#ff8a4c"}),
    "Ghost": (["·XXX·", "XXXXX", "XKXKX", "XXXXX", "X·X·X"], {"X": "#b9a6ff", "K": EYE}),
}
CHARACTERS_5 = {
    name: (center([row.replace("·", ".") for row in rows], 5, 5), palette)
    for name, (rows, palette) in _MINI_5.items()
}

# -- 4x4 minis -----------------------------------------------------------------

_MINI_4 = {
    "Blob": (["·XX·", "XKKX", "XXXX", "XXXX"], {"X": "#7be0ad", "K": EYE}),
    "Bunny": (["X··X", "XKKX", "XXXX", "XXXX"], {"X": "#ffb6c8", "K": EYE}),
    "Cat": (["X··X", "XKKX", "XXXX", "X··X"], {"X": "#ffb454", "K": EYE}),
    "Dog": (["XXXX", "XKKX", "XXXX", "XXXX"], {"X": "#e3a857", "K": EYE}),
    "Chick": (["·XX·", "XKKX", "XOOX", "XXXX"], {"X": "#ffe066", "K": EYE, "O": "#ff8a4c"}),
    "Ghost": (["·XX·", "XKKX", "XXXX", "X·X·"], {"X": "#b9a6ff", "K": EYE}),
}
CHARACTERS_4 = {
    name: (center([row.replace("·", ".") for row in rows], 4, 4), palette)
    for name, (rows, palette) in _MINI_4.items()
}

SIZES = {
    "9 x 17": CHARACTERS_17,
    "5 x 5": CHARACTERS_5,
    "4 x 4": CHARACTERS_4,
}


class App:
    CELL = 14

    def __init__(self):
        self.root = tk.Tk()
        self.root.title(f"Facade Pets — streaming to {INSTANCE}")
        self.root.configure(bg="#0a0d16")

        style = ttk.Style(self.root)
        style.theme_use("clam")  # native Aqua theme ignores custom button colors
        style.configure(
            "Pet.TButton", background="#161c2b", foreground="#eef1f6",
            borderwidth=0, focusthickness=0, padding=(10, 6),
        )
        style.map(
            "Pet.TButton",
            background=[("active", "#c9a668"), ("pressed", "#c9a668")],
            foreground=[("active", "#0a0d16"), ("pressed", "#0a0d16")],
        )
        style.configure(
            "Size.TRadiobutton", background="#0a0d16", foreground="#eef1f6",
            padding=(6, 4),
        )
        style.map("Size.TRadiobutton", foreground=[("selected", "#c9a668")])
        style.configure("Facade.TFrame", background="#0a0d16")

        self.display = WebDisplay(INSTANCE)
        self.size = tk.StringVar(value="9 x 17")

        canvas_frame = ttk.Frame(self.root, style="Facade.TFrame")
        canvas_frame.grid(row=0, column=0, padx=16, pady=16, sticky="n")
        self.canvas = tk.Canvas(
            canvas_frame, width=CANVAS_W * self.CELL, height=CANVAS_H * self.CELL,
            bg=OFF, highlightthickness=1, highlightbackground="#c9a668",
        )
        self.canvas.pack()

        right = ttk.Frame(self.root, style="Facade.TFrame")
        right.grid(row=0, column=1, padx=16, pady=16, sticky="n")

        size_frame = ttk.Frame(right, style="Facade.TFrame")
        size_frame.pack(anchor="w", pady=(0, 10))
        for label in SIZES:
            ttk.Radiobutton(
                size_frame, text=label, value=label, variable=self.size,
                style="Size.TRadiobutton", command=self.on_size_change,
            ).pack(side="left")

        self.btn_frame = ttk.Frame(right, style="Facade.TFrame")
        self.btn_frame.pack(anchor="w")

        self.status = tk.Label(
            self.root, text=f"Pick a character — view live at https://sundai.willsarg.com/{INSTANCE}",
            bg="#0a0d16", fg="#8a93ab", anchor="w",
        )
        self.status.grid(row=1, column=0, columnspan=2, sticky="w", padx=16, pady=(0, 12))

        self.current_name = None
        self.build_buttons()
        self.show(next(iter(SIZES[self.size.get()])))
        self.root.mainloop()

    def build_buttons(self):
        for child in self.btn_frame.winfo_children():
            child.destroy()
        names = list(SIZES[self.size.get()])
        cols = 3
        for i, name in enumerate(names):
            b = ttk.Button(
                self.btn_frame, text=name, width=10, style="Pet.TButton",
                command=lambda n=name: self.show(n),
            )
            b.grid(row=i // cols, column=i % cols, padx=4, pady=4)

    def on_size_change(self):
        self.build_buttons()
        names = list(SIZES[self.size.get()])
        self.show(names[0] if self.current_name not in names else self.current_name)

    def show(self, name):
        self.current_name = name
        rows, palette = SIZES[self.size.get()][name]
        frame = self.display.makeframe()
        self.canvas.delete("all")
        for r, row in enumerate(rows):
            for c, code in enumerate(row):
                raw_hex = palette.get(code)
                if code != "." and raw_hex:
                    fill = dim_bright(raw_hex)
                    rr, gg, bb = _hex_to_rgb(fill)
                    frame[r][c] = Color(rr, gg, bb)
                else:
                    fill = OFF
                x0, y0 = c * self.CELL, r * self.CELL
                self.canvas.create_rectangle(
                    x0, y0, x0 + self.CELL, y0 + self.CELL, fill=fill, outline="#0a0d16",
                )

        self.display.send(frame)
        self.status.config(
            text=f"Showing {name} ({self.size.get()}) — https://sundai.willsarg.com/{INSTANCE}"
        )


if __name__ == "__main__":
    App()
