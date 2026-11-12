# Mappe delle scene

`render_maps.py` disegna le tre mappe in `img/maps/` (2400 × 1600 px, 100 px per quadretto da 1,5 m)
e scrive i muri corrispondenti nelle scene in `src/adventure/scenes/`.

```
pip install pillow numpy
python tools/maps/render_maps.py            # mappe, miniature e muri
python tools/maps/render_maps.py --no-walls # solo immagini
```

Al primo avvio scarica in `tools/maps/.cache/` le texture da [Poly Haven](https://polyhaven.com),
tutte CC0 ([licenza](https://polyhaven.com/license)). Il rendering è deterministico (semi fissi).

La geometria (edifici, tende, pietre) segue le coordinate di luci, note e token delle scene:
se spostate qualcosa qui, spostate anche le luci nei JSON delle scene, e viceversa.
