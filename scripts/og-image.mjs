// Builds public/og-image.png (1200x630), the picture shown when the app's link is shared.
// Run: node scripts/og-image.mjs   (re-run after changing the logo or tagline)
import sharp from 'sharp';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="glow" cx="78%" cy="62%" r="55%"><stop offset="0" stop-color="#97abbb" stop-opacity=".18"/><stop offset="1" stop-color="#97abbb" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1200" height="630" fill="#0b120e"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <!-- big mountain, bottom right -->
  <g transform="translate(660 160) scale(7.2)">
    <path d="M4 50 L9 33 L13 29.5 L33 29 L39 26 L44 19.5 Q48 16 52 19 L55 26 L60 50 Z" fill="#6f8597"/><path d="M4 50 L9 33 L13 35 L40 31 L22 50 Z" fill="#4f6474"/><path d="M9 33 L13 29.5 L33 29 L39 26 L44 19.5 Q48 16 52 19 L55 26 L53 28.5 L45 26.5 L40 31 L13 35 Z" fill="#c9d6df"/>
  </g>
  <rect x="0" y="524" width="1200" height="106" fill="#0b120e"/>
  <rect x="0" y="524" width="1200" height="2" fill="#24352b"/>
  <!-- text -->
  <text x="80" y="250" font-family="Segoe UI, Arial, sans-serif" font-weight="800" font-size="104" fill="#eef5f0" letter-spacing="-2">Bluies</text>
  <text x="80" y="362" font-family="Segoe UI, Arial, sans-serif" font-weight="800" font-size="104" fill="#3ddc84" letter-spacing="-2">Finest</text>
  <text x="84" y="440" font-family="Segoe UI, Arial, sans-serif" font-weight="400" font-size="34" fill="#a9bdb0">Hangboard accountability</text>
  <text x="84" y="486" font-family="Segoe UI, Arial, sans-serif" font-weight="400" font-size="34" fill="#a9bdb0">and bragging rights.</text>
  <text x="84" y="588" font-family="Segoe UI, Arial, sans-serif" font-weight="600" font-size="26" fill="#8fa597">Timers · Protocols · Leaderboards · Seasons</text>
</svg>`;
await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(new URL('../public/og-image.png', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
console.log('wrote public/og-image.png');
