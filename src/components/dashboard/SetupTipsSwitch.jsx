'use client';

import { useState } from 'react';

/** The seller's own switch for setup-tip emails, shown under "Get ready to sell". */
export default function SetupTipsSwitch({ initial }) {
  const [on, setOn] = useState(initial);
  const [state, setState] = useState('idle');

  async function change(event) {
    const next = event.target.checked;
    setOn(next);
    setState('busy');
    try {
      const response = await fetch('/api/auth/email-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setupTips: next }),
      });
      if (!response.ok) throw new Error();
      setState('saved');
    } catch {
      setOn(!next);
      setState('error');
    }
  }

  return (
    <div className="setup-tips">
      <label className="setup-tips__label">
        <input type="checkbox" checked={on} onChange={change} disabled={state === 'busy'} />
        <span>Email me a reminder if I get stuck on a step</span>
      </label>
      <span role="status" className="setup-tips__status">
        {state === 'saved' ? 'Saved.' : state === 'error' ? 'Couldn’t save. Try again.' : ''}
      </span>
    </div>
  );
}
