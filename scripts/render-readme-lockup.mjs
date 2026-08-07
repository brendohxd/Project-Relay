import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Dark-plate lockup so mark + wordmark stay readable on GitHub light/dark README.
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="960" height="240" viewBox="0 0 480 120">
  <rect width="480" height="120" rx="16" fill="#12110f"/>
  <g transform="translate(28 28) skewX(-14)">
    <rect x="0" y="0" width="14" height="64" rx="2.2" fill="#ff6b35"/>
    <rect x="20" y="0" width="14" height="64" rx="2.2" fill="#b9f77c"/>
    <rect x="40" y="0" width="14" height="64" rx="2.2" fill="#79a8ff"/>
  </g>
  <text x="108" y="58" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-weight="700" font-size="42" letter-spacing="-1.2" fill="#f3f1eb">Project Relay</text>
  <text x="108" y="88" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-weight="500" font-size="16" letter-spacing="1.2" fill="#a7a49a">ONE RECORD  ·  MANY MINDS</text>
</svg>`;

const svgSrc = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 120" role="img" aria-label="Project Relay">
  <title>Project Relay — README lockup</title>
  <rect width="480" height="120" rx="16" fill="#12110f"/>
  <g transform="translate(28 28) skewX(-14)">
    <rect x="0" y="0" width="14" height="64" rx="2.2" fill="#ff6b35"/>
    <rect x="20" y="0" width="14" height="64" rx="2.2" fill="#b9f77c"/>
    <rect x="40" y="0" width="14" height="64" rx="2.2" fill="#79a8ff"/>
  </g>
  <text x="108" y="58" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-weight="700" font-size="42" letter-spacing="-1.2" fill="#f3f1eb">Project Relay</text>
  <text x="108" y="88" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-weight="500" font-size="16" letter-spacing="1.2" fill="#a7a49a">ONE RECORD  ·  MANY MINDS</text>
</svg>`;

const pngRel = [
  "Assets/project-relay-assets/logo/headers/wordmark-lockup.png",
  "apps/console/assets/logo/headers/wordmark-lockup.png",
  "docs/assets/logo/headers/wordmark-lockup.png",
];

const svgRel = [
  "Assets/project-relay-assets/logo/headers/wordmark-lockup-readme.svg",
  "apps/console/assets/logo/headers/wordmark-lockup-readme.svg",
  "docs/assets/logo/headers/wordmark-lockup-readme.svg",
];

const buf = await sharp(Buffer.from(svg)).png().toBuffer();

for (const rel of pngRel) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, buf);
  console.log("wrote", rel, buf.length);
}

for (const rel of svgRel) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, svgSrc);
  console.log("wrote", rel);
}
