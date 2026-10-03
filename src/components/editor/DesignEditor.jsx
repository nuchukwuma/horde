'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Puck } from '@puckeditor/core';
// The no-external build: puck.css pulls Inter from rsms.me, which the CSP
// (correctly) refuses. This variant uses the page's own fonts.
import '@puckeditor/core/no-external.css';
import { buildEditorConfig } from './editorConfig';
import ThemePanel from './ThemePanel';
import ClickToAddItem from './ClickToAddItem';
import { describeDesignError } from './designErrors';
import { buildSocialLinks } from '@/lib/content/socials';
import { themeContrastProblems, withLook } from '@/lib/design/theme';
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

export default function DesignEditor({ siteId, storeName, storeUrl, products, initial, initialSocials = {} }) {
  const [theme, setTheme] = useState(initial.draft.theme);
  const [page, setPage] = useState(initial.draft.page);
  const [revision, setRevision] = useState(initial.revision);
  const [published, setPublished] = useState(initial.published);
  // Saved to the draft but not yet on the store. Without this the header
  // said "Live: version N" straight after a Save draft, as if it were live.
  const [hasUnpublished, setHasUnpublished] = useState(Boolean(initial.hasUnpublishedChanges));
  const [saved, setSaved] = useState(() => snapshot(initial.draft.theme, initial.draft.page));
  const [puckKey, setPuckKey] = useState(0);
  const [brandOpen, setBrandOpen] = useState(false);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(null);
  const pageRef = useRef(initial.draft.page);

  const config = useMemo(() => buildEditorConfig(siteId), [siteId]);
  const dirty = snapshot(theme, page) !== saved;
  const unreadable = themeContrastProblems(theme).length > 0;
  const [previewDark, setPreviewDark] = useState(false);
  const [socials, setSocials] = useState(initialSocials);

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

  // Puck's preview-zoom <select> ships without a label; screen readers
  // announce it as just "combo box". Name it once it renders.
  useEffect(() => {
    const label = () =>
      document.querySelectorAll('select[class*="ViewportControls-zoomSelect"]:not([aria-label])').forEach((select) => {
        select.setAttribute('aria-label', 'Preview zoom');
      });
    label();
    const observer = new MutationObserver(label);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

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
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const problem = describeDesignError(response.status, body, pageRef.current, config);
        setStatus({ tone: 'error', text: problem.text, reload: problem.reload });
        return null;
      }
      setRevision(body.data.revision);
      setPublished(body.data.published);
      setHasUnpublished(Boolean(body.data.hasUnpublishedChanges));
      // What the server stored (sanitised) is now the baseline.
      setTheme(body.data.draft.theme);
      setPage(body.data.draft.page);
      pageRef.current = body.data.draft.page;
      setSaved(snapshot(body.data.draft.theme, body.data.draft.page));
      setStatus({ tone: 'good', text: 'Draft saved. Customers still see the published version.' });
      return body.data.revision;
    } catch {
      setStatus({ tone: 'error', text: 'Could not reach HordeMart. Check your connection and press Save again.' });
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
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const problem = describeDesignError(response.status, body, pageRef.current, config);
        setStatus({ tone: 'error', text: problem.text, reload: problem.reload });
        return;
      }
      setPublished(body.data.published);
      setHasUnpublished(false);
      setStatus({ tone: 'good', text: `Published. Your store is updated (version ${body.data.published.version}).` });
    } catch {
      setStatus({ tone: 'error', text: 'Could not reach HordeMart. Check your connection and press Publish again.' });
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
    // The look (Adire, Danfo, Credit Alert) and light/dark mode are kept: a
    // reset restores the starting layout and colours within the chosen look.
    // The seller's logo and its settings are theirs, not the preset's.
    const base = {
      ...PRESET_THEMES[preset],
      logo: theme.logo,
      logoDark: theme.logoDark ?? null,
      logoSize: theme.logoSize ?? 'md',
      showName: theme.showName ?? true,
      mode: theme.mode,
    };
    setTheme(theme.style && theme.style !== 'adire' ? { ...withLook(base, theme.style), preset } : base);
    setPage(fresh);
    pageRef.current = fresh;
    setPuckKey((key) => key + 1); // Puck takes `data` once; remount to load the preset.
  }

  // Nothing new since the last publish: publishing again would only bump the
  // version number.
  const nothingToPublish = Boolean(published) && !dirty && !hasUnpublished;
  const stateText = unreadable
    ? 'Colours need fixing (Brand)'
    : dirty
      ? 'Unsaved changes'
      : hasUnpublished
        ? 'Saved, not live yet'
        : published
          ? `Live: version ${published.version}`
          : 'Not published yet';

  const metadata = useMemo(
    () => ({
      theme,
      products,
      previewDark,
      socials: buildSocialLinks(socials),
      store: { name: storeName, look: theme.style ?? 'adire', whatsapp: socials?.whatsapp ?? null },
    }),
    [theme, products, previewDark, socials, storeName],
  );

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
          // Blocks can be clicked to add, not only dragged (ClickToAddItem).
          drawerItem: ClickToAddItem,
          headerActions: () => (
            <div className="ed-actions">
              <a className="btn btn--sm btn--ghost ed-back" href={`/dashboard/${siteId}`}>
                ← Dashboard
              </a>
              <span className={`ed-state${dirty || unreadable ? ' is-dirty' : ''}`} role="status">
                {stateText}
              </span>
              <button type="button" className="btn btn--sm" onClick={() => setBrandOpen((open) => !open)} aria-expanded={brandOpen}>
                Brand
              </button>
              <button type="button" className="btn btn--sm btn--ghost" onClick={resetToPreset} title="Reset to the starting design">
                Reset
              </button>
              <button
                type="button"
                className="btn btn--sm"
                onClick={save}
                disabled={!dirty || Boolean(busy) || unreadable}
                title={unreadable ? 'Fix the colours in Brand first' : undefined}
              >
                {busy === 'save' ? 'Saving…' : 'Save draft'}
              </button>
              <button
                type="button"
                className="btn btn--sm btn--primary"
                onClick={publish}
                disabled={Boolean(busy) || unreadable || nothingToPublish}
                title={unreadable ? 'Fix the colours in Brand first' : nothingToPublish ? 'Your store already shows this design' : undefined}
              >
                {busy === 'publish' ? 'Publishing…' : 'Publish'}
              </button>
            </div>
          ),
        }}
      />

      {brandOpen ? (
        <ThemePanel
          theme={theme}
          onChange={setTheme}
          siteId={siteId}
          onClose={() => setBrandOpen(false)}
          previewDark={previewDark}
          onPreviewDark={setPreviewDark}
          socials={socials}
          onSocialsSaved={setSocials}
        />
      ) : null}

      {status ? (
        <div className={`ed-toast ed-toast--${status.tone}`} role={status.tone === 'error' ? 'alert' : 'status'}>
          {status.text}
          {status.reload ? (
            <>
              {' '}
              <button type="button" className="ed-toast__action" onClick={() => window.location.reload()}>
                Reload
              </button>
            </>
          ) : null}
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
