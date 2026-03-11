/**
 * DirectionProvider — RTL-aware layout wrapper.
 *
 * Reads the current language from the settings store, computes the text
 * direction (LTR/RTL), and applies the following to document.documentElement:
 *   - dir="rtl" | "ltr"
 *   - data-dir="rtl" | "ltr"  (for CSS attribute selectors)
 *   - lang="{language code}"
 *   - CSS custom properties --dir-start / --dir-end
 *
 * Wrap the app root with this component so every child inherits the
 * correct direction automatically.  When the language changes the
 * attributes update synchronously in a useEffect.
 */

import React, { useEffect } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { RTL_LANGUAGES, type SupportedLanguage } from '../../../shared/i18n/config';

/** Returns true when the given language code is a right-to-left language. */
export function isRtlLanguage(lang: string): boolean {
	return RTL_LANGUAGES.includes(lang as SupportedLanguage);
}

export interface DirectionProviderProps {
	children: React.ReactNode;
}

/**
 * Applies direction-related attributes and CSS custom properties to the
 * document root element whenever the active language changes.
 */
export function DirectionProvider({ children }: DirectionProviderProps): React.ReactElement {
	const language = useSettingsStore((s) => s.language);
	const settingsLoaded = useSettingsStore((s) => s.settingsLoaded);

	useEffect(() => {
		if (!settingsLoaded) return;

		const rtl = isRtlLanguage(language);
		const dir = rtl ? 'rtl' : 'ltr';
		const root = document.documentElement;

		// Core direction attributes
		root.lang = language;
		root.dir = dir;
		root.setAttribute('data-dir', dir);

		// CSS custom properties for logical positioning fallbacks
		root.style.setProperty('--dir-start', rtl ? 'right' : 'left');
		root.style.setProperty('--dir-end', rtl ? 'left' : 'right');
	}, [language, settingsLoaded]);

	return <>{children}</>;
}
