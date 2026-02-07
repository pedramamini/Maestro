import { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { XTerminal, type XTerminalHandle } from '../../../renderer/components/XTerminal';
import type { Theme } from '../../../renderer/types';

const theme: Theme = {
	id: 'tokyo-night',
	name: 'Tokyo Night',
	mode: 'dark',
	colors: {
		bgMain: '#1a1b26',
		bgSidebar: '#16161e',
		bgActivity: '#202331',
		border: '#2f3549',
		textMain: '#c0caf5',
		textDim: '#9aa5ce',
		accent: '#7aa2f7',
		accentDim: '#3b4261',
		accentText: '#7dcfff',
		accentForeground: '#1a1b26',
		success: '#9ece6a',
		warning: '#e0af68',
		error: '#f7768e',
	},
};

describe('XTerminal', () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
		container = document.createElement('div');
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => {
			root.unmount();
		});
		container.remove();
	});

	it('renders a terminal container scaffold', () => {
		act(() => {
			root.render(
				<XTerminal sessionId="session-1" theme={theme} fontFamily="Menlo" fontSize={15} />
			);
		});

		const terminalContainer = container.firstElementChild as HTMLElement;
		expect(terminalContainer).toBeTruthy();
		expect(terminalContainer.dataset.sessionId).toBe('session-1');
		expect(terminalContainer.dataset.themeId).toBe('tokyo-night');
		expect(terminalContainer.dataset.fontFamily).toBe('Menlo');
		expect(terminalContainer.dataset.fontSize).toBe('15');
	});

	it('exposes safe imperative methods before xterm initialization', () => {
		const ref = createRef<XTerminalHandle>();

		act(() => {
			root.render(<XTerminal ref={ref} sessionId="session-2" theme={theme} fontFamily="Monaco" />);
		});

		expect(ref.current).toBeTruthy();
		expect(ref.current?.search('needle')).toBe(false);
		expect(ref.current?.searchNext()).toBe(false);
		expect(ref.current?.searchPrevious()).toBe(false);
		expect(ref.current?.getSelection()).toBe('');
		expect(() => {
			ref.current?.write('echo test');
			ref.current?.focus();
			ref.current?.clear();
			ref.current?.scrollToBottom();
			ref.current?.resize();
		}).not.toThrow();
	});

	it('applies default font size when omitted', () => {
		act(() => {
			root.render(<XTerminal sessionId="session-3" theme={theme} fontFamily="Monaco" />);
		});

		const terminalContainer = container.firstElementChild as HTMLElement;
		expect(terminalContainer.dataset.fontSize).toBe('14');
	});
});
