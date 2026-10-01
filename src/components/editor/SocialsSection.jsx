'use client';

import { useState } from 'react';
import { SOCIAL_PLATFORMS } from '@/lib/content/socials';
import SocialIcon from '@/components/shop/SocialIcon';

/**
 * The store's social media accounts, in the Brand panel.
 *
 * These are store settings, not page design: they appear in the footer of
 * every page and in any "Social media links" or WhatsApp block, so they save
 * straight to the store (PATCH /api/sites/:id/settings) with their own button
 * rather than waiting for Publish. The server validates every value
 * (lib/content/socials.ts): handles only, a full number for WhatsApp, https
 * for a website. A pasted profile link is trimmed to its handle there.
 */

const ORDER = ['whatsapp', 'instagram', 'tiktok', 'facebook', 'x', 'youtube', 'linkedin', 'website'];

export default function SocialsSection({ siteId, socials, onSaved }) {
  const [values, setValues] = useState(() => Object.fromEntries(ORDER.map((key) => [key, socials?.[key] ?? ''])));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);

  const changed = ORDER.some((key) => (values[key] ?? '') !== (socials?.[key] ?? ''));

  async function save() {
    setBusy(true);
    setStatus(null);
    try {
      const body = Object.fromEntries(
        ORDER.map((key) => [key, values[key].trim()]).filter(([, value]) => value !== ''),
      );
      const response = await fetch(`/api/sites/${siteId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ socials: body }),
      });
      const result = await response.json();
      if (!response.ok) {
        const detail = result?.error?.details?.[0];
        // Validation errors name the field: "whatsapp", "instagram", …
        const platform = SOCIAL_PLATFORMS[String(detail?.field ?? '').split('.').pop()]?.label;
        throw new Error(
          detail?.message ? `${platform ? `${platform}: ` : ''}${detail.message}` : result?.error?.message ?? 'Could not save.',
        );
      }
      const saved = result.data.socials ?? {};
      setValues(Object.fromEntries(ORDER.map((key) => [key, saved[key] ?? ''])));
      onSaved?.(saved);
      setStatus({ tone: 'good', text: 'Saved. Your links are live on your store now.' });
    } catch (problem) {
      setStatus({ tone: 'error', text: problem.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ed-group">
      <h3 className="ed-group__title">Social media</h3>
      <p className="ed-hint" style={{ marginTop: 0 }}>
        Shown at the bottom of every page, and in any “Social media links” block. Leave a box empty to hide it.
      </p>
      <div className="ed-socials">
        {ORDER.map((key) => {
          const spec = SOCIAL_PLATFORMS[key];
          const id = `social-${key}`;
          return (
            <div key={key} className="ed-social">
              <label htmlFor={id} className="ed-social__label">
                <SocialIcon platform={key} size={18} />
                {spec.label}
              </label>
              <input
                id={id}
                className="input ed-input"
                inputMode={key === 'whatsapp' ? 'tel' : key === 'website' ? 'url' : 'text'}
                autoComplete="off"
                spellCheck={false}
                placeholder={key === 'whatsapp' ? '2348012345678' : key === 'website' ? 'https://yourshop.com' : spec.hint}
                value={values[key]}
                maxLength={key === 'website' ? 2048 : 80}
                onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))}
              />
            </div>
          );
        })}
      </div>
      <p className="ed-hint">
        WhatsApp: your number with 234 in front, no + or spaces. Others: your handle, or paste your profile link.
      </p>
      <button type="button" className="btn btn--sm btn--primary" onClick={save} disabled={busy || !changed}>
        {busy ? 'Saving…' : 'Save social media'}
      </button>
      {status ? (
        <p className={status.tone === 'error' ? 'ed-error' : 'ed-ok'} role={status.tone === 'error' ? 'alert' : 'status'}>
          {status.text}
        </p>
      ) : null}
    </section>
  );
}
