const fs = require("fs");
const path = process.argv[2];
if (!path) {
  console.error("Usage: node fix-mojibake.js <file>");
  process.exit(1);
}
let c = fs.readFileSync(path, "utf8");
const reps = [
  ["\u2014", "-"],
  ["\u2013", "-"],
  ["\u00e2\u20ac\u201d", "-"],
  ["\u00e2\u20ac\u00a6", "..."],
  ["\u00c2\u00b7", " | "],
  ["\u00b7", " | "],
  ["\u00e2\u2020\u2019", "->"],
  ["\u2026", "..."],
];
for (const [from, to] of reps) {
  c = c.split(from).join(to);
}
fs.writeFileSync(path, c, "utf8");
console.log("Fixed:", path);
