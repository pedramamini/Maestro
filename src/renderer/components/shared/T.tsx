/**
 * <T> — Convenience component for inline translations.
 *
 * A thin wrapper around useTranslation that provides concise JSX syntax
 * for common translation cases, reducing diff size during string extraction.
 *
 * Usage:
 *   <T k="common:save" />                              // simple key
 *   <T k="common:items_count" count={5} />              // pluralization
 *   <T k="common:greeting" values={{ name: 'User' }} /> // interpolation
 *   <T k="common:save" fallback="Save" />               // dev fallback
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { I18nNamespace } from '../../../shared/i18n/config';

export interface TProps {
	/** Translation key in "namespace:key" format */
	k: string;
	/** Pluralization count */
	count?: number;
	/** Interpolation values */
	values?: Record<string, string | number>;
	/** Fallback text rendered if the key is missing (development aid) */
	fallback?: string;
}

export function T({ k, count, values, fallback }: TProps): React.ReactElement {
	// Split "namespace:key" to pass namespace to useTranslation
	const colonIdx = k.indexOf(':');
	const ns = colonIdx > -1 ? (k.slice(0, colonIdx) as I18nNamespace) : undefined;
	const key = colonIdx > -1 ? k.slice(colonIdx + 1) : k;

	const { t } = useTranslation(ns);

	const result = (t as any)(key, {
		...values,
		...(count !== undefined ? { count } : {}),
		defaultValue: fallback,
	});

	return <>{result}</>;
}
