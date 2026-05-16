/**
 * Rasterize public/favicon.svg into assets/icon.png (1024) for Capacitor native icons.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const svgPath = path.join(root, "public", "favicon.svg");
const assetsDir = path.join(root, "assets");
const iconOut = path.join(assetsDir, "icon.png");

if (!fs.existsSync(svgPath)) {
  console.error("Missing public/favicon.svg");
  process.exit(1);
}

fs.mkdirSync(assetsDir, { recursive: true });

const svg = fs.readFileSync(svgPath);

await sharp(svg, { density: 384 })
  .resize(1024, 1024, { fit: "contain", background: { r: 6, g: 78, b: 59, alpha: 1 } })
  .png()
  .toFile(iconOut);

console.log("Wrote", iconOut);
