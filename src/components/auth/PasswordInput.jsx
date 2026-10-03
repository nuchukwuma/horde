'use client';

import { useEffect, useId, useRef, useState } from 'react';

/**
 * A password field with a Show / Hide button.
 *
 * Typing a long password on a phone keyboard without seeing it is where
 * most sign-in mistakes come from, so every password field offers to show
 * what was typed. It hides again the moment the form is submitted: a field
 * submitted as plain text can end up in the browser's autofill history,
 * which a password field never does.
 *
 * Takes the same props as an <input>; `type` is managed here. Width
 * limits go on `wrapperStyle`, so the button sits at the input's edge.
 */
export default function PasswordInput({ className = 'input', style, wrapperStyle, id, ...props }) {
  const [visible, setVisible] = useState(false);
  const inputRef = useRef(null);
  const fallbackId = useId();
  const inputId = id ?? fallbackId;

  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return undefined;
    const hide = () => {
      // Synchronously, before the browser reads the form: React's re-render
      // would come too late.
      if (inputRef.current) inputRef.current.type = 'password';
      setVisible(false);
    };
    form.addEventListener('submit', hide, true);
    return () => form.removeEventListener('submit', hide, true);
  }, []);

  return (
    <span className="password-field" style={wrapperStyle}>
      <input
        {...props}
        ref={inputRef}
        id={inputId}
        type={visible ? 'text' : 'password'}
        className={className}
        style={style}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />
      <button
        type="button"
        className="password-field__toggle"
        onClick={() => setVisible((shown) => !shown)}
        aria-controls={inputId}
        aria-pressed={visible}
        aria-label={visible ? 'Hide password' : 'Show password'}
        title={visible ? 'Hide password' : 'Show password'}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
          {visible ? <path d="M4 4l16 16" /> : null}
        </svg>
      </button>
    </span>
  );
}
