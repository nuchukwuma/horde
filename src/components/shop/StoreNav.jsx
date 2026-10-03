'use client';

import { useEffect, useId, useRef, useState } from 'react';

/**
 * The store's main menu. On a wide screen the links sit in the header; on a
 * phone they fold behind a menu button and open as a panel under the header,
 * one link per row with full-width tap targets.
 *
 * Closes on Escape (focus goes back to the button), on choosing a link, on a
 * tap outside, and when the window grows past the phone breakpoint so a
 * rotated tablet never keeps a stale open panel.
 */
export default function StoreNav({ children }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const buttonRef = useRef(null);
  const navRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointer = (event) => {
      if (!navRef.current?.contains(event.target) && !buttonRef.current?.contains(event.target)) setOpen(false);
    };
    const wide = window.matchMedia('(min-width: 561px)');
    const onWide = () => wide.matches && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    wide.addEventListener('change', onWide);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
      wide.removeEventListener('change', onWide);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="store-menu-btn"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          {open ? (
            <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          ) : (
            <path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          )}
        </svg>
        <span className="visually-hidden">Menu</span>
      </button>
      <nav
        ref={navRef}
        id={id}
        className={open ? 'nav store-nav store-nav--open' : 'nav store-nav'}
        aria-label="Primary"
        // A link inside was chosen: the page is about to change, so fold away.
        onClick={(event) => event.target.closest('a') && setOpen(false)}
      >
        {children}
      </nav>
    </>
  );
}
