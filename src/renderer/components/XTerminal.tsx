import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import type { WebglAddon } from '@xterm/addon-webgl';
import type { WebLinksAddon } from '@xterm/addon-web-links';
import type { SearchAddon } from '@xterm/addon-search';
import type { Unicode11Addon } from '@xterm/addon-unicode11';
import '@xterm/xterm/css/xterm.css';
import type { Theme } from '../types';

interface XTerminalProps {
	sessionId: string;
	theme: Theme;
	fontFamily: string;
	fontSize?: number;
	onData?: (data: string) => void;
	onResize?: (cols: number, rows: number) => void;
	onTitleChange?: (title: string) => void;
}

export interface XTerminalHandle {
	write: (data: string) => void;
	focus: () => void;
	clear: () => void;
	scrollToBottom: () => void;
	search: (query: string) => boolean;
	searchNext: () => boolean;
	searchPrevious: () => boolean;
	getSelection: () => string;
	resize: () => void;
}

interface XTerminalAddons {
	fit: FitAddon | null;
	search: SearchAddon | null;
	webgl: WebglAddon | null;
	webLinks: WebLinksAddon | null;
	unicode11: Unicode11Addon | null;
}

export const XTerminal = forwardRef<XTerminalHandle, XTerminalProps>(function XTerminal(
	{ sessionId, theme, fontFamily, fontSize },
	ref
) {
	const containerRef = useRef<HTMLDivElement>(null);
	const terminalRef = useRef<Terminal | null>(null);
	const addonsRef = useRef<XTerminalAddons>({
		fit: null,
		search: null,
		webgl: null,
		webLinks: null,
		unicode11: null,
	});
	const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		return () => {
			if (resizeTimeoutRef.current) {
				clearTimeout(resizeTimeoutRef.current);
			}
		};
	}, []);

	useImperativeHandle(
		ref,
		() => ({
			write: (data: string) => terminalRef.current?.write(data),
			focus: () => terminalRef.current?.focus(),
			clear: () => terminalRef.current?.clear(),
			scrollToBottom: () => terminalRef.current?.scrollToBottom(),
			search: (query: string) => addonsRef.current.search?.findNext(query) ?? false,
			searchNext: () => addonsRef.current.search?.findNext('') ?? false,
			searchPrevious: () => addonsRef.current.search?.findPrevious('') ?? false,
			getSelection: () => terminalRef.current?.getSelection() ?? '',
			resize: () => addonsRef.current.fit?.fit(),
		}),
		[]
	);

	return (
		<div
			ref={containerRef}
			className="h-full w-full overflow-hidden"
			data-session-id={sessionId}
			data-theme-id={theme.id}
			data-font-family={fontFamily}
			data-font-size={fontSize ?? 14}
		/>
	);
});
