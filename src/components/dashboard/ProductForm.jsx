'use client';

import { useState } from 'react';
import { uploadImage } from '@/components/editor/upload';
import { htmlToPlainText, plainTextToHtml } from '@/lib/ui/plainText';

/**
 * Add or edit one product.
 *
 * The price goes up as the naira string the seller typed ("2500.50"); the
 * server converts it to kobo once and enforces the ₦50 minimum and the "was"
 * price rule. Photos go straight from the browser to Cloudinary into this
 * store's folder, and the server checks each one belongs there before saving.
 */

const PRICE = /^\d{1,9}(\.\d{1,2})?$/;

function cleanPrice(value) {
  return value.replace(/[₦,\s]/g, '');
}

export default function ProductForm({ siteId, product = null, maxImages, uploadsEnabled }) {
  const editing = Boolean(product);
  const [title, setTitle] = useState(product?.title ?? '');
  const [description, setDescription] = useState(() => htmlToPlainText(product?.descriptionHtml ?? ''));
  const [price, setPrice] = useState(product?.priceNaira ?? '');
  const [compareAt, setCompareAt] = useState(product?.compareAtPriceNaira ?? '');
  const [sku, setSku] = useState(product?.sku ?? '');
  const [visible, setVisible] = useState(product ? product.status === 'active' : true);
  const [track, setTrack] = useState(product?.trackInventory ?? false);
  const [quantity, setQuantity] = useState(String(product?.quantity ?? 0));
  const [images, setImages] = useState(product?.images ?? []);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  async function addPhotos(event) {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    if (files.length === 0) return;
    setError(null);
    const room = maxImages - images.length;
    if (room <= 0) {
      setError(`Your plan allows ${maxImages} photos per product. Remove one to add another.`);
      return;
    }
    setUploading(true);
    try {
      for (const file of files.slice(0, room)) {
        const uploaded = await uploadImage(siteId, file, 'products');
        setImages((current) => [...current, { ...uploaded, alt: '' }]);
      }
      if (files.length > room) setError(`Only ${room} more photo${room === 1 ? '' : 's'} fit on your plan; the rest were skipped.`);
    } catch (problem) {
      setError(problem.message);
    } finally {
      setUploading(false);
    }
  }

  function moveFirst(index) {
    setImages((current) => [current[index], ...current.filter((_, i) => i !== index)]);
  }

  function validate() {
    const problems = {};
    if (!title.trim()) problems.title = 'Give the product a name.';
    if (!PRICE.test(cleanPrice(price))) problems.priceNaira = 'Enter a price like 2500 or 2500.50.';
    if (compareAt && !PRICE.test(cleanPrice(compareAt))) problems.compareAtPriceNaira = 'Enter an amount like 3000, or leave it empty.';
    if (track && !/^\d{1,7}$/.test(quantity)) problems.quantity = 'Enter how many you have, as a whole number.';
    setFieldErrors(problems);
    return Object.keys(problems).length === 0;
  }

  async function submit(event) {
    event.preventDefault();
    setError(null);
    if (!validate()) return;
    setBusy(true);
    try {
      const body = {
        title: title.trim(),
        descriptionHtml: plainTextToHtml(description),
        priceNaira: cleanPrice(price),
        compareAtPriceNaira: compareAt ? cleanPrice(compareAt) : null,
        sku: sku.trim(),
        status: visible ? 'active' : 'draft',
        trackInventory: track,
        quantity: track ? Number(quantity) : 0,
        images: images.map(({ cloudinaryPublicId, url, width, height, alt }) => ({
          cloudinaryPublicId,
          url,
          width,
          height,
          alt: alt?.trim() || undefined,
        })),
      };
      const response = await fetch(
        editing ? `/api/sites/${siteId}/products/${product.id}` : `/api/sites/${siteId}/products`,
        {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 401) throw new Error('You have been signed out. Sign in again in another tab, then save — your changes are still here.');
        const details = result?.error?.details;
        const first = Array.isArray(details) ? details[0] : details;
        const field = first?.field;
        if (field) setFieldErrors({ [field]: first.message ?? result?.error?.message });
        throw new Error(first?.message ?? result?.error?.message ?? 'Could not save the product.');
      }
      window.location.assign(`/dashboard/${siteId}/products?saved=${encodeURIComponent(result.data.title)}`);
    } catch (problem) {
      setError(problem.message);
      setBusy(false);
    }
  }

  async function archive() {
    if (!window.confirm(`Delete “${product.title}”? It disappears from your store. Past orders keep their details.`)) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/sites/${siteId}/products/${product.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error?.message ?? 'Could not delete the product.');
      }
      window.location.assign(`/dashboard/${siteId}/products`);
    } catch (problem) {
      setError(problem.message);
      setBusy(false);
    }
  }

  const invalid = (key) => (fieldErrors[key] ? { 'aria-invalid': 'true', 'aria-describedby': `${key}-error` } : {});
  const fieldError = (key) =>
    fieldErrors[key] ? (
      <p id={`${key}-error`} className="hint hint--error">
        {fieldErrors[key]}
      </p>
    ) : null;

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
          <label className="label" htmlFor="product-title">
            Name
          </label>
          <input
            id="product-title"
            className="input"
            value={title}
            maxLength={200}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Adire wrap dress"
            required
            {...invalid('title')}
          />
          {fieldError('title')}
        </div>

        <div className="field">
          <label className="label" htmlFor="product-description">
            Description <span className="label__optional">optional</span>
          </label>
          <textarea
            id="product-description"
            className="textarea"
            value={description}
            maxLength={20_000}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Fabric, sizes, how it fits, how long delivery takes…"
            rows={6}
          />
          <p className="hint">Leave an empty line between paragraphs.</p>
        </div>
      </section>

      <section className="card">
        <h2 className="product-form__title">Photos</h2>
        {uploadsEnabled ? (
          <>
            {images.length > 0 ? (
              <ul className="product-photos">
                {images.map((image, index) => (
                  <li key={image.cloudinaryPublicId} className="product-photo">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={image.url} alt="" className="product-photo__img" />
                    {index === 0 ? <span className="badge badge--accent product-photo__main">Main photo</span> : null}
                    <input
                      className="input product-photo__alt"
                      aria-label={`Describe photo ${index + 1}`}
                      placeholder="Describe it (for screen readers)"
                      value={image.alt ?? ''}
                      maxLength={300}
                      onChange={(event) =>
                        setImages((current) => current.map((item, i) => (i === index ? { ...item, alt: event.target.value } : item)))
                      }
                    />
                    <div className="product-photo__actions">
                      {index > 0 ? (
                        <button type="button" className="btn btn--sm btn--quiet" onClick={() => moveFirst(index)}>
                          Make main
                        </button>
                      ) : null}
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
                No photos yet: your store shows a drawing in its own colours until you add one.
              </p>
            )}
            {images.length < maxImages ? (
              <label className="btn btn--sm product-form__upload">
                {uploading ? 'Uploading…' : images.length ? 'Add more photos' : 'Add photos'}
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={addPhotos} disabled={uploading} hidden />
              </label>
            ) : null}
            <p className="hint">
              Up to {maxImages} photos on your plan. JPG, PNG or WebP. The first photo is the one shoppers see in your shop.
            </p>
          </>
        ) : (
          <p className="hint" style={{ marginTop: 0 }}>
            Photo uploads are not switched on for this server yet. Your store shows a drawing in its own colours instead.
          </p>
        )}
      </section>

      <section className="card">
        <h2 className="product-form__title">Price</h2>
        <div className="product-form__row">
          <div className="field">
            <label className="label" htmlFor="product-price">
              Price
            </label>
            <div className="input-group">
              <span className="input-group__prefix">₦</span>
              <input
                id="product-price"
                className="input"
                inputMode="decimal"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                placeholder="2500"
                required
                {...invalid('priceNaira')}
              />
            </div>
            {fieldError('priceNaira')}
          </div>
          <div className="field">
            <label className="label" htmlFor="product-compare">
              Was <span className="label__optional">optional</span>
            </label>
            <div className="input-group">
              <span className="input-group__prefix">₦</span>
              <input
                id="product-compare"
                className="input"
                inputMode="decimal"
                value={compareAt}
                onChange={(event) => setCompareAt(event.target.value)}
                placeholder="3000"
                {...invalid('compareAtPriceNaira')}
              />
            </div>
            {fieldError('compareAtPriceNaira')}
          </div>
        </div>
        <p className="hint">
          Shoppers pay this price. Fill in “Was” only for a real reduction — it must be higher than the price.
        </p>
      </section>

      <section className="card">
        <h2 className="product-form__title">Stock</h2>
        <label className="checkbox">
          <input type="checkbox" checked={track} onChange={(event) => setTrack(event.target.checked)} />
          <span>Count my stock, and stop selling when it runs out</span>
        </label>
        {track ? (
          <div className="field" style={{ marginTop: 14, maxWidth: 220 }}>
            <label className="label" htmlFor="product-quantity">
              How many you have
            </label>
            <input
              id="product-quantity"
              className="input"
              inputMode="numeric"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value.replace(/\D/g, ''))}
              {...invalid('quantity')}
            />
            {fieldError('quantity')}
          </div>
        ) : null}
        <div className="field" style={{ marginTop: 16, maxWidth: 320 }}>
          <label className="label" htmlFor="product-sku">
            Item code (SKU) <span className="label__optional">optional</span>
          </label>
          <input id="product-sku" className="input" value={sku} maxLength={64} onChange={(event) => setSku(event.target.value)} />
        </div>
      </section>

      <section className="card">
        <label className="checkbox">
          <input type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} />
          <span>
            <strong>Show in my store</strong>
            <br />
            <span className="secondary">Untick to keep it as a draft that only you can see here.</span>
          </span>
        </label>
      </section>

      <div className="product-form__actions">
        <button type="submit" className="btn btn--primary" disabled={busy || uploading}>
          {busy ? 'Saving…' : editing ? 'Save changes' : 'Add product'}
        </button>
        <a className="btn btn--quiet" href={`/dashboard/${siteId}/products`}>
          Cancel
        </a>
        {editing ? (
          <button type="button" className="btn btn--quiet product-form__delete" onClick={archive} disabled={busy}>
            Delete product
          </button>
        ) : null}
      </div>
    </form>
  );
}
