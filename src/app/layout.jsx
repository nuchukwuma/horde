import './globals.css';

export const metadata = {
  title: 'HordeMart',
  description: 'Stores, portfolios and blogs for Nigerian sellers.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  // Never disable zoom. Pinch-zoom is an accessibility feature, not a layout bug.
  maximumScale: 5,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en-NG">
      <body>{children}</body>
    </html>
  );
}
