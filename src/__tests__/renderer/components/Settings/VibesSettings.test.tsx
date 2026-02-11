/**
 * Tests for Settings/VibesSettings.tsx
 *
 * Tests the VibesSettings component, including:
 * - Master enable/disable toggle
 * - Assurance level radio selector
 * - Tracked file extensions management (add/remove/reset)
 * - Exclude patterns management (add/remove/reset)
 * - Per-agent toggles
 * - Maestro orchestration toggle
 * - Auto-init toggle
 * - Binary path input
 * - Advanced section (collapsible) with threshold inputs
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VibesSettings } from '../../../../renderer/components/Settings/VibesSettings';
import type { Theme } from '../../../../renderer/types';
import { VIBES_SETTINGS_DEFAULTS } from '../../../../shared/vibes-settings';

const mockTheme: Theme = {
	id: 'dracula',
	name: 'Dracula',
	mode: 'dark',
	colors: {
		bgMain: '#282a36',
		bgSidebar: '#21222c',
		bgActivity: '#343746',
		border: '#44475a',
		textMain: '#f8f8f2',
		textDim: '#6272a4',
		accent: '#bd93f9',
		accentDim: '#bd93f920',
		accentText: '#ff79c6',
		accentForeground: '#ffffff',
		success: '#50fa7b',
		warning: '#ffb86c',
		error: '#ff5555',
	},
};

const createDefaultProps = (overrides = {}) => ({
	theme: mockTheme,
	vibesEnabled: false,
	setVibesEnabled: vi.fn(),
	vibesAssuranceLevel: 'medium' as const,
	setVibesAssuranceLevel: vi.fn(),
	vibesTrackedExtensions: [...VIBES_SETTINGS_DEFAULTS.vibesTrackedExtensions],
	setVibesTrackedExtensions: vi.fn(),
	vibesExcludePatterns: [...VIBES_SETTINGS_DEFAULTS.vibesExcludePatterns],
	setVibesExcludePatterns: vi.fn(),
	vibesPerAgentConfig: { 'claude-code': { enabled: true }, 'codex': { enabled: true } },
	setVibesPerAgentConfig: vi.fn(),
	vibesMaestroOrchestrationEnabled: true,
	setVibesMaestroOrchestrationEnabled: vi.fn(),
	vibesAutoInit: true,
	setVibesAutoInit: vi.fn(),
	vibesCheckBinaryPath: '',
	setVibesCheckBinaryPath: vi.fn(),
	vibesCompressReasoningThreshold: 10240,
	setVibesCompressReasoningThreshold: vi.fn(),
	vibesExternalBlobThreshold: 102400,
	setVibesExternalBlobThreshold: vi.fn(),
	...overrides,
});

describe('Settings/VibesSettings', () => {
	// ==========================================================================
	// Master Toggle
	// ==========================================================================
	describe('master toggle', () => {
		it('should render the VIBES Metadata section header', () => {
			const props = createDefaultProps();
			render(<VibesSettings {...props} />);
			expect(screen.getByText('VIBES Metadata')).toBeTruthy();
		});

		it('should render the enable toggle', () => {
			const props = createDefaultProps();
			render(<VibesSettings {...props} />);
			expect(screen.getByText('Enable VIBES Tracking')).toBeTruthy();
		});

		it('should call setVibesEnabled when master toggle is clicked', () => {
			const props = createDefaultProps();
			render(<VibesSettings {...props} />);
			const toggle = screen.getByRole('switch');
			fireEvent.click(toggle);
			expect(props.setVibesEnabled).toHaveBeenCalledWith(true);
		});

		it('should not show sub-sections when disabled', () => {
			const props = createDefaultProps({ vibesEnabled: false });
			render(<VibesSettings {...props} />);
			expect(screen.queryByText('Metadata Detail Level')).toBeNull();
			expect(screen.queryByText('Tracked Extensions')).toBeNull();
			expect(screen.queryByText('Exclude Patterns')).toBeNull();
		});

		it('should show sub-sections when enabled', () => {
			const props = createDefaultProps({ vibesEnabled: true });
			render(<VibesSettings {...props} />);
			expect(screen.getByText('Metadata Detail Level')).toBeTruthy();
			expect(screen.getByText('Tracked Extensions')).toBeTruthy();
			expect(screen.getByText('Exclude Patterns')).toBeTruthy();
		});
	});

	// ==========================================================================
	// Assurance Level Selector
	// ==========================================================================
	describe('assurance level selector', () => {
		it('should render all three assurance levels', () => {
			const props = createDefaultProps({ vibesEnabled: true });
			render(<VibesSettings {...props} />);
			expect(screen.getByText('Low')).toBeTruthy();
			expect(screen.getByText('Medium')).toBeTruthy();
			expect(screen.getByText('High')).toBeTruthy();
		});

		it('should render assurance level descriptions', () => {
			const props = createDefaultProps({ vibesEnabled: true });
			render(<VibesSettings {...props} />);
			expect(screen.getByText('Environment context only (~200 bytes/annotation)')).toBeTruthy();
			expect(screen.getByText('Adds prompt context (~2-10 KB/annotation)')).toBeTruthy();
			expect(screen.getByText('Adds reasoning/chain-of-thought (~10-500 KB/annotation)')).toBeTruthy();
		});

		it('should call setVibesAssuranceLevel when a level is clicked', () => {
			const props = createDefaultProps({ vibesEnabled: true });
			render(<VibesSettings {...props} />);
			// Find the radio buttons for assurance levels
			const radioButtons = screen.getAllByRole('button').filter(
				(btn) => btn.className.includes('rounded-full') && btn.className.includes('border-2')
			);
			// Click the first one (Low)
			fireEvent.click(radioButtons[0]);
			expect(props.setVibesAssuranceLevel).toHaveBeenCalledWith('low');
		});
	});

	// ==========================================================================
	// Tracked File Extensions
	// ==========================================================================
	describe('tracked file extensions', () => {
		it('should render all default extensions', () => {
			const props = createDefaultProps({ vibesEnabled: true });
			render(<VibesSettings {...props} />);
			for (const ext of VIBES_SETTINGS_DEFAULTS.vibesTrackedExtensions) {
				expect(screen.getByText(ext)).toBeTruthy();
			}
		});

		it('should add a new extension when Add button is clicked', () => {
			const props = createDefaultProps({ vibesEnabled: true });
			render(<VibesSettings {...props} />);
			const input = screen.getByPlaceholderText('e.g. .vue, .svelte');
			fireEvent.change(input, { target: { value: '.vue' } });
			const addButtons = screen.getAllByText('Add');
			fireEvent.click(addButtons[0]);
			expect(props.setVibesTrackedExtensions).toHaveBeenCalledWith(
				expect.arrayContaining(['.vue'])
			);
		});

		it('should auto-prepend dot to extensions without one', () => {
			const props = createDefaultProps({ vibesEnabled: true });
			render(<VibesSettings {...props} />);
			const input = screen.getByPlaceholderText('e.g. .vue, .svelte');
			fireEvent.change(input, { target: { value: 'vue' } });
			const addButtons = screen.getAllByText('Add');
			fireEvent.click(addButtons[0]);
			expect(props.setVibesTrackedExtensions).toHaveBeenCalledWith(
				expect.arrayContaining(['.vue'])
			);
		});

		it('should show error for duplicate extension', () => {
			const props = createDefaultProps({ vibesEnabled: true });
			render(<VibesSettings {...props} />);
			const input = screen.getByPlaceholderText('e.g. .vue, .svelte');
			fireEvent.change(input, { target: { value: '.ts' } });
			const addButtons = screen.getAllByText('Add');
			fireEvent.click(addButtons[0]);
			expect(screen.getByText('Extension already tracked')).toBeTruthy();
		});

		it('should disable Add button when extension input is empty or whitespace', () => {
			const props = createDefaultProps({ vibesEnabled: true });
			render(<VibesSettings {...props} />);
			const input = screen.getByPlaceholderText('e.g. .vue, .svelte');
			fireEvent.change(input, { target: { value: '  ' } });
			const addButtons = screen.getAllByText('Add');
			expect(addButtons[0]).toBeDisabled();
		});

		it('should remove an extension when X button is clicked', () => {
			const props = createDefaultProps({ vibesEnabled: true });
			render(<VibesSettings {...props} />);
			// Find the remove button for .ts (first extension)
			const removeButtons = screen.getAllByTitle('Remove extension');
			fireEvent.click(removeButtons[0]);
			expect(props.setVibesTrackedExtensions).toHaveBeenCalled();
		});

		it('should add extension via Enter key', () => {
			const props = createDefaultProps({ vibesEnabled: true });
			render(<VibesSettings {...props} />);
			const input = screen.getByPlaceholderText('e.g. .vue, .svelte');
			fireEvent.change(input, { target: { value: '.vue' } });
			fireEvent.keyPress(input, { key: 'Enter', code: 'Enter', charCode: 13 });
			expect(props.setVibesTrackedExtensions).toHaveBeenCalledWith(
				expect.arrayContaining(['.vue'])
			);
		});

		it('should reset extensions to defaults', () => {
			const props = createDefaultProps({
				vibesEnabled: true,
				vibesTrackedExtensions: ['.ts'],
			});
			render(<VibesSettings {...props} />);
			const resetButtons = screen.getAllByText('Reset to defaults');
			fireEvent.click(resetButtons[0]);
			expect(props.setVibesTrackedExtensions).toHaveBeenCalledWith(
				VIBES_SETTINGS_DEFAULTS.vibesTrackedExtensions
			);
		});
	});

	// ==========================================================================
	// Exclude Patterns
	// ==========================================================================
	describe('exclude patterns', () => {
		it('should render all default exclude patterns', () => {
			const props = createDefaultProps({ vibesEnabled: true });
			render(<VibesSettings {...props} />);
			for (const pattern of VIBES_SETTINGS_DEFAULTS.vibesExcludePatterns) {
				expect(screen.getByText(pattern)).toBeTruthy();
			}
		});

		it('should add a new pattern when Add button is clicked', () => {
			const props = createDefaultProps({ vibesEnabled: true });
			render(<VibesSettings {...props} />);
			const input = screen.getByPlaceholderText('e.g. **/vendor/**, *.min.js');
			fireEvent.change(input, { target: { value: '**/tmp/**' } });
			const addButtons = screen.getAllByText('Add');
			fireEvent.click(addButtons[1]); // Second Add button (for patterns)
			expect(props.setVibesExcludePatterns).toHaveBeenCalledWith(
				expect.arrayContaining(['**/tmp/**'])
			);
		});

		it('should show error for duplicate pattern', () => {
			const props = createDefaultProps({ vibesEnabled: true });
			render(<VibesSettings {...props} />);
			const input = screen.getByPlaceholderText('e.g. **/vendor/**, *.min.js');
			fireEvent.change(input, { target: { value: '**/node_modules/**' } });
			const addButtons = screen.getAllByText('Add');
			fireEvent.click(addButtons[1]);
			expect(screen.getByText('Pattern already exists')).toBeTruthy();
		});

		it('should show empty state when no patterns configured', () => {
			const props = createDefaultProps({
				vibesEnabled: true,
				vibesExcludePatterns: [],
			});
			render(<VibesSettings {...props} />);
			expect(screen.getByText('No exclude patterns configured. All directories will be tracked.')).toBeTruthy();
		});

		it('should remove a pattern when X button is clicked', () => {
			const props = createDefaultProps({ vibesEnabled: true });
			render(<VibesSettings {...props} />);
			const removeButtons = screen.getAllByTitle('Remove pattern');
			fireEvent.click(removeButtons[0]);
			expect(props.setVibesExcludePatterns).toHaveBeenCalled();
		});

		it('should reset patterns to defaults', () => {
			const props = createDefaultProps({
				vibesEnabled: true,
				vibesExcludePatterns: ['**/tmp/**'],
			});
			render(<VibesSettings {...props} />);
			const resetButtons = screen.getAllByText('Reset to defaults');
			fireEvent.click(resetButtons[1]); // Second reset (for patterns)
			expect(props.setVibesExcludePatterns).toHaveBeenCalledWith(
				VIBES_SETTINGS_DEFAULTS.vibesExcludePatterns
			);
		});
	});

	// ==========================================================================
	// Per-Agent Toggles
	// ==========================================================================
	describe('per-agent toggles', () => {
		it('should render agent toggle labels', () => {
			const props = createDefaultProps({ vibesEnabled: true });
			render(<VibesSettings {...props} />);
			expect(screen.getByText('Claude Code')).toBeTruthy();
			expect(screen.getByText('Codex')).toBeTruthy();
		});

		it('should call setVibesPerAgentConfig when agent toggle is clicked', () => {
			const props = createDefaultProps({ vibesEnabled: true });
			render(<VibesSettings {...props} />);
			// Find the checkboxes (buttons with rounded border class)
			const checkboxes = screen.getAllByRole('button').filter(
				(btn) => btn.className.includes('rounded border') && btn.className.includes('w-5 h-5')
			);
			// Click Claude Code checkbox (should be first)
			fireEvent.click(checkboxes[0]);
			expect(props.setVibesPerAgentConfig).toHaveBeenCalledWith(
				expect.objectContaining({
					'claude-code': { enabled: false },
				})
			);
		});
	});

	// ==========================================================================
	// Maestro Orchestration Toggle
	// ==========================================================================
	describe('maestro orchestration toggle', () => {
		it('should render the orchestration section', () => {
			const props = createDefaultProps({ vibesEnabled: true });
			render(<VibesSettings {...props} />);
			expect(screen.getByText('Maestro Orchestration Data')).toBeTruthy();
		});

		it('should call setter when orchestration toggle is clicked', () => {
			const props = createDefaultProps({ vibesEnabled: true });
			render(<VibesSettings {...props} />);
			// Click the container div with role="button" that wraps the orchestration toggle
			const orchestrationText = screen.getByText('Maestro Orchestration Data');
			const toggleContainer = orchestrationText.closest('[role="button"]');
			expect(toggleContainer).toBeTruthy();
			fireEvent.click(toggleContainer!);
			expect(props.setVibesMaestroOrchestrationEnabled).toHaveBeenCalledWith(false);
		});
	});

	// ==========================================================================
	// Auto-Init Toggle
	// ==========================================================================
	describe('auto-init toggle', () => {
		it('should render the auto-init section', () => {
			const props = createDefaultProps({ vibesEnabled: true });
			render(<VibesSettings {...props} />);
			expect(screen.getByText('Auto-Initialize Projects')).toBeTruthy();
		});

		it('should call setter when auto-init toggle is clicked', () => {
			const props = createDefaultProps({ vibesEnabled: true });
			render(<VibesSettings {...props} />);
			// Click the container div with role="button" that wraps the auto-init toggle
			const autoInitText = screen.getByText('Auto-Initialize Projects');
			const toggleContainer = autoInitText.closest('[role="button"]');
			expect(toggleContainer).toBeTruthy();
			fireEvent.click(toggleContainer!);
			expect(props.setVibesAutoInit).toHaveBeenCalledWith(false);
		});
	});

	// ==========================================================================
	// Binary Path Input
	// ==========================================================================
	describe('binary path input', () => {
		it('should render binary path section', () => {
			const props = createDefaultProps({ vibesEnabled: true });
			render(<VibesSettings {...props} />);
			expect(screen.getByText('VibesCheck Binary Path')).toBeTruthy();
		});

		it('should show "Auto" indicator when path is empty', () => {
			const props = createDefaultProps({ vibesEnabled: true, vibesCheckBinaryPath: '' });
			render(<VibesSettings {...props} />);
			expect(screen.getByText('Auto')).toBeTruthy();
		});

		it('should not show "Auto" indicator when path is set', () => {
			const props = createDefaultProps({
				vibesEnabled: true,
				vibesCheckBinaryPath: '/usr/local/bin/vibescheck',
			});
			render(<VibesSettings {...props} />);
			expect(screen.queryByText('Auto')).toBeNull();
		});

		it('should call setter when binary path changes', () => {
			const props = createDefaultProps({ vibesEnabled: true });
			render(<VibesSettings {...props} />);
			const input = screen.getByPlaceholderText('Auto-detect from $PATH');
			fireEvent.change(input, { target: { value: '/usr/local/bin/vibescheck' } });
			expect(props.setVibesCheckBinaryPath).toHaveBeenCalledWith('/usr/local/bin/vibescheck');
		});
	});

	// ==========================================================================
	// Advanced Section (Collapsible)
	// ==========================================================================
	describe('advanced section', () => {
		it('should render the advanced section collapsed by default', () => {
			const props = createDefaultProps({ vibesEnabled: true });
			render(<VibesSettings {...props} />);
			expect(screen.getByText('Advanced')).toBeTruthy();
			expect(screen.queryByText('Compression Threshold (bytes)')).toBeNull();
		});

		it('should expand advanced section when clicked', () => {
			const props = createDefaultProps({ vibesEnabled: true });
			render(<VibesSettings {...props} />);
			fireEvent.click(screen.getByText('Advanced'));
			expect(screen.getByText('Compression Threshold (bytes)')).toBeTruthy();
			expect(screen.getByText('External Blob Threshold (bytes)')).toBeTruthy();
		});

		it('should show default compression threshold value', () => {
			const props = createDefaultProps({ vibesEnabled: true });
			render(<VibesSettings {...props} />);
			fireEvent.click(screen.getByText('Advanced'));
			const inputs = screen.getAllByRole('spinbutton');
			expect(inputs[0]).toHaveValue(10240);
		});

		it('should show default external blob threshold value', () => {
			const props = createDefaultProps({ vibesEnabled: true });
			render(<VibesSettings {...props} />);
			fireEvent.click(screen.getByText('Advanced'));
			const inputs = screen.getAllByRole('spinbutton');
			expect(inputs[1]).toHaveValue(102400);
		});

		it('should call setter when compression threshold changes', () => {
			const props = createDefaultProps({ vibesEnabled: true });
			render(<VibesSettings {...props} />);
			fireEvent.click(screen.getByText('Advanced'));
			const inputs = screen.getAllByRole('spinbutton');
			fireEvent.change(inputs[0], { target: { value: '5000' } });
			expect(props.setVibesCompressReasoningThreshold).toHaveBeenCalledWith(5000);
		});

		it('should call setter when external blob threshold changes', () => {
			const props = createDefaultProps({ vibesEnabled: true });
			render(<VibesSettings {...props} />);
			fireEvent.click(screen.getByText('Advanced'));
			const inputs = screen.getAllByRole('spinbutton');
			fireEvent.change(inputs[1], { target: { value: '50000' } });
			expect(props.setVibesExternalBlobThreshold).toHaveBeenCalledWith(50000);
		});

		it('should not call setter for invalid (NaN) threshold values', () => {
			const props = createDefaultProps({ vibesEnabled: true });
			render(<VibesSettings {...props} />);
			fireEvent.click(screen.getByText('Advanced'));
			const inputs = screen.getAllByRole('spinbutton');
			fireEvent.change(inputs[0], { target: { value: 'abc' } });
			expect(props.setVibesCompressReasoningThreshold).not.toHaveBeenCalled();
		});

		it('should collapse advanced section when clicked again', () => {
			const props = createDefaultProps({ vibesEnabled: true });
			render(<VibesSettings {...props} />);
			fireEvent.click(screen.getByText('Advanced'));
			expect(screen.getByText('Compression Threshold (bytes)')).toBeTruthy();
			fireEvent.click(screen.getByText('Advanced'));
			expect(screen.queryByText('Compression Threshold (bytes)')).toBeNull();
		});
	});

	// ==========================================================================
	// Keyboard Accessibility
	// ==========================================================================
	describe('keyboard accessibility', () => {
		it('should toggle master switch on Enter key', () => {
			const props = createDefaultProps();
			render(<VibesSettings {...props} />);
			const toggleArea = screen.getByRole('button', { name: /Enable VIBES Tracking/i }).closest('[role="button"]');
			if (toggleArea) {
				fireEvent.keyDown(toggleArea, { key: 'Enter' });
				expect(props.setVibesEnabled).toHaveBeenCalledWith(true);
			}
		});

		it('should toggle master switch on Space key', () => {
			const props = createDefaultProps();
			render(<VibesSettings {...props} />);
			const toggleArea = screen.getByRole('switch').closest('[role="button"]');
			if (toggleArea) {
				fireEvent.keyDown(toggleArea, { key: ' ' });
				expect(props.setVibesEnabled).toHaveBeenCalledWith(true);
			}
		});
	});
});
