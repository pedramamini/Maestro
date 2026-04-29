/**
 * Tests for src/main/shell-integration/zsh-integration.ts
 *
 * The script's runtime correctness is verified at integration time (it can
 * only be fully validated by sourcing it in a real zsh process). These tests
 * cover the static contract the parser and PtySpawner rely on: which hooks
 * are registered, which OSC sequences are emitted, and that the script is
 * guarded against double-loading.
 */

import { describe, it, expect } from 'vitest';
import { getZshIntegrationScript } from '../../../main/shell-integration/zsh-integration';

describe('getZshIntegrationScript', () => {
	const script = getZshIntegrationScript();

	it('returns a non-empty string', () => {
		expect(typeof script).toBe('string');
		expect(script.length).toBeGreaterThan(0);
	});

	it('uses add-zsh-hook to register both preexec and precmd hooks', () => {
		// Coexisting with user hooks (vs. raw assignment) is the whole point.
		expect(script).toMatch(/add-zsh-hook\s+preexec\s+\S+/);
		expect(script).toMatch(/add-zsh-hook\s+precmd\s+\S+/);
	});

	it('guards against double-loading via _MAESTRO_SI_LOADED', () => {
		expect(script).toContain('_MAESTRO_SI_LOADED');
		// The guard must short-circuit: an early `return` when already loaded.
		expect(script).toMatch(/_MAESTRO_SI_LOADED[^\n]*\n[^\n]*return/);
	});

	it('emits OSC 133;A (prompt start) from the pre-prompt hook', () => {
		expect(script).toContain('\\033]133;A\\007');
	});

	it('emits OSC 133;B with hex-encoded command text from the pre-command hook', () => {
		expect(script).toContain('\\033]133;B;cmd=%s\\007');
	});

	it('emits OSC 133;C (output start) from the pre-command hook', () => {
		expect(script).toContain('\\033]133;C\\007');
	});

	it('emits OSC 133;D with the previous command exit code', () => {
		expect(script).toContain('\\033]133;D;%d\\007');
		// Must read $? before any other command in the hook, otherwise it gets
		// clobbered by `local` / `printf` and we record the wrong exit code.
		const precmdBody = script.match(/__maestro_on_precmd\(\)\s*\{([^}]*)\}/s);
		expect(precmdBody).not.toBeNull();
		const firstStmt = precmdBody![1].trim().split('\n')[0].trim();
		expect(firstStmt).toMatch(/last_status=\$\?/);
	});

	it('emits OSC 7 with a file:// URI from the pre-prompt hook', () => {
		expect(script).toContain('\\033]7;file://');
	});

	it('hex-encodes the command via od/tr so binary-unsafe bytes survive the OSC envelope', () => {
		// The encoder is what makes OSC 133;B robust to newlines, BEL, and
		// semicolons in user commands. If this regresses, the parser will
		// see truncated/garbled command text.
		expect(script).toMatch(/od\s+-An\s+-tx1/);
		expect(script).toContain("tr -d ' \\n\\t'");
	});

	it('autoloads add-zsh-hook with `-Uz` and bails out cleanly if unavailable', () => {
		// Some minimal zsh installs ship without add-zsh-hook; we'd rather
		// no-op than crash the user's shell.
		expect(script).toMatch(/autoload\s+-Uz\s+add-zsh-hook[^\n]*\|\|\s*return/);
	});
});
