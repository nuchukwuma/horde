import { Composition, registerRoot, staticFile } from 'remotion';
import { loadFont } from '@remotion/fonts';
import { HeroReel } from './HeroReel';

// The same self-hosted faces the site uses (Adire direction).
loadFont({ family: 'Unbounded', url: staticFile('fonts/unbounded.woff2'), weight: '200 900' });
loadFont({ family: 'Figtree', url: staticFile('fonts/figtree.woff2'), weight: '300 900' });

const Root = () => (
  <Composition id="HeroReel" component={HeroReel} durationInFrames={360} fps={30} width={720} height={720} />
);

registerRoot(Root);
