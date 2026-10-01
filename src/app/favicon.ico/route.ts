/**
 * GET /favicon.ico — browsers ask for this on every page that does not name
 * an icon itself (robots.txt, sitemap.xml, a JSON response), and it was a 404
 * in the logs each time. HTML pages declare their own icon — the seller's
 * logo on a store — so this only covers those bare documents.
 */

// A relative Location: middleware skips this path, and request.url here
// carries the server's own hostname, not the one the browser asked for.
export function GET() {
  return new Response(null, {
    status: 308,
    headers: { Location: '/icon.svg', 'Cache-Control': 'public, max-age=86400' },
  });
}
