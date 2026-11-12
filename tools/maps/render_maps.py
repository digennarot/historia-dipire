"""Genera le tre mappe di Di Pire (img/maps/*.webp) e i muri delle scene.

Uso:  python tools/maps/render_maps.py            # mappe + muri nelle scene
      python tools/maps/render_maps.py --no-walls # solo immagini

La geometria segue le luci, le note e i token già presenti nelle scene: chi sposta un
edificio qui deve spostare anche le luci in src/adventure/scenes.
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *  # noqa: E402,F403

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "img" / "maps"
SCENES = ROOT / "src" / "adventure" / "scenes"


# ---------------------------------------------------------------- edifici

def roof(base, x0, y0, x1, y1, ridge="h", texname="roof_slates_02", moss_seed=0, tint=(0.82, 0.82, 0.84), px=520):
    """Tetto a due falde: falde con texture orientata, colmo, gronda scura, muschio."""
    rot = 0 if ridge == "h" else 1
    t = grade(tex(texname, px, rot), mul=tint, sat=0.8)
    m, d = new_mask()
    d.rectangle([x0, y0, x1, y1], fill=255)
    full = to_arr(m, 0.6)
    base = shadow(base, full, 16, 20, 10, 0.55)
    base = comp(base, t, full)
    # falda in ombra (sud o est)
    m2, d2 = new_mask()
    if ridge == "h":
        ym = (y0 + y1) / 2
        d2.rectangle([x0, ym, x1, y1], fill=255)
    else:
        xm = (x0 + x1) / 2
        d2.rectangle([xm, y0, x1, y1], fill=255)
    base = darken(base, to_arr(m2, 0.6), 0.32)
    # muschio
    n = fbm(1000 + moss_seed, scales=(140, 50, 18), weights=(0.55, 0.3, 0.15))
    moss = np.clip((n - 0.58) * 5, 0, 1) * full
    base = comp(base, grade(t, mul=(0.55, 0.75, 0.35), sat=0.6), moss, 0.55)
    # colmo e gronda
    m3, d3 = new_mask()
    if ridge == "h":
        ym = (y0 + y1) / 2
        d3.line([(x0, ym), (x1, ym)], fill=255, width=10)
    else:
        xm = (x0 + x1) / 2
        d3.line([(xm, y0), (xm, y1)], fill=255, width=10)
    base = comp(base, grade(tex("gray_rocks", 200), mul=(0.75, 0.75, 0.75)), to_arr(m3, 0.8), 0.9)
    m4, d4 = new_mask()
    d4.rectangle([x0, y0, x1, y1], outline=255, width=5)
    base = darken(base, to_arr(m4, 1.0), 0.6)
    return base


def chimney(ov, x, y, s=34):
    ov.d.rectangle([x, y, x + s, y + s], fill=rgb("#6d675f"), outline=rgb("#2a2826"), width=3)
    ov.d.rectangle([x + 8, y + 8, x + s - 8, y + s - 8], fill=rgb("#141210"))


# ---------------------------------------------------------------- PIAZZA DELLA PIRA

PIAZZA_HOUSES = {
    # nome: (x0, y0, x1, y1, colmo, porte [(lato, a, b, stato)]) - stato 0 aperta/chiusa, 2 a chiave
    "chiesetta": (300, 110, 830, 500, "h", [("s", 600, 700, 0)]),
    "campanile": (190, 330, 330, 500, "h", []),
    "osteria": (1650, 120, 2200, 460, "h", [("s", 1860, 1940, 0)]),
    "iginius": (300, 1260, 720, 1560, "h", [("n", 450, 530, 0)]),
    "n1": (930, 0, 1080, 260, "v", [("s", 970, 1040, 2)]),
    "n2": (1320, 0, 1560, 250, "v", [("s", 1400, 1470, 2)]),
    "w1": (0, 620, 250, 1000, "v", [("e", 770, 850, 2)]),
    "w2": (0, 1090, 200, 1600, "v", [("e", 1250, 1330, 2)]),
    "e1": (2140, 600, 2400, 1000, "v", [("w", 760, 840, 2)]),
    "e2": (2160, 1100, 2400, 1600, "v", [("w", 1260, 1340, 2)]),
    "s1": (1520, 1350, 2060, 1600, "h", [("n", 1750, 1830, 2)]),
    "s2": (820, 1410, 1400, 1600, "h", [("n", 1060, 1140, 2)]),
}
PYRE = (1200, 850, 230)  # centro e raggio del cerchio di cenere


def render_piazza():
    rng = np.random.default_rng(11)
    n1, n2, n3 = fbm(1), fbm(2), fbm(3, scales=(90, 30, 10), weights=(0.5, 0.3, 0.2))
    # terra battuta e fango sotto tutto
    base = grade(tex("brown_mud_02", 520), mul=(0.95, 0.9, 0.85), sat=0.7)
    base = comp(base, grade(tex("muddy_tracks", 600), sat=0.6, mul=(0.85, 0.8, 0.75)), np.clip((n1 - 0.45) * 3, 0, 1))
    # selciato della piazza e delle strade
    m, d = new_mask()
    d.rounded_rectangle([250, 430, 2150, 1420], radius=220, fill=255)
    d.rectangle([1080, 0, 1320, 500], fill=255)       # mulattiera da nord
    d.rectangle([0, 500, 400, 620], fill=255)          # vicolo verso il prato della fiera
    d.rectangle([720, 1380, 820, 1600], fill=255)      # vicolo a sud
    d.rectangle([1400, 1380, 1520, 1600], fill=255)
    d.rectangle([2060, 1000, 2160, 1600], fill=255)
    cob_m = roughen(to_arr(m, 0), n3, spread=26, amount=1.1, sharp=5)
    cob = grade(tex("cobblestone_floor_08", 230), mul=(0.68, 0.66, 0.64), sat=0.45)
    cob = comp(cob, grade(tex("cobblestone_floor_08", 230, 1), mul=(0.5, 0.48, 0.46), sat=0.4), np.clip((n1 - 0.4) * 2.5, 0, 1), 0.7)
    base = comp(base, cob, cob_m)
    # pietre mancanti e fango tra i ciottoli
    holes = np.clip((n2 - 0.7) * 6, 0, 1) * cob_m * np.clip((n3 - 0.45) * 4, 0, 1)
    base = comp(base, grade(tex("muddy_tracks", 500), mul=(0.8, 0.75, 0.7)), holes, 0.8)
    # foglie secche negli angoli e lungo i muri
    leaves = np.clip((n3 * 0.6 + (1 - cob_m) * 0.5 - 0.62) * 5, 0, 1)
    base = comp(base, grade(tex("dry_decay_leaves", 300), mul=(0.85, 0.75, 0.65), sat=0.8), leaves, 0.75)

    # cerchio di cenere della pira, rialzato di 1 m
    cx, cy, r = PYRE
    m, d = new_mask()
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
    ash = roughen(to_arr(m, 0), n3, spread=14, amount=0.8, sharp=6)
    base = shadow(base, ash, 10, 14, 10, 0.5)
    base = comp(base, grade(tex("burned_ground_01", 420), mul=(0.55, 0.52, 0.5), sat=0.3), ash)
    base = comp(base, grade(tex("burned_ground_01", 300, 1), mul=(0.25, 0.23, 0.22), sat=0.2), ash * np.clip((n2 - 0.4) * 3, 0, 1), 0.7)
    ov = Overlay()
    for k in range(26):  # tizzoni e travi carbonizzate
        a = rng.uniform(0, 2 * math.pi); rr = rng.uniform(30, r - 30); L = rng.uniform(40, 110)
        x, y = cx + math.cos(a) * rr, cy + math.sin(a) * rr
        b = rng.uniform(0, math.pi)
        ov.d.line([(x - math.cos(b) * L / 2, y - math.sin(b) * L / 2), (x + math.cos(b) * L / 2, y + math.sin(b) * L / 2)],
                  fill=rgb("#17110d"), width=int(rng.uniform(8, 16)))
    for k in range(40):  # braci
        a = rng.uniform(0, 2 * math.pi); rr = rng.uniform(0, r * 0.75)
        x, y = cx + math.cos(a) * rr, cy + math.sin(a) * rr; s = rng.uniform(2, 5)
        ov.d.ellipse([x - s, y - s, x + s, y + s], fill=rgb("#c2481a", int(rng.uniform(120, 230))))
    # il palo, il teschio di gallina e il filo rosso
    ov.d.ellipse([cx - 16, cy - 16, cx + 16, cy + 16], fill=rgb("#120d0a"), outline=rgb("#2c211a"), width=3)
    ov.d.ellipse([cx - 7, cy - 22, cx + 7, cy - 10], fill=rgb("#e7dfcc"))
    ov.d.line([(cx + 5, cy - 16), (cx + 22, cy - 2), (cx + 14, cy + 12)], fill=rgb("#b3121b"), width=2)
    base = ov.apply(base, 0)

    # edifici
    ov = Overlay()
    for i, (name, (x0, y0, x1, y1, ridge, _doors)) in enumerate(PIAZZA_HOUSES.items()):
        base = roof(base, x0, y0, x1, y1, ridge, moss_seed=i, tint=(0.78, 0.78, 0.82) if name != "osteria" else (0.85, 0.78, 0.7))
        if name not in ("campanile",):
            if ridge == "h":
                chimney(ov, x0 + (x1 - x0) * rng.uniform(0.15, 0.8), y0 + (y1 - y0) * 0.18)
            else:
                chimney(ov, x0 + (x1 - x0) * 0.6, y0 + (y1 - y0) * rng.uniform(0.2, 0.7))
    # campanile: tetto a padiglione
    x0, y0, x1, y1 = PIAZZA_HOUSES["campanile"][:4]
    cxm, cym = (x0 + x1) / 2, (y0 + y1) / 2
    for pts, shade in [([(x0, y0), (x1, y0), (cxm, cym)], "#6f6b66"), ([(x1, y0), (x1, y1), (cxm, cym)], "#4e4a46"),
                       ([(x1, y1), (x0, y1), (cxm, cym)], "#3e3b38"), ([(x0, y1), (x0, y0), (cxm, cym)], "#5f5b57")]:
        ov.d.polygon(pts, fill=rgb(shade), outline=rgb("#262422"))
    bone_cross(ov, cxm, cym, 18)
    # chiesetta: croce d'ossa sul colmo e portale
    bone_cross(ov, 650, 305, 26)
    ov.d.rectangle([600, 492, 700, 516], fill=rgb("#3b2a1c"), outline=rgb("#1a120c"), width=2)
    bone_cross(ov, 650, 535, 10)
    # osteria: insegna del Ceppo e lanterna
    ov.d.rectangle([1960, 470, 2020, 500], fill=rgb("#6b4a2b"), outline=rgb("#2a1b10"), width=2)
    ov.d.ellipse([1978, 476, 2002, 494], fill=rgb("#3e2a17"))
    ov.d.ellipse([1890, 478, 1910, 498], fill=rgb("#ffcf7a"), outline=rgb("#3a2716"), width=2)
    # casa di Iginius: imposte verdi e la finestra accesa
    for sx in (360, 600):
        ov.d.rectangle([sx, 1252, sx + 50, 1268], fill=rgb("#3f6b3a"), outline=rgb("#1c2e1a"), width=2)
    ov.d.rectangle([612, 1254, 638, 1266], fill=rgb("#ffd27a"))
    # sambuco secco sulle porte (e chiodi nudi)
    for (x, y) in [(1005, 268), (1435, 258), (258, 810), (2132, 800), (1790, 1342), (1100, 1402), (208, 1290)]:
        ov.d.ellipse([x - 6, y - 6, x + 6, y + 6], fill=rgb("#4a3a2a"))
    base = ov.apply(base, 0)

    # arredo: pozzo, carretto, botti, alberi spogli, panca
    ov = Overlay()
    ov.d.ellipse([1640, 1010, 1760, 1130], fill=rgb("#77736c"), outline=rgb("#2f2d2a"), width=6)
    ov.d.ellipse([1662, 1032, 1738, 1108], fill=rgb("#0b0c0e"))
    ov.d.line([(1640, 1070), (1760, 1070)], fill=rgb("#4b3420"), width=8)
    for x, y in [(1700, 520), (1745, 525), (1722, 560), (2110, 520)]:
        barrel(ov, x, y)
    crate(ov, 1560, 500)
    # carretto con fieno, abbandonato vicino al vicolo ovest
    ov.d.rectangle([420, 640, 600, 740], fill=rgb("#5d4128"), outline=rgb("#24180e"), width=4)
    ov.d.rectangle([430, 650, 590, 730], fill=rgb("#a88b4f"))
    ov.d.line([(600, 690), (700, 690)], fill=rgb("#3b2817"), width=8)
    for wx in (440, 580):
        ov.d.rectangle([wx - 14, 626, wx + 14, 640], fill=rgb("#2b1d12"))
        ov.d.rectangle([wx - 14, 740, wx + 14, 754], fill=rgb("#2b1d12"))
    ov.d.rectangle([880, 1290, 1040, 1316], fill=rgb("#5a3d24"), outline=rgb("#24180e"), width=3)  # panca
    base = ov.apply(base, 6)
    ov = Overlay()
    for x, y, r in [(1580, 640, 120), (360, 1110, 110), (880, 520, 95)]:
        bare_tree(ov, x, y, r, rng)
    base = ov.apply(base, 10)

    base = grade(base, mul=(0.97, 0.97, 1.0), sat=0.85)
    base = vignette(base, 0.3)
    save(base, OUT / "piazza-della-pira.webp")

    walls = []
    for name, (x0, y0, x1, y1, _r, doors) in PIAZZA_HOUSES.items():
        if name == "campanile":
            continue
        walls += rect_walls(x0, y0, x1, y1, doors=doors)
    # campanile: unito alla chiesetta, muri esterni
    walls += poly_walls([(300, 330), (190, 330), (190, 500), (300, 500)], closed=False)
    # il palo: blocca la vista di un quadretto
    walls += rect_walls(1185, 835, 1215, 865, move=20, sight=20, light=0, sound=0)
    return walls


# ---------------------------------------------------------------- ACCAMPAMENTO

PAL = (120, 120, 2280, 1530)          # palizzata
GATE = (1100, 1300)                   # cancello sul lato sud
BREACH = (260, 340)                   # breccia nascosta sul lato est (y)
PAVILION = (950, 200, 1450, 540)
TENTS = [(650, 480), (650, 850), (650, 1180), (1750, 480), (1550, 780), (1550, 1150)]
TENT_W, TENT_H = 240, 180
CAGE = (800, 1240, 1060, 1360)
FORGE = (1740, 850, 1860, 950)
STAKE2 = (1950, 270)


def tent(base, ov, cx, cy, w, h, black=False, seed=0):
    x0, y0, x1, y1 = cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2
    canvas = tex("hessian_230", 300)
    canvas = grade(canvas, mul=(0.28, 0.28, 0.3), sat=0.3) if black else grade(canvas, mul=(1.35, 1.33, 1.28), sat=0.25, add=(0.05, 0.05, 0.05))
    m, d = new_mask()
    d.rounded_rectangle([x0, y0, x1, y1], radius=14, fill=255)
    a = to_arr(m, 0.8)
    base = shadow(base, a, 14, 18, 10, 0.5)
    base = comp(base, canvas, a)
    m2, d2 = new_mask()
    d2.rectangle([x0, cy, x1, y1], fill=255)
    base = darken(base, to_arr(m2, 1.5) * a, 0.22)
    # pieghe e macchie di pioggia
    folds = fbm(500 + seed, scales=(60, 20), weights=(0.7, 0.3))
    base = darken(base, a * np.clip((folds - 0.55) * 3, 0, 1), 0.25)
    ov.d.line([(x0 + 6, cy), (x1 - 6, cy)], fill=rgb("#2b2620" if not black else "#000000"), width=4)
    for px in (x0 - 18, x1 + 18):  # tiranti e picchetti
        for py in (y0 + 12, y1 - 12):
            ov.d.line([(px, py), ((x0 + x1) / 2 + (px - (x0 + x1) / 2) * 0.88, py)], fill=rgb("#7a6a55", 200), width=2)
            ov.d.ellipse([px - 4, py - 4, px + 4, py + 4], fill=rgb("#3a2a1a"))
    return base


def render_accampamento():
    rng = np.random.default_rng(22)
    n1, n2, n3 = fbm(21), fbm(22), fbm(23, scales=(90, 30, 10), weights=(0.5, 0.3, 0.2))
    grass = grade(tex("aerial_grass_rock", 700), mul=(0.75, 0.78, 0.65), sat=0.55)
    base = comp(grass, grade(tex("grass_path_3", 500), mul=(0.85, 0.85, 0.75), sat=0.6), np.clip((n1 - 0.4) * 2, 0, 1))
    # dentro la palizzata il prato è diventato fango
    x0, y0, x1, y1 = PAL
    m, d = new_mask()
    d.rectangle([x0 - 30, y0 - 30, x1 + 30, y1 + 30], fill=255)
    d.rectangle([GATE[0] - 40, y1, GATE[1] + 40, H], fill=255)  # strada fangosa dal cancello
    mud_m = roughen(to_arr(m, 0), n3, spread=40, amount=1.2, sharp=4)
    mud = grade(tex("muddy_tracks", 520), mul=(0.85, 0.78, 0.7), sat=0.7)
    mud = comp(mud, grade(tex("brown_mud_02", 450), mul=(0.75, 0.7, 0.65)), np.clip((n2 - 0.45) * 3, 0, 1))
    base = comp(base, mud, mud_m)
    # pozzanghere
    pud = np.clip((n1 * 0.7 + n3 * 0.3 - 0.66) * 9, 0, 1) * mud_m
    base = comp(base, grade(mud, mul=(0.35, 0.38, 0.45), sat=0.2, add=(0.04, 0.05, 0.07)), pud, 0.85)

    # passerelle di assi
    walks = [(1150, 540, 1250, 1530), (300, 620, 2100, 700), (300, 1000, 2100, 1070),
             (620, 570, 680, 620), (620, 700, 680, 760), (620, 940, 680, 1000), (620, 1070, 680, 1090),
             (1720, 570, 1780, 620), (1520, 870, 1580, 1000)]
    m, d = new_mask()
    for r in walks:
        d.rectangle(r, fill=255)
    wm = to_arr(m, 0.8)
    base = shadow(base, wm, 5, 6, 4, 0.5)
    planks_h = grade(tex("old_wood_floor", 220), mul=(0.85, 0.75, 0.62), sat=0.7)
    planks_v = grade(tex("old_wood_floor", 220, 1), mul=(0.85, 0.75, 0.62), sat=0.7)
    m, d = new_mask()
    for r in walks:
        if (r[2] - r[0]) < (r[3] - r[1]):
            d.rectangle(r, fill=255)
    vm = to_arr(m, 0.8)
    base = comp(base, planks_v, wm * (1 - vm))  # assi trasversali al percorso
    base = comp(base, planks_h, vm)
    base = comp(base, mud, wm * np.clip((n3 - 0.6) * 4, 0, 1), 0.6)  # fango sulle assi

    # tende e padiglione
    ov = Overlay()
    for i, (cx, cy) in enumerate(TENTS):
        base = tent(base, ov, cx, cy, TENT_W, TENT_H, seed=i)
        bone_cross(ov, cx, cy - 45, 22, col="#7a1d1d")
    px0, py0, px1, py1 = PAVILION
    base = tent(base, ov, (px0 + px1) / 2, (py0 + py1) / 2, px1 - px0, py1 - py0, black=True, seed=9)
    bone_cross(ov, 1200, 330, 40, col="#d9cfb6")
    # stendardo fradicio sul palo davanti al padiglione
    ov.d.ellipse([1300, 545, 1316, 561], fill=rgb("#2a1c10"))
    ov.d.polygon([(1308, 553), (1370, 560), (1362, 620), (1310, 600)], fill=rgb("#5a1414"), outline=rgb("#2a0a0a"))
    bone_cross(ov, 1338, 584, 12)
    base = ov.apply(base, 0)

    # palizzata di pali appuntiti con la corteccia
    ov = Overlay()
    def logs(p, q, skip=None):
        L = math.dist(p, q); n = int(L / 30)
        for k in range(n + 1):
            t = k / max(n, 1); x = p[0] + (q[0] - p[0]) * t; y = p[1] + (q[1] - p[1]) * t
            if skip and skip(x, y):
                continue
            r = rng.uniform(14, 18)
            ov.d.ellipse([x - r, y - r, x + r, y + r], fill=rgb("#4a3626"), outline=rgb("#1c140d"), width=3)
            ov.d.ellipse([x - r * 0.45, y - r * 0.45, x + r * 0.45, y + r * 0.45], fill=rgb("#8a7050"))
            ov.d.point((x, y), fill=rgb("#2a1d12"))
    logs((x0, y0), (x1, y0))
    logs((x0, y0), (x0, y1))
    logs((x1, y0), (x1, y1), skip=lambda x, y: BREACH[0] + 8 < y < BREACH[1] - 8 and False)
    logs((x0, y1), (GATE[0], y1))
    logs((GATE[1], y1), (x1, y1))
    # breccia: due pali storti e più radi (si vede solo guardando bene)
    for y in (BREACH[0] + 20, BREACH[1] - 25):
        ov.d.ellipse([x1 + 8, y - 12, x1 + 32, y + 12], fill=rgb("#4a3626"), outline=rgb("#1c140d"), width=3)
    # cancello: due battenti di assi
    for gx0, gx1 in ((GATE[0], 1195), (1205, GATE[1])):
        ov.d.rectangle([gx0, y1 - 12, gx1, y1 + 12], fill=rgb("#5b4129"), outline=rgb("#1c140d"), width=3)
        for gx in range(int(gx0) + 16, int(gx1), 20):
            ov.d.line([(gx, y1 - 12), (gx, y1 + 12)], fill=rgb("#2c1f13"), width=2)
    base = ov.apply(base, 8)

    # carro-gabbia, forgia, bracieri, secondo palo, casse
    ov = Overlay()
    c0, c1, c2, c3 = CAGE
    ov.d.rectangle([c0, c1, c2, c3], fill=rgb("#4b3622"), outline=rgb("#1b130c"), width=5)
    for k in range(int(c0) + 14, int(c2), 22):
        ov.d.line([(k, c1 + 4), (k, c3 - 4)], fill=rgb("#2e2f33"), width=4)
    ov.d.rectangle([c0 + 30, c1 + 30, c0 + 130, c3 - 30], fill=rgb("#4b4f3b"))  # la coperta dei prigionieri
    ov.d.line([(c2, (c1 + c3) / 2), (c2 + 90, (c1 + c3) / 2)], fill=rgb("#3b2817"), width=10)  # timone
    for wx in (c0 + 40, c2 - 40):
        ov.d.rectangle([wx - 20, c1 - 18, wx + 20, c1], fill=rgb("#24180e"))
        ov.d.rectangle([wx - 20, c3, wx + 20, c3 + 18], fill=rgb("#24180e"))
    f0, f1, f2, f3 = FORGE
    ov.d.rectangle([f0, f1, f2, f3], fill=rgb("#6e6862"), outline=rgb("#2a2826"), width=5)
    ov.d.ellipse([f0 + 25, f1 + 20, f2 - 25, f3 - 20], fill=rgb("#d14a12"))
    ov.d.ellipse([f0 + 40, f1 + 32, f2 - 40, f3 - 32], fill=rgb("#ffb347"))
    ov.d.polygon([(f0 - 10, f1 + 20), (f0 - 60, f1 + 5), (f0 - 60, f1 + 75), (f0 - 10, f1 + 60)], fill=rgb("#5a3a22"), outline=rgb("#22160c"))  # mantice
    ov.d.polygon([(1690, 975), (1760, 975), (1770, 990), (1760, 1005), (1690, 1005)], fill=rgb("#3a3b3f"), outline=rgb("#141416"))  # incudine
    ov.d.rectangle([1700, 1005, 1750, 1030], fill=rgb("#4a3626"))
    crate(ov, 1880, 980, 56, col="#4a2f1b")  # polvere nera
    ov.d.ellipse([1898, 998, 1918, 1018], fill=rgb("#111111"))
    for x, y in [(1960, 990), (1950, 1050)]:
        barrel(ov, x, y, 24)
    for x, y in [(250, 250), (2150, 250), (250, 1350), (2150, 1350)]:
        ov.d.ellipse([x - 32, y - 32, x + 32, y + 32], fill=rgb("#2c2c2e"), outline=rgb("#0e0e10"), width=5)
        ov.d.ellipse([x - 20, y - 20, x + 20, y + 20], fill=rgb("#b8400f"))
        ov.d.ellipse([x - 9, y - 9, x + 9, y + 9], fill=rgb("#ffb347"))
    sx, sy = STAKE2
    ov.d.ellipse([sx - 60, sy - 60, sx + 60, sy + 60], fill=rgb("#5a4632", 150))
    ov.d.ellipse([sx - 16, sy - 16, sx + 16, sy + 16], fill=rgb("#9a7a52"), outline=rgb("#3a2716"), width=4)
    ov.d.ellipse([sx - 6, sy - 6, sx + 6, sy + 6], fill=rgb("#c8aa7a"))
    for x, y in [(1480, 300), (1480, 350), (1530, 320)]:
        barrel(ov, x, y)
    crate(ov, 880, 260); crate(ov, 880, 315, 40)
    # rastrelliera di alabarde
    ov.d.rectangle([1300, 1160, 1460, 1180], fill=rgb("#4a3626"))
    for k in range(6):
        ov.d.line([(1310 + k * 28, 1130), (1310 + k * 28, 1210)], fill=rgb("#8b8d93"), width=3)
    # fuoco da campo con marmitta
    ov.d.ellipse([340, 810, 420, 890], fill=rgb("#3a3836"), outline=rgb("#1e1d1c"), width=4)
    ov.d.ellipse([360, 830, 400, 870], fill=rgb("#c2481a"))
    ov.d.ellipse([368, 838, 392, 862], fill=rgb("#2b2b2b"))
    base = ov.apply(base, 6)
    # abeti fuori dalla palizzata
    ov = Overlay()
    for k in range(60):
        side = rng.integers(4)
        if side == 0:
            x, y = rng.uniform(0, W), rng.uniform(-40, 70)
        elif side == 1:
            x, y = rng.uniform(0, W), rng.uniform(1560, H + 40)
        elif side == 2:
            x, y = rng.uniform(-40, 70), rng.uniform(0, H)
        else:
            x, y = rng.uniform(2330, W + 40), rng.uniform(0, H)
        if side == 1 and GATE[0] - 80 < x < GATE[1] + 80:
            continue
        pine(ov, x, y, rng.uniform(55, 95), rng)
    base = ov.apply(base, 14)

    base = grade(base, mul=(0.95, 0.96, 1.0), sat=0.8)
    base = vignette(base, 0.3)
    save(base, OUT / "accampamento-dell-inquisizione.webp")

    walls = []
    # palizzata: piena, cancello a due battenti, breccia segreta a est
    walls.append(wall((x0, y0, x1, y0)))
    walls.append(wall((x0, y0, x0, y1)))
    walls.append(wall((x1, y0, x1, BREACH[0])))
    walls.append(wall((x1, BREACH[0], x1, BREACH[1]), door=2))
    walls.append(wall((x1, BREACH[1], x1, y1)))
    walls.append(wall((x0, y1, GATE[0], y1)))
    walls.append(wall((GATE[0], y1, 1200, y1), door=1))
    walls.append(wall((1200, y1, GATE[1], y1), door=1))
    walls.append(wall((GATE[1], y1, x1, y1)))
    # tende: vista e luce limitate, il suono passa; ingresso verso la passerella
    lim = dict(sight=10, light=10, sound=0)
    for cx, cy in TENTS:
        tx0, ty0, tx1, ty1 = cx - TENT_W / 2, cy - TENT_H / 2, cx + TENT_W / 2, cy + TENT_H / 2
        if cx < 1200:
            side = "s" if cy < 700 else "n"
        else:
            side = "s" if cy < 700 else ("n" if cy > 1000 else "s")
        walls += rect_walls(tx0, ty0, tx1, ty1, doors=[(side, cx - 30, cx + 30, 0)], **lim)
    walls += rect_walls(*PAVILION, doors=[("s", 1150, 1250, 0)], **lim)
    # carro-gabbia: le sbarre bloccano solo il movimento; sportello chiuso a chiave
    c0, c1, c2, c3 = CAGE
    bars = dict(sight=0, light=0, sound=0)
    walls += rect_walls(c0, c1, c2, c3, doors=[("e", c1 + 30, c3 - 30, 2)], **bars)
    return walls


# ---------------------------------------------------------------- VETTA

RING_C, RING_R = (1200, 800), 500
LAKE = (1200, 800, 300, 280)
STONES = [(1200, 300), (1521, 417), (1692, 713), (1633, 1050), (1371, 1270), (1029, 1270), (767, 1050), (708, 713), (879, 417)]
HIGH_ROCK = (470, 430)
PYRE2 = (1200, 175, 72)


def cliff_x(y):
    return 2160 + 45 * math.sin(y / 170) + 25 * math.sin(y / 53 + 1.3) + 9 * math.sin(y / 23.7 + 0.7) + 5 * math.sin(y / 7.3 + 2.1)


def render_vetta():
    rng = np.random.default_rng(33)
    n1, n2, n3 = fbm(31), fbm(32), fbm(33, scales=(90, 30, 10), weights=(0.5, 0.3, 0.2))
    snow = grade(tex("snow_02", 700), mul=(0.86, 0.9, 0.98), sat=0.6)
    snow = comp(snow, grade(tex("snow_03", 500), mul=(0.86, 0.9, 0.98), sat=0.5), np.clip((n1 - 0.5) * 3, 0, 1))
    # roccia che affiora dove il vento spazza la neve
    rock = grade(tex("rocky_terrain_02", 650), mul=(0.68, 0.7, 0.75), sat=0.15)
    rock = comp(rock, grade(tex("gray_rocks", 300), mul=(0.6, 0.62, 0.66), sat=0.2), np.clip((n3 - 0.5) * 3, 0, 1))
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    dring = np.sqrt((x - RING_C[0]) ** 2 + (y - RING_C[1]) ** 2)
    edge = np.clip((dring - 620) / 500, 0, 1)
    rock_m = np.clip((n2 * 0.7 + n3 * 0.25 + edge * 0.5 - 0.74) * 12, 0, 1)
    base = comp(snow, rock, rock_m)
    # creste di neve soffiata dal vento (da ovest)
    streak = fbm(34, scales=(400, 120), weights=(0.6, 0.4))
    streak = np.asarray(Image.fromarray((streak * 255).astype(np.uint8)).resize((W // 6, H)).resize((W, H)), np.float32) / 255
    base = comp(base, grade(snow, add=(0.08, 0.08, 0.09)), np.clip((streak - 0.6) * 3, 0, 1), 0.6)

    # dirupo a est
    cl = np.array([cliff_x(v) for v in range(H)], np.float32)[:, None]
    void = np.clip((x - cl) / 14, 0, 1)
    abyss = np.zeros_like(base) + np.array([0.05, 0.06, 0.09], np.float32)
    abyss = comp(abyss, grade(tex("rock_face_04", 500), mul=(0.25, 0.27, 0.32), sat=0.2), np.clip(1 - (x - cl) / 160, 0, 1) * void)
    mist = np.clip((x - cl - 80) / 200, 0, 1) * (0.25 + 0.35 * n1)
    abyss = comp(abyss, np.zeros_like(base) + np.array([0.55, 0.6, 0.68], np.float32), mist)
    base = comp(base, abyss, void)
    lip = np.clip(1 - np.abs(x - cl + 18) / (14 + 18 * n3), 0, 1) * (1 - void)
    base = comp(base, grade(tex("rock_face_04", 300), mul=(0.5, 0.52, 0.58), sat=0.2), lip, 0.9)

    # cengia a sud: un passaggio di 1,5 m fra due speroni di roccia
    m, d = new_mask()
    d.polygon([(860, H), (900, 1440), (1010, 1390), (1140, 1420), (1150, H)], fill=255)
    d.polygon([(1250, H), (1260, 1420), (1390, 1380), (1520, 1450), (1560, H)], fill=255)
    for k in range(10):  # massi lungo il bordo ovest e sud-ovest
        cx_, cy_ = rng.uniform(30, 350), rng.uniform(900, 1580)
        d.polygon(jitter_poly(cx_, cy_, rng.uniform(60, 130), rng.uniform(50, 110), 9, rng, 0.25), fill=255)
    for k in range(6):
        cx_, cy_ = rng.uniform(30, 600), rng.uniform(0, 160)
        d.polygon(jitter_poly(cx_, cy_, rng.uniform(60, 120), rng.uniform(50, 100), 9, rng, 0.25), fill=255)
    crag = roughen(to_arr(m, 0), n3, spread=8, amount=0.7, sharp=6)
    base = shadow(base, crag, 18, 24, 12, 0.55)
    crag_t = grade(tex("rock_face_04", 420), mul=(0.62, 0.65, 0.72), sat=0.2)
    base = comp(base, crag_t, crag)
    cap = crag * np.clip((shift(1 - crag, 0, 18) - 0.3), 0, 1) + crag * np.clip((n2 - 0.55) * 4, 0, 1)
    base = comp(base, snow, np.clip(cap, 0, 1), 0.85)

    # la pietra alta (rialzata di 1,5 m) a nord-ovest
    m, d = new_mask()
    hr = jitter_poly(*HIGH_ROCK, 125, 95, 12, rng, 0.12, rot=0.3)
    d.polygon(hr, fill=255)
    hm = to_arr(m, 1)
    base = shadow(base, hm, 26, 32, 14, 0.6)
    base = comp(base, grade(tex("rock_boulder_cracked", 380), mul=(0.55, 0.6, 0.7), sat=0.15), hm)
    base = comp(base, snow, hm * np.clip((n3 - 0.45) * 3, 0, 1), 0.8)
    m, d = new_mask(); d.polygon(hr, outline=255, width=6)
    base = darken(base, to_arr(m, 2), 0.5)

    # il lago gelato: ghiaccio nero, crepe, forme ferme sotto la superficie
    lx, ly, lrx, lry = LAKE
    m, d = new_mask()
    d.ellipse([lx - lrx, ly - lry, lx + lrx, ly + lry], fill=255)
    lake = roughen(to_arr(m, 0), n3, spread=10, amount=0.6, sharp=6)
    ice = grade(tex("dark_rock", 520), mul=(0.25, 0.32, 0.42), sat=0.5, add=(0.02, 0.04, 0.07))
    dl = np.sqrt(((x - lx) / lrx) ** 2 + ((y - ly) / lry) ** 2)
    ice = comp(ice, np.zeros_like(ice) + np.array([0.02, 0.03, 0.05], np.float32), np.clip(1 - dl, 0, 1) * 0.7)
    ov = Overlay()
    for k in range(7):  # forme ferme
        a = rng.uniform(0, 2 * math.pi); rr = rng.uniform(0, 0.6)
        fx, fy = lx + math.cos(a) * lrx * rr, ly + math.sin(a) * lry * rr
        ang = rng.uniform(0, math.pi)
        pts = []
        for t in np.linspace(0, 2 * math.pi, 18):
            px_ = math.cos(t) * 46 * (1 + 0.3 * math.sin(3 * t)); py_ = math.sin(t) * 18
            pts.append((fx + px_ * math.cos(ang) - py_ * math.sin(ang), fy + px_ * math.sin(ang) + py_ * math.cos(ang)))
        ov.d.polygon(pts, fill=rgb("#c9d6e4", 34))
        hx, hy = fx + math.cos(ang) * 40, fy + math.sin(ang) * 40
        ov.d.ellipse([hx - 11, hy - 11, hx + 11, hy + 11], fill=rgb("#c9d6e4", 40))
    ice = ov.apply(ice, 0)
    ov = Overlay()
    def crack(px_, py_, ang, L, depth):
        if depth == 0 or L < 8:
            return
        x2, y2 = px_ + math.cos(ang) * L, py_ + math.sin(ang) * L
        ov.d.line([(px_, py_), (x2, y2)], fill=rgb("#a9c4dc", 150), width=2)
        crack(x2, y2, ang + rng.uniform(-0.6, 0.6), L * 0.7, depth - 1)
        if rng.random() < 0.5:
            crack(x2, y2, ang + rng.choice([-1, 1]) * rng.uniform(0.6, 1.2), L * 0.5, depth - 1)
    for k in range(12):
        a = rng.uniform(0, 2 * math.pi)
        crack(lx + math.cos(a) * lrx * 0.95, ly + math.sin(a) * lry * 0.95, a + math.pi + rng.uniform(-0.4, 0.4), rng.uniform(40, 90), 5)
    ice = ov.apply(ice, 0)
    sheen = np.clip(1 - np.abs((x - lx) * 0.6 + (y - ly) - 40) / 90, 0, 1) * np.clip(1 - dl, 0, 1)
    ice = comp(ice, np.ones_like(ice) * 0.85, sheen, 0.12)
    base = ao(base, lake, 12, 0.4)
    base = comp(base, ice, lake)
    rim = np.clip(1 - np.abs(dl - 1) / 0.04, 0, 1)
    base = comp(base, snow, rim * 0.8)

    # impronte dalla cengia al cerchio
    ov = Overlay()
    for track in range(3):
        px_, py_ = 1200 + rng.uniform(-30, 30), 1560
        for k in range(26):
            ang = -math.pi / 2 + rng.uniform(-0.25, 0.25) + (track - 1) * 0.12
            px_ += math.cos(ang) * 18; py_ += math.sin(ang) * 18
            off = 8 if k % 2 else -8
            ov.d.ellipse([px_ + off - 4, py_ - 6, px_ + off + 4, py_ + 6], fill=rgb("#8a97a8", 110))
    base = ov.apply(base, 0)

    # nove pietre ritte con torce
    stone_polys = []
    ov_t = Overlay()
    for i, (sx, sy) in enumerate(STONES):
        ang = math.atan2(sy - RING_C[1], sx - RING_C[0]) + math.pi / 2  # lato lungo tangente al cerchio
        pts = []
        for j, (u, v) in enumerate([(-52, -22), (-30, -34), (18, -32), (54, -16), (50, 20), (14, 33), (-34, 30), (-56, 6)]):
            u *= rng.uniform(0.9, 1.1); v *= rng.uniform(0.9, 1.1)
            pts.append((sx + u * math.cos(ang) - v * math.sin(ang), sy + u * math.sin(ang) + v * math.cos(ang)))
        stone_polys.append(pts)
        m, d = new_mask(); d.polygon(pts, fill=255)
        sm = to_arr(m, 1)
        base = shadow(base, sm, 34, 44, 16, 0.6)  # pietre alte: ombre lunghe
        base = comp(base, grade(tex("rock_boulder_cracked", 260), mul=(0.48, 0.5, 0.56), sat=0.15), sm)
        base = comp(base, snow, sm * np.clip(shift(1 - sm, -10, -12) * 2, 0, 1), 0.8)
        m, d = new_mask(); d.polygon(pts, outline=255, width=5)
        base = darken(base, to_arr(m, 1.5), 0.55)
        # rune graffiate e torcia piantata sul lato interno
        ov_t.d.line([(sx - 10, sy - 6), (sx + 10, sy + 6)], fill=rgb("#20232a", 200), width=3)
        ov_t.d.line([(sx - 10, sy + 6), (sx, sy - 8)], fill=rgb("#20232a", 200), width=3)
        tx_, ty_ = sx + (RING_C[0] - sx) * 0.13, sy + (RING_C[1] - sy) * 0.13
        ov_t.d.ellipse([tx_ - 7, ty_ - 7, tx_ + 7, ty_ + 7], fill=rgb("#3a2716"))
        ov_t.d.ellipse([tx_ - 4, ty_ - 4, tx_ + 4, ty_ + 4], fill=rgb("#ffb347"))
    base = ov_t.apply(base, 0)

    # pira di fascine con il fantoccio
    px_, py_, pr = PYRE2
    ov = Overlay()
    for k in range(70):
        a = rng.uniform(0, math.pi); rr = rng.uniform(0, pr * 0.9); L = rng.uniform(50, 110)
        cx_, cy_ = px_ + math.cos(a * 2) * rr * 0.7, py_ + math.sin(a * 2) * rr * 0.7
        ov.d.line([(cx_ - math.cos(a) * L / 2, cy_ - math.sin(a) * L / 2), (cx_ + math.cos(a) * L / 2, cy_ + math.sin(a) * L / 2)],
                  fill=rgb(rng.choice(["#5b4129", "#6b4d31", "#47331f", "#7a5a38"])), width=int(rng.uniform(5, 9)))
    ov.d.ellipse([px_ - 28, py_ - 28, px_ + 28, py_ + 28], fill=rgb("#b3954f"), outline=rgb("#5e4a24"), width=3)  # paglia
    ov.d.ellipse([px_ - 15, py_ - 40, px_ + 15, py_ - 12], fill=rgb("#a01a1a"))                                 # fazzoletto rosso
    ov.d.ellipse([px_ - 8, py_ + 12, px_ + 8, py_ + 24], fill=rgb("#2a3a1e"))                                 # sambuco
    base = ov.apply(base, 12)

    base = grade(base, mul=(0.94, 0.96, 1.02), sat=0.85)
    base = vignette(base, 0.25)
    save(base, OUT / "vetta-del-rituale.webp")

    walls = []
    for pts in stone_polys:
        walls += poly_walls(pts, light=0)  # bloccano vista e movimento, non la luce di pira e torce
    # dirupo: blocca solo il movimento
    edge_pts = [(cliff_x(v) - 4, v) for v in range(0, H + 1, 80)]
    walls += poly_walls(edge_pts, closed=False, sight=0, light=0, sound=0)
    # speroni della cengia
    walls += poly_walls([(900, H), (900, 1440), (1010, 1390), (1140, 1420), (1150, H)], closed=False)
    walls += poly_walls([(1250, H), (1260, 1420), (1390, 1380), (1520, 1450), (1560, H)], closed=False)
    return walls


# ---------------------------------------------------------------- muri nelle scene

def write_walls(scene_file: str, prefix: str, walls: list) -> None:
    path = SCENES / scene_file
    doc = json.loads(path.read_text(encoding="utf-8-sig"))
    out = []
    for i, w in enumerate(walls):
        out.append({"_id": f"{prefix}{i:0{16 - len(prefix)}d}", **w})
    doc["walls"] = out
    path.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{scene_file}: {len(out)} muri")


def main():
    fetch_textures()
    walls_p = render_piazza()
    walls_a = render_accampamento()
    walls_v = render_vetta()
    if "--no-walls" not in sys.argv:
        write_walls("Piazza_della_Pira_DipireScPiazza01.json", "DpWlP", walls_p)
        write_walls("Accampamento_dell_Inquisizione_DipireScAccamp01.json", "DpWlA", walls_a)
        write_walls("Vetta_del_Rituale_DipireScVetta001.json", "DpWlV", walls_v)


if __name__ == "__main__":
    main()
