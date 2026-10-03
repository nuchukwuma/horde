import { responsiveImage } from '@/lib/media/responsiveImage';

/**
 * A storefront photo: a plain <img> (server-rendered, no client JS) that
 * lets the browser choose a size from srcset. `priority` is for the one
 * photo that is the page's main content (the hero, a product's main
 * photo): fetched at once and early instead of lazily.
 */
export default function StoreImage({ image, alt, sizes, priority = false, className, fallbackWidth }) {
  const { src, srcSet } = responsiveImage(image, fallbackWidth);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      srcSet={srcSet}
      sizes={srcSet ? sizes : undefined}
      alt={alt ?? image.alt ?? ''}
      width={image.width || undefined}
      height={image.height || undefined}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : undefined}
      decoding="async"
      className={className}
    />
  );
}
