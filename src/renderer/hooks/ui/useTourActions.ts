/**
 * useTourActions — extracted from App.tsx
 *
 * Listens for tour:action custom events to control right panel state:
 *   - setRightTab: Switch to a specific right panel tab
 *   - openRightPanel: Open the right panel
 *   - closeRightPanel: Close the right panel
 *
 * Reads from: uiStore (setActiveRightTab, setRightPanelOpen)
 */

import type { RightPanelTab } from '../../types';
import { useUIStore } from '../../stores/uiStore';
import { useEventListener } from '../utils/useEventListener';

// ============================================================================
// Hook implementation
// ============================================================================

export function useTourActions(): void {
	// --- Store actions (stable via getState) ---
	const { setActiveRightTab, setRightPanelOpen } = useUIStore.getState();

	useEventListener('tour:action', (event: Event) => {
		const customEvent = event as CustomEvent<{
			type: string;
			value?: string;
		}>;
		const { type, value } = customEvent.detail;

		switch (type) {
			case 'setRightTab':
				if (value === 'files' || value === 'history' || value === 'autorun') {
					setActiveRightTab(value as RightPanelTab);
				}
				break;
			case 'openRightPanel':
				setRightPanelOpen(true);
				break;
			case 'closeRightPanel':
				setRightPanelOpen(false);
				break;
			// hamburger menu actions are handled by SessionList.tsx
			default:
				break;
		}
	});
}
