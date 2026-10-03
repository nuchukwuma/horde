import localFont from 'next/font/local';

/**
 * Preloads HordeMart's own pair (Unbounded + Figtree) on HordeMart's pages
 * only.
 *
 * Next preloads a font on the routes whose server code imports it. Declared
 * in the root layout, these preloads went out with every store too. Imported
 * by app/(platform)/layout.jsx, they reach HordeMart's pages only. (A client
 * component's import does not count, which is why it is the layout.) Same
 * files as src/app/fonts.js, so the browser downloads each once; the faces
 * actually used are still the ones on <html>.
 */
export const unboundedPreload = localFont({
  src: '../../assets/fonts/unbounded-latin-wght-normal.woff2',
  weight: '200 900',
  display: 'swap',
});

export const figtreePreload = localFont({
  src: '../../assets/fonts/figtree-latin-wght-normal.woff2',
  weight: '300 900',
  display: 'swap',
});
