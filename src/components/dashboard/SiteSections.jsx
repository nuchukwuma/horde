'use client';

import { useState } from 'react';

/**
 * Overview card: which sections the public site has. The shop is always on
 * here; Blog and Portfolio are the owner's switches. Off hides the section
 * without deleting anything.
 */

const SECTIONS = [
  ['blog', 'Blog', 'Posts about your work, news and how-tos.'],
  ['portfolio', 'Portfolio', 'Projects you’ve done, with photos.'],
];

export default function SiteSections({ siteId, initial }) {
  const [modules, setModules] = useState(initial);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  async function toggle(key, on) {
    const before = modules;
    setModules({ ...modules, [key]: on }); // tick at once; undone below if it fails
    setBusy(key);
    setError(null);
    try {
      const response = await fetch(`/api/sites/${siteId}/modules`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: on }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error?.message ?? 'Could not change that. Try again.');
      setModules(result.data.modules);
      // The menu above shows "Blog & work" only when one is on.
      window.location.reload();
    } catch (problem) {
      setModules(before);
      setError(problem.message);
      setBusy(null);
    }
  }

  return (
    <section className="card" style={{ marginBottom: 16 }} aria-labelledby="sections-title">
      <h2 id="sections-title" style={{ fontSize: 17, margin: '0 0 4px' }}>
        Sections of your site
      </h2>
      <p className="secondary" style={{ margin: '0 0 12px', fontSize: 14 }}>
        Your shop is always on. Add a blog or a portfolio alongside it — switching one off hides it, nothing is deleted.
      </p>
      {error ? (
        <div className="alert alert--error" role="alert" style={{ marginBottom: 12 }}>
          <span className="alert__icon" aria-hidden="true">!</span>
          <span>{error}</span>
        </div>
      ) : null}
      {SECTIONS.map(([key, label, hint]) => (
        <label key={key} className="checkbox" style={{ marginBottom: 10 }}>
          <input
            type="checkbox"
            checked={Boolean(modules?.[key])}
            disabled={busy !== null}
            onChange={(event) => toggle(key, event.target.checked)}
          />
          <span>
            <strong>{label}</strong>
            {busy === key ? ' — saving…' : ''}
            <br />
            <span className="secondary">{hint}</span>
          </span>
        </label>
      ))}
    </section>
  );
}
