'use client';

import { useEffect, useState } from 'react';
import PasswordInput from '@/components/auth/PasswordInput';

/**
 * Connect or change the bank account that receives this store's money.
 *
 * Three steps, like a bank transfer: type the details and your password →
 * see the name the bank holds for that account → confirm. The password is
 * checked first (POST /api/auth/step-up) because the server refuses payout
 * changes without a password confirmed in the last ten minutes; the server
 * then resolves the account again on save rather than trusting this page.
 *
 * The account number lives in this component's memory only. It is sent over
 * HTTPS twice (verify, save) and never stored by the server — only its last
 * four digits are.
 */

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => null);
  return { response, result };
}

function messageFrom(result, fallback) {
  const detail = Array.isArray(result?.error?.details) ? result.error.details[0]?.message : null;
  return detail ?? result?.error?.message ?? fallback;
}

export default function PayoutForm({ siteId, current, defaultBusinessName }) {
  const [banks, setBanks] = useState(null);
  const [banksError, setBanksError] = useState(null);
  const [businessName, setBusinessName] = useState(current?.businessName ?? defaultBusinessName ?? '');
  const [bankCode, setBankCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState('form');
  const [resolved, setResolved] = useState(null);
  const [saved, setSaved] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/banks');
        const result = await response.json().catch(() => null);
        if (!response.ok) throw new Error(result?.error?.message ?? 'Could not load the list of banks.');
        if (!cancelled) setBanks([...result.data].sort((a, b) => a.name.localeCompare(b.name)));
      } catch (problem) {
        if (!cancelled) setBanksError(problem.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const bankName = (code) => banks?.find((bank) => bank.code === code)?.name ?? null;

  async function check(event) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const confirm = await postJson('/api/auth/step-up', { password });
      if (!confirm.response.ok) throw new Error(messageFrom(confirm.result, 'Could not confirm your password.'));

      const verify = await postJson(`/api/sites/${siteId}/payout/verify`, { bankCode, accountNumber });
      if (!verify.response.ok) throw new Error(messageFrom(verify.result, 'Could not check that account.'));

      setResolved(verify.result.data);
      setPassword('');
      setStep('confirm');
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setError(null);
    setBusy(true);
    try {
      const { response, result } = await postJson(`/api/sites/${siteId}/payout`, {
        businessName: businessName.trim(),
        bankCode,
        accountNumber,
      });
      if (!response.ok) {
        if (result?.error?.code === 'step_up_required') {
          // More than ten minutes passed on the confirm screen.
          setStep('form');
          throw new Error('For your security, enter your password again to finish.');
        }
        throw new Error(messageFrom(result, 'Could not save your bank details.'));
      }
      setSaved(result.data);
      setAccountNumber('');
      setStep('done');
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  }

  const errorBox = error ? (
    <div className="alert alert--error" role="alert">
      <span className="alert__icon" aria-hidden="true">!</span>
      <span>{error}</span>
    </div>
  ) : null;

  if (step === 'done') {
    const from = saved?.checkoutEnabledFrom ? new Date(saved.checkoutEnabledFrom) : null;
    return (
      <div className="alert alert--good" role="status">
        <span className="alert__icon" aria-hidden="true">✓</span>
        <span>
          Connected. Payments for your store now settle to <strong>{saved.accountName}</strong>, account ending{' '}
          <strong>{saved.accountNumberLast4}</strong>.{' '}
          {from && from > new Date()
            ? `New stores start taking payments on ${from.toLocaleDateString('en-NG', { day: 'numeric', month: 'long' })}.`
            : 'Your store can take payments now.'}{' '}
          We have emailed you a note of this change. <a href={`/dashboard/${siteId}`}>Back to overview</a>
        </span>
      </div>
    );
  }

  if (step === 'confirm') {
    return (
      <div className="card payout-confirm">
        {errorBox}
        <p className="secondary" style={{ margin: 0 }}>
          The bank says this account belongs to:
        </p>
        <p className="payout-confirm__name">{resolved.accountName}</p>
        <p className="secondary" style={{ marginTop: 0 }}>
          {bankName(bankCode) ?? 'Your bank'} · account ending {resolved.accountNumberLast4}
        </p>
        <p style={{ fontSize: 14 }}>
          Is this the right account? Money from your sales will be paid into it by Paystack.
        </p>
        <div className="product-form__actions">
          <button type="button" className="btn btn--primary" onClick={save} disabled={busy}>
            {busy ? 'Connecting…' : 'Yes, use this account'}
          </button>
          <button
            type="button"
            className="btn btn--quiet"
            onClick={() => {
              setStep('form');
              setResolved(null);
              setError(null);
            }}
            disabled={busy}
          >
            No, change details
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="card payout-form" onSubmit={check}>
      {errorBox}
      {banksError ? (
        <div className="alert alert--warning" role="alert">
          <span className="alert__icon" aria-hidden="true">!</span>
          <span>{banksError}</span>
        </div>
      ) : null}

      <div className="field">
        <label className="label" htmlFor="payout-business">
          Business name
        </label>
        <input
          id="payout-business"
          className="input"
          value={businessName}
          minLength={2}
          maxLength={200}
          onChange={(event) => setBusinessName(event.target.value)}
          required
        />
        <p className="hint">How your business is known. It can differ from the name on the account.</p>
      </div>

      <div className="field">
        <label className="label" htmlFor="payout-bank">
          Bank
        </label>
        <select
          id="payout-bank"
          className="select"
          value={bankCode}
          onChange={(event) => setBankCode(event.target.value)}
          required
          disabled={!banks}
        >
          <option value="">{banks ? 'Choose your bank' : banksError ? 'Banks unavailable' : 'Loading banks…'}</option>
          {(banks ?? []).map((bank) => (
            <option key={`${bank.code}-${bank.slug}`} value={bank.code}>
              {bank.name}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label className="label" htmlFor="payout-account">
          Account number
        </label>
        <input
          id="payout-account"
          className="input"
          inputMode="numeric"
          autoComplete="off"
          value={accountNumber}
          onChange={(event) => setAccountNumber(event.target.value.replace(/\D/g, '').slice(0, 10))}
          pattern="\d{10}"
          title="10 digits"
          placeholder="10 digits (NUBAN)"
          required
        />
      </div>

      <div className="field">
        <label className="label" htmlFor="payout-password">
          Your HordeMart password
        </label>
        <PasswordInput
          id="payout-password"
          className="input"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <p className="hint">We ask again because this decides where your money goes.</p>
      </div>

      <button
        type="submit"
        className="btn btn--primary"
        disabled={busy || !banks || accountNumber.length !== 10 || !bankCode || !password || businessName.trim().length < 2}
        style={{ marginTop: 18 }}
      >
        {busy ? 'Checking…' : 'Check account'}
      </button>
    </form>
  );
}
