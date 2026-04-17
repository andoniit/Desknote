# Apple splash screens

PNG placeholders for **apple-mobile-web-app-startup-image** (linked from `app/layout.tsx`).

Regenerate with the rest of the PWA assets:

```bash
npm run generate:icons
```

Add more sizes + `media` queries in `app/layout.tsx` → `metadata.appleWebApp.startupImage` as you support additional devices.
