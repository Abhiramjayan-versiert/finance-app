// Generates Android launcher icons, splash screens and Play Store graphics
// from the FINANCE OS mark. Run: node mobile/make-assets.mjs
import sharp from "sharp";
import { readdirSync, existsSync, writeFileSync, readFileSync } from "node:fs";
const readFileText = (p) => readFileSync(p, "utf8");
import { join } from "node:path";

const RES = "android/app/src/main/res";
const GLYPH = (stroke = "#fff") =>
  `<path d="M10 22V10h12" stroke="${stroke}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M10 16h8" stroke="${stroke}" stroke-width="3" stroke-linecap="round" fill="none"/><circle cx="22.5" cy="21.5" r="2.5" fill="${stroke}" fill-opacity="0.9"/>`;
const BG = `<defs><linearGradient id="g" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse"><stop stop-color="#3a3a40"/><stop offset="1" stop-color="#0e0e10"/></linearGradient><radialGradient id="h" cx="0.3" cy="0.15" r="0.8"><stop stop-color="#fff" stop-opacity="0.22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>`;

// Full square icon (legacy + store): glassy dark tile with white mark.
const tile = (rx) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${BG}<rect width="32" height="32" rx="${rx}" fill="url(#g)"/><rect width="32" height="32" rx="${rx}" fill="url(#h)"/><g transform="translate(16 16) scale(0.78) translate(-16 -16)">${GLYPH()}</g></svg>`;
// Adaptive foreground: glyph only, inside the 66/108 safe zone.
const fg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108"><g transform="translate(54 54) scale(1.9) translate(-16 -16)">${GLYPH()}</g></svg>`;
const bgTile = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">${BG.replace('x2="32" y2="32"', 'x2="108" y2="108"')}<rect width="108" height="108" fill="url(#g)"/><rect width="108" height="108" fill="url(#h)"/></svg>`;

const png = (svg, w, h = w) => sharp(Buffer.from(svg), { density: 600 }).resize(w, h).png();

const DPI = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(DPI)) {
  const dir = join(RES, `mipmap-${d}`);
  await png(tile(7), Math.round(48 * k)).toFile(join(dir, "ic_launcher.png"));
  await png(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${BG}<circle cx="16" cy="16" r="16" fill="url(#g)"/><circle cx="16" cy="16" r="16" fill="url(#h)"/><g transform="translate(16 16) scale(0.72) translate(-16 -16)">${GLYPH()}</g></svg>`, Math.round(48 * k)).toFile(join(dir, "ic_launcher_round.png"));
  await png(fg, Math.round(108 * k)).toFile(join(dir, "ic_launcher_foreground.png"));
  await png(bgTile, Math.round(108 * k)).toFile(join(dir, "ic_launcher_background.png"));
}
writeFileSync(
  join(RES, "mipmap-anydpi-v26/ic_launcher.xml"),
  `<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@mipmap/ic_launcher_background"/>\n    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n    <monochrome android:drawable="@mipmap/ic_launcher_foreground"/>\n</adaptive-icon>\n`,
);
writeFileSync(join(RES, "mipmap-anydpi-v26/ic_launcher_round.xml"), readFileText(join(RES, "mipmap-anydpi-v26/ic_launcher.xml")));


// Splash screens: dark backdrop, centred mark. Keep each existing size.
const splash = (w, h) => {
  const s = Math.round(Math.min(w, h) * 0.22);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><radialGradient id="a" cx="0.2" cy="0.1" r="0.9"><stop stop-color="#2a2a2f"/><stop offset="1" stop-color="#08080a"/></radialGradient></defs><rect width="${w}" height="${h}" fill="url(#a)"/><svg x="${(w - s) / 2}" y="${(h - s) / 2}" width="${s}" height="${s}" viewBox="0 0 32 32">${BG}<rect width="32" height="32" rx="9" fill="url(#g)"/><rect width="32" height="32" rx="9" fill="url(#h)"/><rect x="0.5" y="0.5" width="31" height="31" rx="8.5" fill="none" stroke="#fff" stroke-opacity="0.18"/><g transform="translate(16 16) scale(0.78) translate(-16 -16)">${GLYPH()}</g></svg></svg>`;
};
for (const dir of readdirSync(RES).filter((d) => d.startsWith("drawable"))) {
  const f = join(RES, dir, "splash.png");
  if (!existsSync(f)) continue;
  const { width, height } = await sharp(f).metadata();
  const buf = await sharp(Buffer.from(splash(width, height))).png().toBuffer();
  writeFileSync(f, buf);
}

// Play Store graphics.
await png(tile(0), 512).toFile("mobile/store/icon-512.png");
const feature = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500"><defs><radialGradient id="a" cx="0.15" cy="0.1" r="1"><stop stop-color="#2e2e34"/><stop offset="1" stop-color="#08080a"/></radialGradient></defs><rect width="1024" height="500" fill="url(#a)"/><svg x="90" y="170" width="160" height="160" viewBox="0 0 32 32">${BG}<rect width="32" height="32" rx="9" fill="url(#g)"/><rect width="32" height="32" rx="9" fill="url(#h)"/><rect x="0.5" y="0.5" width="31" height="31" rx="8.5" fill="none" stroke="#fff" stroke-opacity="0.2"/><g transform="translate(16 16) scale(0.78) translate(-16 -16)">${GLYPH()}</g></svg><text x="290" y="235" font-family="Helvetica, Arial, sans-serif" font-size="64" font-weight="700" fill="#f5f5f7" letter-spacing="-1">FINANCE OS</text><text x="292" y="295" font-family="Helvetica, Arial, sans-serif" font-size="30" fill="#a1a1a8">Your Money. Your Goals. Your Future.</text></svg>`;
await sharp(Buffer.from(feature)).png().toFile("mobile/store/feature-graphic-1024x500.png");
console.log("assets ok");
