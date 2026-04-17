# DeskNote PWA icons

Generated PNGs (cream + rose, maskable-safe) live here. Regenerate after changing the script:

```bash
npm run generate:icons
```

| File | Use |
|------|-----|
| `icon.svg` | Source art / favicon fallbacks in design tools |
| `icon-192.png` | Web app manifest |
| `icon-512.png` | Web app manifest, splash bases |
| `apple-touch-icon.png` | 180×180 — **Add to Home Screen** on iPhone |
| `favicon-32.png` | Browser tab |

Dev dependency: **`sharp`** (see `scripts/generate-pwa-icons.mjs`). For production assets you can swap in hand-drawn exports from [RealFaviconGenerator](https://realfavicongenerator.net/) or Figma — keep the same filenames.
