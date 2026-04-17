/**
 * Generates cream + rose PWA icons and Apple splash placeholders.
 * Run: npm run generate:icons
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const iconsDir = path.join(root, "public", "icons");
const splashDir = path.join(root, "public", "splash");

const CREAM = "#FDFAF6";
const ROSE = "#D98A8A";
const PLUM = "#6B4E57";

/** 512×512, maskable-safe padding, rounded square + soft heart */
const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="${CREAM}"/>
  <path fill="${ROSE}" opacity="0.95" d="M256 392
    C 168 328 112 272 112 208
    A 80 80 0 0 1 256 128
    A 80 80 0 0 1 400 208
    C 400 272 344 328 256 392 Z"/>
  <circle cx="256" cy="168" r="12" fill="${PLUM}" opacity="0.25"/>
</svg>`;

function splashSvg(w, h) {
  const title = Math.max(22, Math.round(w * 0.055));
  const sub = Math.max(12, Math.round(w * 0.028));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <radialGradient id="wash" cx="50%" cy="0%" r="95%">
      <stop offset="0%" stop-color="#F5D5D0" stop-opacity="0.95"/>
      <stop offset="45%" stop-color="#FDFAF6"/>
      <stop offset="100%" stop-color="#F8F1E9"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#wash)"/>
  <text x="50%" y="46%" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="${title}" fill="${PLUM}" opacity="0.9">DeskNote</text>
  <text x="50%" y="54%" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="${sub}" fill="#8B6A77" opacity="0.8">little notes for two</text>
</svg>`;
}

async function pngFromSvg(svg, outPath, width, height) {
  await sharp(Buffer.from(svg)).resize(width, height).png().toFile(outPath);
}

async function main() {
  fs.mkdirSync(iconsDir, { recursive: true });
  fs.mkdirSync(splashDir, { recursive: true });

  await pngFromSvg(ICON_SVG, path.join(iconsDir, "icon-512.png"), 512, 512);
  await pngFromSvg(ICON_SVG, path.join(iconsDir, "icon-192.png"), 192, 192);
  await pngFromSvg(ICON_SVG, path.join(iconsDir, "apple-touch-icon.png"), 180, 180);
  await pngFromSvg(ICON_SVG, path.join(iconsDir, "favicon-32.png"), 32, 32);
  fs.writeFileSync(path.join(iconsDir, "icon.svg"), ICON_SVG, "utf8");

  await pngFromSvg(
    splashSvg(1170, 2532),
    path.join(splashDir, "apple-splash-1170x2532.png"),
    1170,
    2532
  );
  await pngFromSvg(
    splashSvg(1284, 2778),
    path.join(splashDir, "apple-splash-1284x2778.png"),
    1284,
    2778
  );

  console.log("OK: public/icons/* + public/splash/*");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
