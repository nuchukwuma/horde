# Hero reel

The landing page's 12-second looping video of a store being built, made with
[Remotion](https://www.remotion.dev). It is a separate project on purpose:
none of this ships in the app bundle — only the three rendered files do.

```bash
cd video
npm install
npm run studio      # preview and edit
CHROMIUM_PATH=/path/to/chrome-headless-shell npm run render
```

`npm run render` writes, into `../public/media/`:

| file                   | budget   | last render |
| ---------------------- | -------- | ----------- |
| `hero-reel.mp4` (H.264)| < 800 KB | 129 KB      |
| `hero-reel.webm` (VP9) | < 800 KB | 250 KB      |
| `hero-reel-poster.jpg` | —        | 51 KB       |

The poster is what Data Saver and reduced-motion visitors see instead of the
video (components/landing/HeroReel.jsx).

The cloth and product art are imported from the app's own components, so the
reel and the live demo always show the same patterns.

**Licence.** Remotion is free for individuals and companies of up to 3
employees; larger companies need a Remotion company licence. Confirm which
applies before re-rendering commercially.
