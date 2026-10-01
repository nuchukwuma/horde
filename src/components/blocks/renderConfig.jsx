/**
 * Puck config for RENDERING only — storefronts, on the server.
 *
 * No fields, no editor code: the storefront imports Render from
 * '@puckeditor/core/rsc' with this config, so customers' phones download
 * none of the editor. The editor's config (components/editor/editorConfig)
 * reuses the same components and adds fields.
 */

import { BLOCK_COMPONENTS } from './Blocks';

export const renderConfig = {
  root: {
    render: ({ children }) => <>{children}</>,
  },
  components: Object.fromEntries(
    Object.entries(BLOCK_COMPONENTS).map(([type, Component]) => [type, { render: Component }]),
  ),
};
