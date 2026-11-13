// SPDX-License-Identifier: GPL-3.0-or-later
/* Hook point between the adaptation overview and the local probe pipeline (owned by the probe/upload work, not by the
   overview). The overview never exports or sends anything itself: it hands the pipeline the games the user picked.
   Order: the pipeline's global entry (window.megulitProbe.open), then the pipeline's module once it ships, then the
   existing per-game diagnostics dialog as a fallback until the pipeline lands. */
import {openDiagnostics} from './diagnostics-ui.js';

export const probeAvailable = () => typeof window.megulitProbe?.open === 'function';

export const requestProbe = async ({ ids, source = 'overview', api, locale, esc, toast }) => {
  const list = [...new Set((ids || []).map(String))].filter(Boolean);
  if (!list.length) return null;
  if (probeAvailable()) return window.megulitProbe.open({ ids: list, source });
  /* fallback: the per-game diagnostics dialog the app already has (one game at a time) */
  return openDiagnostics({ api, id: list[0], locale, esc, toast });
};
