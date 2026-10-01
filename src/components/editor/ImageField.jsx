'use client';

import { useState } from 'react';
import { uploadImage } from './upload';

/**
 * A Puck custom field for one image: upload, preview, alt text, remove.
 * Empty means the block shows the store's own adire pattern instead.
 */
export default function ImageField({ value, onChange, siteId, label = 'Image' }) {
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
    <div className="ed-image">
      <span className="ed-label">{label}</span>
      {value?.url ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="ed-image__preview" src={value.url} alt="" />
          <input
            className="input ed-input"
            placeholder="Describe the photo (for screen readers)"
            value={value.alt ?? ''}
            maxLength={200}
            onChange={(event) => onChange({ ...value, alt: event.target.value })}
          />
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => onChange(null)}>
            Remove photo
          </button>
        </>
      ) : (
        <p className="ed-hint">No photo: your store&rsquo;s adire pattern is shown instead.</p>
      )}
      <label className="btn btn--sm ed-upload">
        {busy ? 'Uploading…' : value?.url ? 'Replace photo' : 'Upload photo'}
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onFile} disabled={busy} hidden />
      </label>
      <p className="ed-hint">JPG, PNG or WebP, up to 5 MB. Stored at most 1600px wide.</p>
      {error ? (
        <p className="ed-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
