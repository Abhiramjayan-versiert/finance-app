// Renders PNG app icons from public/icons/icon.svg using the system Chromium (Playwright).
import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const svg = await readFile(path.join(root, "public/icons/icon.svg"), "utf8");
const browser = await chromium.launch();
const page = await browser.newPage();
const targets = [
  ["icon-192.png", 192, 0],
  ["icon-512.png", 512, 0],
  ["apple-touch-icon.png", 180, 0],
  ["maskable-512.png", 512, 0.12],
  ["favicon-32.png", 32, 0],
];
for (const [name, size, pad] of targets) {
  await page.setViewportSize({ width: size, height: size });
  const inner = Math.round(size * (1 - pad * 2));
  await page.setContent(`<html><body style="margin:0;background:#0B0D0F;display:grid;place-items:center;width:${size}px;height:${size}px">${svg.replace("<svg ", `<svg width="${inner}" height="${inner}" `)}</body></html>`);
  await page.screenshot({ path: path.join(root, "public/icons", name), omitBackground: false });
  console.log("wrote", name);
}
await browser.close();
