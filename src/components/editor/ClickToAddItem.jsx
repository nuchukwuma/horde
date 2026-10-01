'use client';

import { useRef } from 'react';
import { useGetPuck } from '@puckeditor/core';

/** Puck's top-level drop area: the page's own list of blocks. */
const ROOT_ZONE = 'root:default-zone';

/**
 * A block in the editor's Blocks list that can be clicked as well as
 * dragged. Out of the box Puck only adds a block when it is dragged onto the
 * page; sellers reasonably tap it, see nothing happen, and decide
 * the editor is broken.
 *
 * A click inserts the block straight after the selected block — or at the
 * end of the page if nothing is selected — and selects it, so its settings
 * open at once. A press that moved more than a few pixels was a drag, which
 * Puck handles itself, so it is not also treated as a click.
 *
 * useGetPuck reads Puck's state when clicked instead of subscribing to it, so
 * the Blocks list does not re-render on every keystroke in the page.
 */
export default function ClickToAddItem({ children, name }) {
  const getPuck = useGetPuck();
  const pressedAt = useRef(null);

  function add() {
    const { appState, dispatch } = getPuck();
    const blocks = appState.data.content ?? [];
    const selected = appState.ui.itemSelector;
    const inRoot = selected && (selected.zone ?? ROOT_ZONE) === ROOT_ZONE;
    const index = inRoot ? Math.min(selected.index + 1, blocks.length) : blocks.length;

    dispatch({ type: 'insert', componentType: name, destinationIndex: index, destinationZone: ROOT_ZONE });
    dispatch({ type: 'setUi', ui: { itemSelector: { index, zone: ROOT_ZONE } } });
  }

  return (
    // Not a second role="button": Puck's item around this is already the
    // focusable control (keyboard users add blocks with its built-in
    // keyboard dragging), and a button inside a button confuses screen
    // readers and doubles every Tab stop. This only adds a click target.
    <div
      className="ed-drawer-item"
      title="Click to add to your page, or drag it into place"
      onPointerDown={(event) => {
        pressedAt.current = { x: event.clientX, y: event.clientY };
      }}
      onClick={(event) => {
        const start = pressedAt.current;
        pressedAt.current = null;
        if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return;
        add();
      }}
    >
      {children}
    </div>
  );
}
