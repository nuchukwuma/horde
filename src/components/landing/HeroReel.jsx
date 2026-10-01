'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The 12-second reel of a store being built (rendered with Remotion; see
 * video/README.md).
 *
 * Costs nothing until it is needed: `preload="none"`, and the sources are
 * only attached once the reel scrolls near the viewport. Two groups never
 * get the video at all, just the poster frame:
 *   - Data Saver users (navigator.connection.saveData). On a metered
 *     Nigerian mobile plan, 700 KB of decoration is a real cost.
 *   - prefers-reduced-motion users, for whom a looping video is the exact
 *     thing they asked not to see.
 * It pauses whenever it is off screen.
 */
export default function HeroReel({ poster, webm, mp4, caption }) {
  const frame = useRef(null);
  const video = useRef(null);
  const [mode, setMode] = useState('poster'); // poster | video

  useEffect(() => {
    const saveData = Boolean(navigator.connection?.saveData);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (saveData || reduce || !('IntersectionObserver' in window)) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setMode('video');
            video.current?.play().catch(() => {});
          } else {
            video.current?.pause();
          }
        }
      },
      { rootMargin: '200px 0px' },
    );
    if (frame.current) observer.observe(frame.current);
    return () => observer.disconnect();
  }, []);

  return (
    <figure className="reel" ref={frame}>
      {mode === 'video' ? (
        <video
          ref={video}
          className="reel__media"
          poster={poster}
          muted
          loop
          playsInline
          autoPlay
          preload="none"
          aria-label={caption}
        >
          <source src={webm} type="video/webm" />
          <source src={mp4} type="video/mp4" />
        </video>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="reel__media" src={poster} alt={caption} loading="lazy" decoding="async" />
      )}
      <figcaption className="reel__caption">{caption}</figcaption>
    </figure>
  );
}
