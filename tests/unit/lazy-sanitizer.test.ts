/**
 * The HTML sanitiser must not load until something is actually sanitised.
 *
 * isomorphic-dompurify boots jsdom on the server (~0.5–1.5 s, tens of MB).
 * Storefront pages import products.ts and the design service only to READ,
 * so a top-level import of the sanitiser made every storefront cold start —
 * and every dev-server route compile — pay for a browser emulator nobody
 * used. Run in a child process so this file's own imports cannot have loaded
 * jsdom already.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/** Run a TypeScript snippet with tsx (as the repo's scripts run) and parse its last line. */
function probe(source: string): Record<string, boolean> {
  const dir = mkdtempSync(path.join(tmpdir(), 'hm-lazy-'));
  const file = path.join(dir, 'probe.ts');
  writeFileSync(file, source);
  try {
    const out = execFileSync(process.execPath, ['--import', 'tsx', file], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, NODE_ENV: 'test' },
    });
    return JSON.parse(out.trim().split('\n').pop() ?? '{}');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const root = process.cwd();

describe('sanitiser loads lazily', () => {
  it('importing read paths does not load jsdom; the first sanitise does', () => {
    const result = probe(`
      import { createRequire } from 'node:module';
      const jsdomLoaded = () => Object.keys(createRequire(import.meta.url).cache).some((key) => /[\\\\/]jsdom[\\\\/]/.test(key));
      async function main() {
        await import(${JSON.stringify(path.join(root, 'src/lib/products/products.ts'))});
        await import(${JSON.stringify(path.join(root, 'src/lib/design/published.ts'))});
        const sanitize = await import(${JSON.stringify(path.join(root, 'src/lib/security/sanitizeHtml.ts'))});
        const afterImport = jsdomLoaded();
        const clean = sanitize.sanitizeRichText('<img src="data:text/html;base64,AAAA"><b onclick="x">ok</b>');
        const afterUse = jsdomLoaded();
        console.log(JSON.stringify({ afterImport, afterUse, hookApplied: clean === '<img><b>ok</b>' }));
      }
      main();
    `);

    expect(result.afterImport).toBe(false);
    expect(result.afterUse).toBe(true);
    // The data: URI hook is still installed on the lazily created instance.
    expect(result.hookApplied).toBe(true);
  }, 30_000);
});
