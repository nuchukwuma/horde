/**
 * Render the reel into the app's public/media folder.
 *
 *   npm run render
 *
 * Uses the Chromium already on the machine when CHROMIUM_PATH is set (CI
 * images and sandboxes often block Remotion's own browser download).
 * Targets: WebM (VP9) and MP4 (H.264) under 800 KB each, plus a JPEG poster
 * for Data Saver and reduced-motion visitors.
 */
import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';

const out = '../public/media';
const browser = process.env.CHROMIUM_PATH ? ['--browser-executable', process.env.CHROMIUM_PATH] : [];
const run = (args) => execFileSync('npx', ['remotion', ...args, ...browser], { stdio: 'inherit' });

run(['render', 'src/index.jsx', 'HeroReel', `${out}/hero-reel.mp4`, '--codec', 'h264', '--crf', '30', '--pixel-format', 'yuv420p', '--muted']);
run(['render', 'src/index.jsx', 'HeroReel', `${out}/hero-reel.webm`, '--codec', 'vp9', '--crf', '42', '--muted']);
run(['still', 'src/index.jsx', 'HeroReel', `${out}/hero-reel-poster.jpg`, '--frame', '290', '--image-format', 'jpeg', '--jpeg-quality', '78']);

for (const file of ['hero-reel.mp4', 'hero-reel.webm', 'hero-reel-poster.jpg']) {
  const kb = Math.round(statSync(`${out}/${file}`).size / 1024);
  console.log(`${file}: ${kb} KB${kb > 800 ? '  ⚠ over the 800 KB budget' : ''}`);
}
