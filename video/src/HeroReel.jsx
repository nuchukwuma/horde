import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { adireTiles, AdireMotif } from '../../src/components/design/AdirePattern';
import ProductArt from '../../src/components/art/ProductArt';

/**
 * 12 seconds, looping: a store is built on HordeMart.
 *
 *   0.0–1.6s  the name is typed
 *   1.2–3.6s  the adire cloth is stamped, square by square
 *   3.4–5.8s  stock drops onto the shelf, prices in naira
 *   5.8–8.0s  the address appears and is shared in a chat
 *   8.0–10.4s a customer pays with Paystack; the credit alert lands
 *  10.6–12.0s everything clears back to the first frame, so the loop is seamless
 *
 * Every movement is computed from the frame number (useCurrentFrame +
 * interpolate), as Remotion requires — CSS animation does not render.
 * Colours are the Adire palette; the cloth and product art are the same
 * components the live site uses.
 */

const INDIGO = '#22307a';
const STARCH = '#fcfcf8';
const WASH = '#dce1f5';
const KOLA = '#b4472a';
const INK = '#161a33';
const RESIST = '#f4f1e6';

const NAME = 'Ade Fabrics';
const SLUG = 'ade-fabrics.hordemart.com';
const PRODUCTS = [
  ['Adire kampala', '₦18,500'],
  ['Ankara bubu', '₦24,000'],
  ['Aso-oke gele', '₦12,000'],
];

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };
const out = Easing.bezier(0.16, 1, 0.3, 1);
const spring = Easing.bezier(0.34, 1.56, 0.64, 1);

export const HeroReel = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = (seconds) => Math.round(seconds * fps);

  // Global fade-out for the loop, and fade-in at the start.
  const scene = interpolate(frame, [0, s(0.3), s(10.6), s(11.8)], [0, 1, 1, 0], clamp);

  const typed = Math.floor(interpolate(frame, [s(0.2), s(1.5)], [0, NAME.length], clamp));
  const caret = Math.floor(frame / s(0.4)) % 2 === 0 || typed < NAME.length;
  const tiles = adireTiles(NAME, 12);

  const urlIn = interpolate(frame, [s(5.8), s(6.5)], [0, 1], { ...clamp, easing: out });
  const bubbleIn = interpolate(frame, [s(6.6), s(7.4)], [0, 1], { ...clamp, easing: spring });
  const press = interpolate(frame, [s(8.0), s(8.2), s(8.45)], [1, 0.93, 1], clamp);
  const alertIn = interpolate(frame, [s(8.6), s(9.3)], [0, 1], { ...clamp, easing: spring });

  return (
    <AbsoluteFill style={{ background: STARCH, fontFamily: 'Figtree', color: INK }}>
      <AbsoluteFill style={{ opacity: scene }}>
        {/* Phone */}
        <div
          style={{
            position: 'absolute',
            left: 170,
            top: 56,
            width: 380,
            height: 556,
            borderRadius: 44,
            background: '#141838',
            padding: 12,
            boxShadow: '0 40px 80px -30px rgba(20,24,56,.45)',
          }}
        >
          <div style={{ width: '100%', height: '100%', borderRadius: 34, background: STARCH, overflow: 'hidden', position: 'relative' }}>
            {/* Header: the name being typed */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '22px 20px 14px' }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 11,
                  background: INDIGO,
                  color: '#fff',
                  display: 'grid',
                  placeItems: 'center',
                  fontFamily: 'Unbounded',
                  fontWeight: 700,
                  fontSize: 15,
                  scale: interpolate(frame, [s(1.4), s(1.9)], [0, 1], { ...clamp, easing: spring }),
                }}
              >
                AF
              </div>
              <div style={{ fontFamily: 'Unbounded', fontWeight: 650, fontSize: 21, letterSpacing: '-0.03em' }}>
                {NAME.slice(0, typed)}
                <span style={{ opacity: caret && frame < s(2) ? 1 : 0, color: INDIGO }}>|</span>
              </div>
            </div>

            {/* The cloth, stamped square by square */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', background: WASH }}>
              {tiles.map((tile, i) => {
                const start = s(1.2) + i * 3;
                return (
                  <div key={i} style={{ aspectRatio: '1 / 1', background: INDIGO, overflow: 'hidden' }}>
                    <svg
                      viewBox="0 0 50 50"
                      style={{
                        width: '100%',
                        height: '100%',
                        display: 'block',
                        scale: interpolate(frame, [start, start + 10], [0, 1], { ...clamp, easing: spring }),
                        rotate: `${tile.turn * 90}deg`,
                      }}
                    >
                      <AdireMotif motif={tile.motif} resist={RESIST} />
                    </svg>
                  </div>
                );
              })}
            </div>

            {/* Stock */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, padding: 16 }}>
              {PRODUCTS.map(([title, price], i) => {
                const start = s(3.4) + i * 7;
                return (
                  <div
                    key={title}
                    style={{
                      opacity: interpolate(frame, [start, start + 6], [0, 1], clamp),
                      translate: interpolate(frame, [start, start + 14], ['0px -40px', '0px 0px'], { ...clamp, easing: spring }),
                    }}
                  >
                    <div style={{ aspectRatio: '4 / 5', borderRadius: 12, overflow: 'hidden' }}>
                      <ProductArt title={`${title} fabric`} seed={title} label="" />
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6 }}>{title}</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: INDIGO }}>{price}</div>
                  </div>
                );
              })}
            </div>

            {/* Pay button */}
            <div style={{ padding: '4px 16px' }}>
              <div
                style={{
                  background: INDIGO,
                  color: '#fff',
                  borderRadius: 14,
                  padding: '15px 0',
                  textAlign: 'center',
                  fontWeight: 700,
                  fontSize: 17,
                  scale: press,
                  opacity: interpolate(frame, [s(5.2), s(5.6)], [0, 1], clamp),
                }}
              >
                Pay with Paystack
              </div>
            </div>

            {/* Credit alert */}
            <div
              style={{
                position: 'absolute',
                left: 12,
                right: 12,
                top: 12,
                padding: '14px 16px',
                borderRadius: 18,
                background: '#ffffff',
                boxShadow: '0 18px 40px -16px rgba(20,24,56,.5)',
                display: 'flex',
                gap: 12,
                alignItems: 'center',
                opacity: alertIn,
                translate: `0px ${interpolate(alertIn, [0, 1], [-90, 0])}px`,
              }}
            >
              <div style={{ width: 40, height: 40, borderRadius: 12, background: '#12784a', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 20 }}>
                ₦
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>Credit alert</div>
                <div style={{ fontSize: 14, color: '#4a4f6a' }}>₦18,500.00 paid to Ade Fabrics</div>
              </div>
            </div>
          </div>
        </div>

        {/* Address chip */}
        <div
          style={{
            position: 'absolute',
            left: 40,
            top: 626,
            padding: '12px 18px',
            borderRadius: 999,
            background: INDIGO,
            color: '#fff',
            fontWeight: 700,
            fontSize: 19,
            opacity: urlIn,
            translate: `${interpolate(urlIn, [0, 1], [-60, 0])}px 0px`,
            boxShadow: '0 16px 30px -14px rgba(20,24,56,.6)',
          }}
        >
          {SLUG}
        </div>

        {/* Shared in a chat */}
        <div
          style={{
            position: 'absolute',
            right: 34,
            top: 180,
            width: 230,
            padding: 14,
            borderRadius: '18px 18px 4px 18px',
            background: '#dcf3e4',
            fontSize: 16,
            lineHeight: 1.35,
            opacity: bubbleIn,
            scale: interpolate(bubbleIn, [0, 1], [0.6, 1]),
            boxShadow: '0 16px 30px -16px rgba(20,24,56,.4)',
          }}
        >
          New stock in! Order here:
          <div style={{ color: INDIGO, fontWeight: 800, marginTop: 4 }}>{SLUG}</div>
        </div>

        {/* Kola mark: the one warm accent */}
        <div
          style={{
            position: 'absolute',
            left: 70,
            top: 120,
            width: 70,
            height: 70,
            borderRadius: '50%',
            border: `6px solid ${KOLA}`,
            scale: interpolate(frame, [s(0.3), s(1)], [0, 1], { ...clamp, easing: spring }),
          }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
