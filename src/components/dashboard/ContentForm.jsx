'use client';

import { useState } from 'react';
import { uploadImage } from '@/components/editor/upload';
import { htmlToPlainText, plainTextToHtml } from '@/lib/ui/plainText';

/**
 * Write or edit a blog post (`kind="post"`) or a portfolio project
 * (`kind="project"`).
 *
 * The body is typed as plain text with a few conventions (## heading, - list,
 * links) and stored as HTML the server sanitises on save. Photos go straight
 * to Cloudinary into this store's content folder; the server checks every new
 * one belongs there before saving.
 */

const MAX_PROJECT_IMAGES = 12;

/** Field names in server errors, as the form labels them. */
const LABELS = {
  title: 'Title',
  excerpt: 'Summary',
  summary: 'Summary',
  contentHtml: 'Post',
  descriptionHtml: 'Write-up',
  projectUrl: 'Link',
  client: 'Client',
  role: 'Your role',
  tags: 'Tags',
};

function splitTags(value) {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 20);
}

export default function ContentForm({ siteId, kind, item = null, uploadsEnabled, storeUrl }) {
  const isPost = kind === 'post';
  const editing = Boolean(item);
  const base = `/api/sites/${siteId}/${isPost ? 'posts' : 'projects'}`;
  const back = `/dashboard/${siteId}/content${isPost ? '' : '?tab=projects'}`;

  const [title, setTitle] = useState(item?.title ?? '');
  const [summary, setSummary] = useState((isPost ? item?.excerpt : item?.summary) ?? '');
  const [body, setBody] = useState(() => htmlToPlainText((isPost ? item?.contentHtml : item?.descriptionHtml) ?? ''));
  const [images, setImages] = useState(() => (isPost ? (item?.coverImage ? [item.coverImage] : []) : (item?.images ?? [])));
  const [client, setClient] = useState(item?.client ?? '');
  const [role, setRole] = useState(item?.role ?? '');
  const [projectUrl, setProjectUrl] = useState(item?.projectUrl ?? '');
  const [tags, setTags] = useState((item?.tags ?? []).join(', '));
  const [published, setPublished] = useState(item ? item.status === 'published' : true);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const maxImages = isPost ? 1 : MAX_PROJECT_IMAGES;

  async function addPhotos(event) {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    if (files.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      const room = isPost ? 1 : maxImages - images.length;
      for (const file of files.slice(0, Math.max(room, 0))) {
        const uploaded = await uploadImage(siteId, file, 'content');
        setImages((current) => (isPost ? [{ ...uploaded, alt: '' }] : [...current, { ...uploaded, alt: '' }]));
      }
    } catch (problem) {
      setError(problem.message);
    } finally {
      setUploading(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError('Give it a title.');
      return;
    }
    setBusy(true);
    try {
      const html = plainTextToHtml(body, { rich: true });
      const cleanImages = images.map(({ cloudinaryPublicId, url, width, height, alt }) => ({
        cloudinaryPublicId,
        url,
        ...(width ? { width } : {}),
        ...(height ? { height } : {}),
        ...(alt?.trim() ? { alt: alt.trim() } : {}),
      }));
      const payload = isPost
        ? {
            title: title.trim(),
            excerpt: summary.trim(),
            contentHtml: html,
            coverImage: cleanImages[0] ?? null,
            tags: splitTags(tags),
            status: published ? 'published' : 'draft',
          }
        : {
            title: title.trim(),
            summary: summary.trim(),
            descriptionHtml: html,
            images: cleanImages,
            client: client.trim(),
            role: role.trim(),
            projectUrl: projectUrl.trim(),
            tags: splitTags(tags),
            status: published ? 'published' : 'draft',
          };
      const response = await fetch(editing ? `${base}/${item.id}` : base, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 401) throw new Error('You have been signed out. Sign in again in another tab, then save — your writing is still here.');
        const detail = Array.isArray(result?.error?.details) ? result.error.details[0] : null;
        const label = LABELS[String(detail?.field ?? '').split('.')[0]];
        throw new Error(detail?.message ? `${label ? `${label}: ` : ''}${detail.message}` : result?.error?.message ?? 'Could not save.');
      }
      window.location.assign(`${back}${back.includes('?') ? '&' : '?'}saved=${encodeURIComponent(title.trim())}`);
    } catch (problem) {
      setError(problem.message);
      setBusy(false);
    }
  }

  async function archive() {
    if (!window.confirm(`Delete “${item.title}”? It disappears from your site.`)) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`${base}/${item.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error?.message ?? 'Could not delete it.');
      }
      window.location.assign(back);
    } catch (problem) {
      setError(problem.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="product-form" noValidate>
      {error ? (
        <div className="alert alert--error" role="alert">
          <span className="alert__icon" aria-hidden="true">!</span>
          <span>{error}</span>
        </div>
      ) : null}

      <section className="card">
        <div className="field">
          <label className="label" htmlFor="content-title">
            Title
          </label>
          <input
            id="content-title"
            className="input"
            value={title}
            maxLength={250}
            required
            onChange={(event) => setTitle(event.target.value)}
            placeholder={isPost ? 'e.g. How adire is made' : 'e.g. Lagos Fashion Week capsule'}
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="content-summary">
            {isPost ? 'Short summary' : 'One-line summary'} <span className="label__optional">optional</span>
          </label>
          <input
            id="content-summary"
            className="input"
            value={summary}
            maxLength={500}
            onChange={(event) => setSummary(event.target.value)}
          />
          <p className="hint">Shown in lists and in search results.</p>
        </div>
        <div className="field">
          <label className="label" htmlFor="content-body">
            {isPost ? 'Post' : 'Write-up'}
          </label>
          <textarea
            id="content-body"
            className="textarea content-form__body"
            value={body}
            maxLength={90_000}
            rows={14}
            onChange={(event) => setBody(event.target.value)}
          />
          <p className="hint">
            Leave an empty line between paragraphs. Start a line with <code>## </code> for a heading, or <code>- </code> for a
            bullet point. Web addresses become links.
          </p>
        </div>
      </section>

      <section className="card">
        <h2 className="product-form__title">{isPost ? 'Cover photo' : 'Photos'}</h2>
        {uploadsEnabled ? (
          <>
            {images.length > 0 ? (
              <ul className="product-photos">
                {images.map((image, index) => (
                  <li key={image.cloudinaryPublicId ?? image.url} className="product-photo">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={image.url} alt="" className="product-photo__img" />
                    <input
                      className="input product-photo__alt"
                      aria-label={`Describe photo ${index + 1}`}
                      placeholder="Describe it (for screen readers)"
                      value={image.alt ?? ''}
                      maxLength={300}
                      onChange={(event) =>
                        setImages((current) => current.map((entry, i) => (i === index ? { ...entry, alt: event.target.value } : entry)))
                      }
                    />
                    <div className="product-photo__actions">
                      <button
                        type="button"
                        className="btn btn--sm btn--quiet"
                        onClick={() => setImages((current) => current.filter((_, i) => i !== index))}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hint" style={{ marginTop: 0 }}>
                No photo yet.
              </p>
            )}
            {isPost || images.length < maxImages ? (
              <label className="btn btn--sm product-form__upload">
                {uploading ? 'Uploading…' : isPost ? (images.length ? 'Replace photo' : 'Add a cover photo') : 'Add photos'}
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple={!isPost} onChange={addPhotos} disabled={uploading} hidden />
              </label>
            ) : null}
          </>
        ) : (
          <p className="hint" style={{ marginTop: 0 }}>
            Photo uploads are not switched on for this server yet.
          </p>
        )}
      </section>

      {!isPost ? (
        <section className="card">
          <h2 className="product-form__title">Details</h2>
          <div className="product-form__row">
            <div className="field">
              <label className="label" htmlFor="content-client">
                Client <span className="label__optional">optional</span>
              </label>
              <input id="content-client" className="input" value={client} maxLength={200} onChange={(event) => setClient(event.target.value)} />
            </div>
            <div className="field">
              <label className="label" htmlFor="content-role">
                Your role <span className="label__optional">optional</span>
              </label>
              <input id="content-role" className="input" value={role} maxLength={200} onChange={(event) => setRole(event.target.value)} />
            </div>
          </div>
          <div className="field" style={{ marginTop: 16 }}>
            <label className="label" htmlFor="content-url">
              Link to the finished work <span className="label__optional">optional</span>
            </label>
            <input
              id="content-url"
              className="input"
              type="url"
              inputMode="url"
              placeholder="https://"
              value={projectUrl}
              maxLength={2000}
              onChange={(event) => setProjectUrl(event.target.value)}
            />
          </div>
        </section>
      ) : null}

      <section className="card">
        <div className="field">
          <label className="label" htmlFor="content-tags">
            Tags <span className="label__optional">optional</span>
          </label>
          <input
            id="content-tags"
            className="input"
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="adire, behind the scenes"
          />
          <p className="hint">Separate tags with commas.</p>
        </div>
        <label className="checkbox" style={{ marginTop: 16 }}>
          <input type="checkbox" checked={published} onChange={(event) => setPublished(event.target.checked)} />
          <span>
            <strong>Publish on my site</strong>
            <br />
            <span className="secondary">Untick to keep it as a draft that only you can see here.</span>
          </span>
        </label>
      </section>

      <div className="product-form__actions">
        <button type="submit" className="btn btn--primary" disabled={busy || uploading}>
          {busy ? 'Saving…' : editing ? 'Save changes' : published ? 'Publish' : 'Save draft'}
        </button>
        <a className="btn btn--quiet" href={back}>
          Cancel
        </a>
        {editing && item.status === 'published' && storeUrl ? (
          <a className="btn btn--quiet" href={`${storeUrl}/${isPost ? 'blog' : 'work'}/${item.slug}`} target="_blank" rel="noopener noreferrer">
            View ↗
          </a>
        ) : null}
        {editing ? (
          <button type="button" className="btn btn--quiet product-form__delete" onClick={archive} disabled={busy}>
            Delete
          </button>
        ) : null}
      </div>
    </form>
  );
}
