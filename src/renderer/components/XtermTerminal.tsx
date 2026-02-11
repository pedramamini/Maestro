/**
 * XtermTerminal - Full terminal emulator for interactive AI sessions.
 *
 * Uses xterm.js to render raw PTY output (ANSI escape sequences, cursor control,
 * bracketed paste, etc.) that ansi-to-html cannot handle. Used when a session
 * has isInteractiveAI=true (e.g., Claude Code running as an interactive TUI).
 *
 * Data flow:
 *   PTY (main) → IPC process:data → window.maestro.process.onData → term.write()
 *   term.onData (keystrokes) → window.maestro.process.write → PTY stdin
 *   fitAddon.fit() → window.maestro.process.resize → PTY resize
 *
 * Note: App.tsx skips log processing when isInteractiveAI is true —
 * this component is the sole consumer of PTY data for interactive sessions.
 */

import { useEffect, useRef, memo } from 'react';
import { Terminal } from '@xterm/xterm';
import type { ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import type { Theme } from '../types';

interface XtermTerminalProps {
	sessionId: string;
	tabId: string;
	theme: Theme;
	fontFamily: string;
}

function themeToXterm(theme: Theme): ITheme {
	const isDark = theme.mode === 'dark' || theme.mode === 'vibe';
	return {
		background: theme.colors.bgActivity,
		foreground: theme.colors.textMain,
		cursor: theme.colors.accent,
		cursorAccent: theme.colors.bgActivity,
		selectionBackground: `${theme.colors.accent}40`,
		selectionForeground: theme.colors.textMain,
		// ANSI colors — Dracula palette for dark/vibe, One Light for light mode.
		// These are fallbacks for ANSI colors not mapped by the app theme.
		black: isDark ? '#282a36' : '#000000',
		red: theme.colors.error,
		green: theme.colors.success,
		yellow: theme.colors.warning,
		blue: theme.colors.accent,
		magenta: isDark ? '#bd93f9' : '#a626a4',
		cyan: isDark ? '#8be9fd' : '#0184bc',
		white: theme.colors.textMain,
		brightBlack: theme.colors.textDim,
		brightRed: theme.colors.error,
		brightGreen: theme.colors.success,
		brightYellow: theme.colors.warning,
		brightBlue: theme.colors.accent,
		brightMagenta: isDark ? '#ff79c6' : '#c678dd',
		brightCyan: isDark ? '#8be9fd' : '#56b6c2',
		brightWhite: theme.colors.textMain,
	};
}

export const XtermTerminal = memo(function XtermTerminal({
	sessionId,
	tabId,
	theme,
	fontFamily,
}: XtermTerminalProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const termRef = useRef<Terminal | null>(null);
	const ptySessionId = `${sessionId}-ai-${tabId}`;

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const term = new Terminal({
			cursorBlink: true,
			cursorStyle: 'bar',
			fontSize: 13,
			lineHeight: 1.4,
			fontFamily: fontFamily || 'Menlo, Monaco, "Courier New", monospace',
			theme: themeToXterm(theme),
			allowProposedApi: true,
			scrollback: 10000,
			convertEol: false,
		});

		const fitAddon = new FitAddon();
		// Restrict clickable links to http/https only (no javascript:, file://, etc.)
		const webLinksAddon = new WebLinksAddon((_event, uri) => {
			try {
				const url = new URL(uri);
				if (url.protocol === 'http:' || url.protocol === 'https:') {
					window.open(uri, '_blank');
				}
			} catch {
				// ignore invalid URLs
			}
		});

		term.loadAddon(fitAddon);
		term.loadAddon(webLinksAddon);
		term.open(container);

		termRef.current = term;

		// Helper: fit terminal to container and notify PTY of new dimensions
		const fitAndResize = () => {
			try {
				fitAddon.fit();
				window.maestro.process
					.resize(ptySessionId, term.cols, term.rows)
					.catch(() => { /* PTY may not be ready yet */ });
			} catch {
				// fit() throws when the container has no dimensions (e.g., during unmount)
			}
		};

		// Initial fit after DOM paint
		let initialFitId = requestAnimationFrame(fitAndResize);

		// Forward user keystrokes to the PTY
		const inputDisposable = term.onData((data) => {
			window.maestro.process.write(ptySessionId, data).catch(() => { /* PTY may not be ready yet */ });
		});

		// Listen for PTY output and write to xterm
		const unsubscribeData = window.maestro.process.onData(
			(sid: string, data: string) => {
				if (sid === ptySessionId) {
					term.write(data);
				}
			}
		);

		// Auto-resize on container size changes, debounced via rAF coalescing
		let resizeRafId: number | null = null;
		const resizeObserver = new ResizeObserver(() => {
			if (resizeRafId !== null) cancelAnimationFrame(resizeRafId);
			resizeRafId = requestAnimationFrame(() => {
				resizeRafId = null;
				fitAndResize();
			});
		});
		resizeObserver.observe(container);

		return () => {
			cancelAnimationFrame(initialFitId);
			if (resizeRafId !== null) cancelAnimationFrame(resizeRafId);
			inputDisposable.dispose();
			unsubscribeData();
			resizeObserver.disconnect();
			term.dispose();
			termRef.current = null;
		};
		// theme is intentionally excluded: updated via the separate effect below
		// to avoid tearing down the terminal on every theme change.
	}, [ptySessionId, fontFamily]); // eslint-disable-line react-hooks/exhaustive-deps

	// Update theme without re-creating terminal
	useEffect(() => {
		if (termRef.current) {
			termRef.current.options.theme = themeToXterm(theme);
		}
	}, [theme]);

	return (
		<div
			ref={containerRef}
			className="flex-1 w-full h-full"
			style={{
				backgroundColor: theme.colors.bgActivity,
				padding: '4px 0 0 4px',
			}}
		/>
	);
});
