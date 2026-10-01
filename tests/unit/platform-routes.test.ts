/**
 * Platform hosts: which page lives where, and what the apex and app host tell
 * crawlers. Found in the launch review — "www." was a 404, and signing in on
 * the apex left the seller with a session the dashboard host could not see.
 */

import { describe, expect, it } from 'vitest';
import { platformRedirect } from '../../src/lib/tenant/platformRoutes';
import { buildPlatformRobots, buildPlatformSitemap } from '../../src/lib/seo/sitemap';
import { AuthenticationError } from '../../src/lib/errors';

const hosts = { rootDomain: 'hordemart.com', appHost: 'app.hordemart.com' };

describe('platformRedirect', () => {
  it('sends www to the apex, keeping the path', () => {
    expect(platformRedirect('www.hordemart.com', '/docs', hosts)).toEqual({ host: 'hordemart.com', pathname: '/docs' });
    expect(platformRedirect('WWW.HordeMart.com.', '/', hosts)).toEqual({ host: 'hordemart.com', pathname: '/' });
  });

  it.each(['/login', '/signup', '/verify-email', '/dashboard', '/dashboard/abc/design', '/LOGIN'])(
    'moves %s from the apex to the app host',
    (path) => {
      expect(platformRedirect('hordemart.com', path, hosts)).toEqual({ host: 'app.hordemart.com', pathname: path });
    },
  );

  it('leaves marketing pages on the apex', () => {
    expect(platformRedirect('hordemart.com', '/', hosts)).toBeNull();
    expect(platformRedirect('hordemart.com', '/docs', hosts)).toBeNull();
    // A prefix match is not a path match.
    expect(platformRedirect('hordemart.com', '/login-help', hosts)).toBeNull();
  });

  it('sends the bare app host to the dashboard and leaves its other pages alone', () => {
    expect(platformRedirect('app.hordemart.com', '/', hosts)).toEqual({ host: 'app.hordemart.com', pathname: '/dashboard' });
    expect(platformRedirect('app.hordemart.com', '/login', hosts)).toBeNull();
  });

  it('never redirects a store host', () => {
    expect(platformRedirect('ade.hordemart.com', '/login', hosts)).toBeNull();
    expect(platformRedirect('ade.hordemart.com', '/', hosts)).toBeNull();
    expect(platformRedirect('shop.example.ng', '/dashboard', hosts)).toBeNull();
    expect(platformRedirect(null, '/', hosts)).toBeNull();
  });

  it('ignores ports when matching but keeps them in the target', () => {
    const dev = { rootDomain: 'hordemart.local:3000', appHost: 'app.hordemart.local:3000' };
    expect(platformRedirect('hordemart.local:3000', '/login', dev)).toEqual({ host: 'app.hordemart.local:3000', pathname: '/login' });
    expect(platformRedirect('www.hordemart.local:3000', '/', dev)).toEqual({ host: 'hordemart.local:3000', pathname: '/' });
  });
});

describe('platform robots and sitemap', () => {
  it('keeps the app host out of search results', () => {
    expect(buildPlatformRobots('app', 'https://hordemart.com')).toBe('User-agent: *\nDisallow: /\n');
  });

  it('lets the apex be indexed and points at its sitemap', () => {
    const robots = buildPlatformRobots('apex', 'https://hordemart.com');
    expect(robots).toContain('Allow: /');
    expect(robots).toContain('Disallow: /api/');
    expect(robots).toContain('Sitemap: https://hordemart.com/sitemap.xml');
  });

  it('lists the marketing pages only', () => {
    const xml = buildPlatformSitemap(undefined, 'https://hordemart.com');
    expect(xml).toContain('<loc>https://hordemart.com/</loc>');
    expect(xml).toContain('<loc>https://hordemart.com/docs</loc>');
    expect(xml).not.toMatch(/login|signup|dashboard/);
  });
});

describe('AuthenticationError', () => {
  it('stays generic by default', () => {
    expect(new AuthenticationError().publicMessage).toBe('Authentication required');
    expect(new AuthenticationError('session expired').publicMessage).toBe('Authentication required');
  });

  it('carries a sign-in message when given one, without exposing the internal one', () => {
    const error = new AuthenticationError('Invalid email or password', 'Those details don’t match.');
    expect(error.statusCode).toBe(401);
    expect(error.publicMessage).toBe('Those details don’t match.');
  });
});
