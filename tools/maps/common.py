"""Strumenti comuni per disegnare le mappe di Di Pire con texture CC0 di Poly Haven.

Coordinate in pixel di scena (100 px = 1 quadretto = 1,5 m). Le immagini sono array
float32 HxWx3 in [0, 1]; le maschere sono array HxW in [0, 1].
"""
from __future__ import annotations

import math
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H = 2400, 1600
HERE = Path(__file__).resolve().parent
CACHE = HERE / ".cache"
POLYHAVEN = "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/{0}/{0}_diff_1k.jpg"

# Texture usate (tutte CC0, https://polyhaven.com/license).
TEXTURES = [
    "snow_02", "snow_03", "snow_04", "cobblestone_floor_08", "muddy_tracks", "brown_mud_02",
    "roof_slates_02", "old_wood_floor", "dark_planks", "rough_wood", "hessian_230",
    "rocky_terrain_02", "burned_ground_01", "gray_rocks", "rock_boulder_cracked",
    "dry_decay_leaves", "grass_path_3", "aerial_grass_rock", "dark_rock", "rock_face_04",
    "medieval_blocks_02", "forest_leaves_04",
]


def fetch_textures() -> None:
    CACHE.mkdir(exist_ok=True)
    for name in TEXTURES:
        dest = CACHE / f"{name}.jpg"
        if dest.exists():
            continue
        req = urllib.request.Request(POLYHAVEN.format(name), headers={"User-Agent": "historia-dipire-maps"})
        with urllib.request.urlopen(req) as r:
            dest.write_bytes(r.read())
        print("scaricata", name)


_tex_cache: dict = {}


def tex(name: str, px: int, rot90: int = 0) -> np.ndarray:
    """Texture ripetuta su tutta la scena; `px` = lato di una ripetizione in pixel."""
    key = (name, px, rot90)
    if key not in _tex_cache:
        im = Image.open(CACHE / f"{name}.jpg").convert("RGB").resize((px, px), Image.LANCZOS)
        a = np.asarray(im, dtype=np.float32) / 255.0
        if rot90:
            a = np.rot90(a, rot90)
        reps = (math.ceil(H / a.shape[0]) + 1, math.ceil(W / a.shape[1]) + 1, 1)
        _tex_cache[key] = np.tile(a, reps)[:H, :W].copy()
    return _tex_cache[key]


def grade(a: np.ndarray, mul=(1, 1, 1), add=(0, 0, 0), sat: float = 1.0, gamma: float = 1.0) -> np.ndarray:
    g = a.mean(axis=2, keepdims=True)
    out = g + (a - g) * sat
    out = out * np.array(mul, np.float32) + np.array(add, np.float32)
    out = np.clip(out, 0, 1)
    if gamma != 1.0:
        out = out ** gamma
    return out.astype(np.float32)


def fbm(seed: int, scales=(420, 160, 60, 20), weights=(0.5, 0.28, 0.15, 0.07)) -> np.ndarray:
    rng = np.random.default_rng(seed)
    acc = np.zeros((H, W), np.float32)
    for s, w in zip(scales, weights):
        gw, gh = max(2, W // s + 2), max(2, H // s + 2)
        small = Image.fromarray((rng.random((gh, gw)) * 255).astype(np.uint8), "L")
        big = small.resize((gw * s, gh * s), Image.BICUBIC).crop((0, 0, W, H))
        acc += np.asarray(big, np.float32) / 255.0 * w
    acc -= acc.min()
    return acc / max(acc.max(), 1e-6)


def new_mask() -> tuple[Image.Image, ImageDraw.ImageDraw]:
    m = Image.new("L", (W, H), 0)
    return m, ImageDraw.Draw(m)


def to_arr(m: Image.Image, blur: float = 0.8) -> np.ndarray:
    if blur:
        m = m.filter(ImageFilter.GaussianBlur(blur))
    return np.asarray(m, np.float32) / 255.0


def blur(a: np.ndarray, r: float) -> np.ndarray:
    im = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(r))
    return np.asarray(im, np.float32) / 255.0


def roughen(m: np.ndarray, noise: np.ndarray, spread: float = 18, amount: float = 0.9, sharp: float = 6) -> np.ndarray:
    """Bordi irregolari: sfuma la maschera, la perturba con il rumore e la ritaglia."""
    b = blur(m, spread)
    return np.clip((b - 0.5 + (noise - 0.5) * amount) * sharp + 0.5, 0, 1)


def comp(base: np.ndarray, layer: np.ndarray, m: np.ndarray, alpha: float = 1.0) -> np.ndarray:
    m3 = (m * alpha)[..., None]
    return base * (1 - m3) + layer * m3


def darken(base: np.ndarray, m: np.ndarray, strength: float) -> np.ndarray:
    return base * (1 - (m * strength)[..., None])


def shift(m: np.ndarray, dx: int, dy: int) -> np.ndarray:
    out = np.zeros_like(m)
    ys = slice(max(dy, 0), H + min(dy, 0))
    xs = slice(max(dx, 0), W + min(dx, 0))
    ys2 = slice(max(-dy, 0), H + min(-dy, 0))
    xs2 = slice(max(-dx, 0), W + min(-dx, 0))
    out[ys, xs] = m[ys2, xs2]
    return out


def shadow(base: np.ndarray, m: np.ndarray, dx: int = 14, dy: int = 18, r: float = 9, strength: float = 0.5) -> np.ndarray:
    return darken(base, blur(shift(m, dx, dy), r), strength)


def ao(base: np.ndarray, m: np.ndarray, r: float = 14, strength: float = 0.35) -> np.ndarray:
    """Ombreggiatura di contatto attorno a un oggetto (sul terreno, fuori dalla maschera)."""
    return darken(base, blur(m, r) * (1 - m), strength)


def vignette(base: np.ndarray, strength: float = 0.35) -> np.ndarray:
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    d = np.sqrt(((x - W / 2) / (W / 2)) ** 2 + ((y - H / 2) / (H / 2)) ** 2) / math.sqrt(2)
    return base * (1 - strength * np.clip(d - 0.35, 0, 1)[..., None] / 0.65)


# ---------- oggetti disegnati con PIL su un livello RGBA ----------

class Overlay:
    def __init__(self) -> None:
        self.im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.im)

    def apply(self, base: np.ndarray, shadow_px: int = 0) -> np.ndarray:
        a = np.asarray(self.im, np.float32) / 255.0
        if shadow_px:
            base = shadow(base, a[..., 3], shadow_px, shadow_px, shadow_px * 0.7, 0.45)
        return comp(base, a[..., :3], a[..., 3])


def rgb(h: str, a: int = 255) -> tuple:
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def jitter_poly(cx, cy, rx, ry, n, rng, amt=0.18, rot=0.0):
    pts = []
    for i in range(n):
        t = rot + 2 * math.pi * i / n
        k = 1 + rng.uniform(-amt, amt)
        pts.append((cx + math.cos(t) * rx * k, cy + math.sin(t) * ry * k))
    return pts


def pine(ov: Overlay, cx, cy, r, rng) -> None:
    """Abete visto dall'alto: stelle sovrapposte, dal verde scuro al chiaro."""
    cols = ["#14241a", "#1d3324", "#28432c", "#355536"]
    for i, c in enumerate(cols):
        rr = r * (1 - i * 0.22)
        pts = []
        n = 14
        for k in range(n * 2):
            t = math.pi * k / n + rng.uniform(-0.08, 0.08)
            rad = rr * (1.0 if k % 2 == 0 else 0.62) * rng.uniform(0.85, 1.1)
            pts.append((cx - i * r * 0.05 + math.cos(t) * rad, cy - i * r * 0.06 + math.sin(t) * rad))
        ov.d.polygon(pts, fill=rgb(c))


def bare_tree(ov: Overlay, cx, cy, r, rng, col="#2a211b") -> None:
    """Albero spoglio visto dall'alto: rami che si diramano dal tronco."""
    def branch(x, y, ang, length, width, depth):
        if depth == 0 or length < 6:
            return
        x2, y2 = x + math.cos(ang) * length, y + math.sin(ang) * length
        ov.d.line([(x, y), (x2, y2)], fill=rgb(col), width=max(1, int(width)))
        for s in (-1, 1):
            branch(x2, y2, ang + s * rng.uniform(0.3, 0.7), length * rng.uniform(0.55, 0.75), width * 0.65, depth - 1)
    for k in range(rng.integers(5, 8)):
        branch(cx, cy, rng.uniform(0, 2 * math.pi), r * rng.uniform(0.35, 0.5), r * 0.09, 4)
    ov.d.ellipse([cx - r * 0.1, cy - r * 0.1, cx + r * 0.1, cy + r * 0.1], fill=rgb("#251c16"))


def barrel(ov: Overlay, cx, cy, r=22) -> None:
    ov.d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=rgb("#5a3d24"), outline=rgb("#2b2b2b"), width=3)
    ov.d.ellipse([cx - r * 0.72, cy - r * 0.72, cx + r * 0.72, cy + r * 0.72], outline=rgb("#3a2716"), width=2)
    ov.d.ellipse([cx - r * 0.3, cy - r * 0.3, cx + r * 0.3, cy + r * 0.3], outline=rgb("#3a2716"), width=1)


def crate(ov: Overlay, x, y, s=44, col="#6b4a2b") -> None:
    ov.d.rectangle([x, y, x + s, y + s], fill=rgb(col), outline=rgb("#2a1b10"), width=3)
    ov.d.line([(x, y), (x + s, y + s)], fill=rgb("#3e2a17"), width=3)
    ov.d.line([(x + s, y), (x, y + s)], fill=rgb("#3e2a17"), width=3)


def bone_cross(ov: Overlay, cx, cy, s, col="#e8dcc0") -> None:
    """La Croce d'Ossa: due ossa incrociate ad angolo retto, con le estremità a nodo."""
    w = max(3, int(s * 0.16))
    ov.d.line([(cx, cy - s), (cx, cy + s)], fill=rgb(col), width=w)
    ov.d.line([(cx - s * 0.62, cy - s * 0.3), (cx + s * 0.62, cy - s * 0.3)], fill=rgb(col), width=w)
    k = w * 0.9
    for px, py in [(cx, cy - s), (cx, cy + s), (cx - s * 0.62, cy - s * 0.3), (cx + s * 0.62, cy - s * 0.3)]:
        ov.d.ellipse([px - k, py - k, px + k, py + k], fill=rgb(col))


def save(base: np.ndarray, path: Path, quality: int = 86) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray((np.clip(base, 0, 1) * 255).astype(np.uint8), "RGB").save(path, "WEBP", quality=quality, method=6)
    print("scritta", path.name, f"{path.stat().st_size // 1024} KB")
    thumb = Image.open(path)
    thumb.thumbnail((300, 200))
    thumb.save(path.with_name(path.stem + "-thumb.webp"), "WEBP", quality=80)


# ---------- muri ----------

def wall(c, *, move=20, sight=20, light=20, sound=20, door=0, ds=0):
    return {"c": [int(round(v)) for v in c], "light": light, "move": move, "sight": sight, "sound": sound,
            "dir": 0, "door": door, "ds": ds, "threshold": {"light": None, "sight": None, "sound": None, "attenuation": False},
            "flags": {}}


def rect_walls(x0, y0, x1, y1, doors=(), **kw):
    """Muri di un rettangolo. `doors`: lista di (lato, a, b, ds) con lato in n/s/e/w e a-b l'intervallo."""
    sides = {"n": ((x0, y0), (x1, y0)), "s": ((x0, y1), (x1, y1)), "w": ((x0, y0), (x0, y1)), "e": ((x1, y0), (x1, y1))}
    out = []
    for side, (p, q) in sides.items():
        horiz = p[1] == q[1]
        lo, hi = (p[0], q[0]) if horiz else (p[1], q[1])
        cuts = sorted([(a, b, ds) for s, a, b, ds in doors if s == side])
        cur = lo
        for a, b, ds in cuts:
            seg = (cur, p[1], a, p[1]) if horiz else (p[0], cur, p[0], a)
            out.append(wall(seg, **kw))
            dseg = (a, p[1], b, p[1]) if horiz else (p[0], a, p[0], b)
            out.append(wall(dseg, **{**kw, "door": 1, "ds": ds}))
            cur = b
        seg = (cur, p[1], hi, p[1]) if horiz else (p[0], cur, p[0], hi)
        out.append(wall(seg, **kw))
    return out


def poly_walls(pts, closed=True, **kw):
    n = len(pts)
    rng_ = range(n if closed else n - 1)
    return [wall((*pts[i], *pts[(i + 1) % n]), **kw) for i in rng_]
