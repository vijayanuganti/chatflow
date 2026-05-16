import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const src = path.join(root, "icons");
const dest = path.join(root, "public", "icons");

if (!fs.existsSync(src)) {
  console.warn("No icons/ folder — skip PWA copy");
  process.exit(0);
}

fs.mkdirSync(dest, { recursive: true });
for (const name of fs.readdirSync(src)) {
  if (!name.endsWith(".webp")) continue;
  fs.copyFileSync(path.join(src, name), path.join(dest, name));
}
console.log("Copied PWA icons to public/icons/");
