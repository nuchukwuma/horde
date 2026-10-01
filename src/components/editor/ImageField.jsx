'use client';

import { useState } from 'react';
import { uploadImage } from './upload';
import { TIERS } from '@/config/plans';

const mb = (bytes) => `${Math.round(bytes / 1024 / 1024)} MB`;

/**
 * One image: upload, preview, alt text, remove. Used for block photos (a
 * Puck custom field) and for the store's logos.
 *
 * `noun` names the thing on the buttons ("Upload logo"); `emptyText` says
 * what shows when nothing is uploaded; `withAlt` is off for logos, whose
 * meaning is carried by the store name next to them (see StoreBrand);
 * `onDark` previews on a dark background (for a dark-mode logo). A null
 * `label` omits the label when a heading already names the field.
 */
export default function ImageField({
  value,
  onChange,
  siteId,
  label = 'Image',
  noun = 'photo',
  emptyText = 'No photo: a picture in your store’s look is shown instead.',
  hint = null,
  withAlt = true,
  onDark = false,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function onFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onChange({ ...(await uploadImage(siteId, file, 'design')), alt: value?.alt ?? '' });
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`ed-image ed-image--${noun}${onDark ? ' ed-image--on-dark' : ''}`}>
      {label ? <span className="ed-label">{label}</span> : null}
      {value?.url ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="ed-image__preview" src={value.url} alt="" />
          {withAlt ? (
            <input
              className="input ed-input"
              placeholder={`Describe the ${noun} (for screen readers)`}
              value={value.alt ?? ''}
              maxLength={200}
              onChange={(event) => onChange({ ...value, alt: event.target.value })}
            />
          ) : null}
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => onChange(null)}>
            Remove {noun}
          </button>
        </>
      ) : (
        <p className="ed-hint">{emptyText}</p>
      )}
      <label className="btn btn--sm ed-upload">
        {busy ? 'Uploading…' : value?.url ? `Replace ${noun}` : `Upload ${noun}`}
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onFile} disabled={busy} hidden />
      </label>
      {hint ? <p className="ed-hint">{hint}</p> : null}
      <p className="ed-hint">JPG, PNG or WebP. Up to {mb(TIERS.free.limits.maxUploadBytes)} on Free, {mb(TIERS.pro.limits.maxUploadBytes)} on Premium. Stored at most 1600px wide to save space.</p>
      {error ? (
        <p className="ed-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
