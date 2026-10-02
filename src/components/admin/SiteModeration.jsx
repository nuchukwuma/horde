'use client';

import { useState } from 'react';

/**
 * Suspend / reinstate / flag / unflag one store. Each asks for a reason,
 * which goes into the audit log with the admin's name.
 */
export default function SiteModeration({ siteId, siteName, status, flagged }) {
  const [state, setState] = useState({ status, flagged });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function act(action, question) {
    const reason = window.prompt(`${question}\n\nReason (kept in the audit log):`);
    if (reason === null) return;
    if (reason.trim().length < 3) {
      setError('A reason is required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/sites/${siteId}/moderation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason: reason.trim() }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error?.details?.[0]?.message ?? result?.error?.message ?? 'Failed.');
      setState({ status: result.data.status, flagged: result.data.prohibitedProductFlag });
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-actions">
      {state.status === 'suspended' ? (
        <button type="button" className="btn btn--sm" disabled={busy} onClick={() => act('reinstate', `Reinstate ${siteName}?`)}>
          Reinstate
        </button>
      ) : (
        <button type="button" className="btn btn--sm btn--quiet" disabled={busy} onClick={() => act('suspend', `Suspend ${siteName}? Its checkout closes.`)}>
          Suspend
        </button>
      )}
      {state.flagged ? (
        <button type="button" className="btn btn--sm" disabled={busy} onClick={() => act('unflag', `Clear the prohibited-products flag on ${siteName}?`)}>
          Clear flag
        </button>
      ) : (
        <button type="button" className="btn btn--sm btn--quiet" disabled={busy} onClick={() => act('flag', `Flag ${siteName} for prohibited products? Its checkout pauses.`)}>
          Flag
        </button>
      )}
      {error ? (
        <span className="hint hint--error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
