# Type specimen

A static copy of the Redline hero (four cards cut round a helmet still, the name, the pillar names and Book), with the booking portal and an accounts row below it, so typefaces can be judged in context. The switcher at the bottom swaps between four options; the choice is kept in the URL hash (`#helvetica-now`, `#heros`, `#archivo`, `#syne`).

Plain static folder: no install, no build.

```bash
cd prototypes/type-specimen
python3 -m http.server 8000 --bind 127.0.0.1   # http://127.0.0.1:8000
```

## Options

| Switcher | Name | Everything else |
| --- | --- | --- |
| Helvetica Now | Helvetica Now Display | Helvetica Now Text |
| Heros | TeX Gyre Heros | TeX Gyre Heros |
| Archivo + Heros | Archivo Expanded SemiBold | TeX Gyre Heros |
| Syne + Heros | Syne ExtraBold | TeX Gyre Heros |

All type reads CSS variables set per option on `html[data-type]` (`--name-font`, `--text-font`, `--figure-font` and the name's size, tracking and case), so the chosen option drops into the real site by copying one block.

## Licences

| File | Face | Licence |
| --- | --- | --- |
| none | Helvetica Now (Monotype) | Commercial. Not shipped: `local()` only, so it shows where installed, otherwise Helvetica Neue, Helvetica or Arial |
| `fonts/texgyreheros-regular.woff2` | TeX Gyre Heros 2.004, GUST e-foundry | GUST Font License (LPPL 1.3c), see `fonts/GUST-FONT-LICENSE.txt`, `fonts/LPPL-1.3c.txt`. Converted from the original OTF to WOFF2 without other changes |
| `fonts/archivo-expanded-600.woff2` | Archivo, Omnibus-Type | SIL OFL 1.1, `fonts/OFL-Archivo.txt` |
| `fonts/syne-latin-var.woff2` | Syne, Bonjour Monde (Fontsource Latin subset) | SIL OFL 1.1, `fonts/OFL-Syne.txt` |

## Media

The card stills are copied from `prototypes/helmet-follow/public/content/clips/`. `media/helmet.webp` is rendered from the helmet-follow model by `scripts/render-helmet.html` (instructions inside). Sources and licences for both are in the page's Credits and in the helmet-follow README.
