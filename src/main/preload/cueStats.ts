/**
 * Preload API for Cue Stats operations.
 *
 * Exposes `window.maestro.cueStats` — the renderer-side bridge to the Phase 03
 * aggregation handler (`cue-stats:get-aggregation`). The handler throws
 * `'CueStatsDisabled'` when either `encoreFeatures.usageStats` or
 * `encoreFeatures.maestroCue` is off; consumers should catch that to render
 * the "feature off" state.
 */

import { ipcRenderer } from 'electron';
import type { CueStatsAggregation, CueStatsTimeRange } from '../../shared/cue-stats-types';

export type { CueStatsAggregation, CueStatsTimeRange } from '../../shared/cue-stats-types';

export function createCueStatsApi() {
	return {
		// Get the full Cue stats aggregation payload for the given time range.
		// Throws 'CueStatsDisabled' when either Encore flag is off.
		getAggregation: (range: CueStatsTimeRange): Promise<CueStatsAggregation> =>
			ipcRenderer.invoke('cue-stats:get-aggregation', range),
	};
}

export type CueStatsApi = ReturnType<typeof createCueStatsApi>;
