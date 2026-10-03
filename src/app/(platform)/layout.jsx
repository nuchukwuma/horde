// Preloads HordeMart's own font pair (components/platform/platformFonts.js)
// for its own pages: landing, docs, sign-in, the dashboard, admin. Stores
// live outside this group, so they never download fonts their seller did
// not choose.
import '@/components/platform/platformFonts';

export default function PlatformLayout({ children }) {
  return children;
}
