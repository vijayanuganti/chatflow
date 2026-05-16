/**
 * Build assets/splash.png — icon + "ChatFlow" wordmark (canvas text; sharp SVG text is unreliable on Windows).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";
import { createCanvas } from "@napi-rs/canvas";

const SIZE = 2732;
const ICON_PX = 520;
const BRAND = "#064e3b";
const BG = "#ffffff";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const svgPath = path.join(root, "public", "favicon.svg");
const assetsDir = path.join(root, "assets");
const splashOut = path.join(assetsDir, "splash.png");

if (!fs.existsSync(svgPath)) {
  console.error("Missing public/favicon.svg");
  process.exit(1);
}

fs.mkdirSync(assetsDir, { recursive: true });

const iconPng = await sharp(fs.readFileSync(svgPath), { density: 384 })
  .resize(ICON_PX, ICON_PX, { fit: "contain", background: { r: 6, g: 78, b: 59, alpha: 1 } })
  .png()
  .toBuffer();

const wordCanvas = createCanvas(1100, 200);
const wctx = wordCanvas.getContext("2d");
wctx.clearRect(0, 0, 1100, 200);
wctx.fillStyle = BRAND;
wctx.font = '600 132px "Segoe UI", system-ui, -apple-system, sans-serif';
wctx.textAlign = "center";
wctx.textBaseline = "middle";
wctx.fillText("ChatFlow", 550, 100);
const wordPng = wordCanvas.toBuffer("image/png");

const iconX = Math.round((SIZE - ICON_PX) / 2);
const iconY = Math.round(SIZE * 0.32);
const wordMeta = await sharp(wordPng).metadata();
const wordW = wordMeta.width || 1100;
const wordH = wordMeta.height || 200;
const wordX = Math.round((SIZE - wordW) / 2);
const wordY = iconY + ICON_PX + 72;

await sharp({
  create: {
    width: SIZE,
    height: SIZE,
    channels: 4,
    background: BG,
  },
})
  .composite([
    { input: iconPng, left: iconX, top: iconY },
    { input: wordPng, left: wordX, top: wordY },
  ])
  .png()
  .toFile(splashOut);

console.log("Wrote", splashOut);
