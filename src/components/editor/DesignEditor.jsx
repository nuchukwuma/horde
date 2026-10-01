'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Puck } from '@puckeditor/core';
// The no-external build: puck.css pulls Inter from rsms.me, which the CSP
// (correctly) refuses. This variant uses the page's own fonts.
import '@puckeditor/core/no-external.css';
import { buildEditorConfig } from './editorConfig';
import ThemePanel from './ThemePanel';
import { contrastProblems } from '@/lib/design/theme';
import { PRESET_THEMES, presetPage } from '@/lib/design/presets';

/**
 * The store editor (dashboard host only).
 *
 * - Layout with Puck: drag blocks from the allow-list, edit fields, undo and
 *   redo (Puck's own history), preview at 360px phone width and desktop.
 * - Brand panel for theme tokens; the preview wears the theme as it changes.
 * - "Save draft" stores the draft (validated server-side). "Publish" makes
 *   the saved draft live. Unsaved changes are flagged, and leaving the page
 *   with any asks first.
 *
 * The editor is never served on a store's own address: it lives under
 * /dashboard on the app host, behind seller sign-in.
 */

const VIEWPORTS = [
  { width: 360, height: 'auto', label: 'Phone' },
  { width: 1280, height: 'auto', label: 'Desktop' },
];

function snapshot(theme, page) {
  return JSON.stringify({ theme, page });
}

export default function DesignEditor({ siteId, storeName, storeUrl, products, initial }) {
  const [theme, setTheme] = useState(initial.draft.theme);
  const [page, setPage] = useState(initial.draft.page);
  const [revision, setRevision] = useState(initial.revision);
  const [published, setPublished] = useState(initial.published);
  const [saved, setSaved] = useState(() => snapshot(initial.draft.theme, initial.draft.page));
  const [puckKey, setPuckKey] = useState(0);
  const [brandOpen, setBrandOpen] = useState(false);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(null);
  const pageRef = useRef(initial.draft.page);

  const config = useMemo(() => buildEditorConfig(siteId), [siteId]);
  const dirty = snapshot(theme, page) !== saved;
  const unreadable = contrastProblems(theme.colors).length > 0;

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const onPuckChange = useCallback((data) => {
    pageRef.current = data;
    setPage(data);
  }, []);

  async function save() {
    setBusy('save');
    setStatus(null);
    try {
      const response = await fetch(`/api/sites/${siteId}/design`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme, page: pageRef.current, revision }),
      });
      const body = await response.json();
      if (!response.ok) {
        const detail = body?.error?.details?.[0];
        throw new Error(detail?.message ? `${detail.message}${detail.field ? ` (${detail.field})` : ''}` : body?.error?.message);
      }
      setRevision(body.data.revision);
      setPublished(body.data.published);
      // What the server stored (sanitised) is now the baseline.
      setTheme(body.data.draft.theme);
      setPage(body.data.draft.page);
      pageRef.current = body.data.draft.page;
      setSaved(snapshot(body.data.draft.theme, body.data.draft.page));
      setStatus({ tone: 'good', text: 'Draft saved. Customers still see the published version.' });
      return body.data.revision;
    } catch (problem) {
      setStatus({ tone: 'error', text: problem.message || 'Could not save.' });
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    const current = dirty || revision === 0 ? await save() : revision;
    if (!current) return;
    setBusy('publish');
    try {
      const response = await fetch(`/api/sites/${siteId}/design/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: current }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? 'Could not publish.');
      setPublished(body.data.published);
      setStatus({ tone: 'good', text: `Published. Your store is updated (version ${body.data.published.version}).` });
    } catch (problem) {
      setStatus({ tone: 'error', text: problem.message });
    } finally {
      setBusy(null);
    }
  }

  function resetToPreset() {
    const preset = theme.preset === 'custom' ? 'fashion' : theme.preset;
    const ok = window.confirm(
      `Reset to the ${preset} preset? Your layout and colours go back to the starting design. Nothing is saved until you press Save draft.`,
    );
    if (!ok) return;
    const fresh = presetPage(preset, storeName);
    setTheme({ ...PRESET_THEMES[preset], logo: theme.logo });
    setPage(fresh);
    pageRef.current = fresh;
    setPuckKey((key) => key + 1); // Puck takes `data` once; remount to load the preset.
  }

  const metadata = useMemo(() => ({ theme, products, store: { name: storeName } }), [theme, products, storeName]);

  return (
    <div className="ed">
      <Puck
        key={puckKey}
        config={config}
        data={page}
        onChange={onPuckChange}
        metadata={metadata}
        viewports={VIEWPORTS}
        headerTitle={`${storeName} — store design`}
        overrides={{
          headerActions: () => (
            <div className="ed-actions">
              <span className={`ed-state${dirty ? ' is-dirty' : ''}`} role="status">
                {dirty ? 'Unsaved changes' : published ? `Live: version ${published.version}` : 'Not published yet'}
              </span>
              <button type="button" className="btn btn--sm" onClick={() => setBrandOpen((open) => !open)}>
                Brand
              </button>
              <button type="button" className="btn btn--sm btn--ghost" onClick={resetToPreset}>
                Reset to preset
              </button>
              <button type="button" className="btn btn--sm" onClick={save} disabled={!dirty || busy || unreadable}>
                {busy === 'save' ? 'Saving…' : 'Save draft'}
              </button>
              <button type="button" className="btn btn--sm btn--primary" onClick={publish} disabled={Boolean(busy) || unreadable}>
                {busy === 'publish' ? 'Publishing…' : 'Publish'}
              </button>
            </div>
          ),
        }}
      />

      {brandOpen ? <ThemePanel theme={theme} onChange={setTheme} siteId={siteId} onClose={() => setBrandOpen(false)} /> : null}

      {status ? (
        <div className={`ed-toast ed-toast--${status.tone}`} role={status.tone === 'error' ? 'alert' : 'status'}>
          {status.text}
          {status.tone === 'good' && published ? (
            <>
              {' '}
              <a href={storeUrl} target="_blank" rel="noopener noreferrer">
                View store
              </a>
            </>
          ) : null}
          <button type="button" className="ed-toast__close" onClick={() => setStatus(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      ) : null}
    </div>
  );
}
