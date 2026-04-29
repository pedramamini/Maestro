/**
 * Zsh shell integration script.
 *
 * Returns shell code that emits OSC 133 (semantic prompt) and OSC 7 (working
 * directory) sequences. Maestro parses these from PTY output to track the
 * currently-running command and CWD per terminal tab so they can be persisted
 * and optionally re-run across restarts.
 *
 * Hooks are registered via `add-zsh-hook` so they coexist with the user's own
 * pre-command / pre-prompt definitions instead of clobbering them. The script
 * is idempotent: a `_MAESTRO_SI_LOADED` guard prevents double-registration if
 * it is sourced more than once (e.g. when a user re-sources their `.zshrc`).
 *
 * The command text in OSC 133;B is hex-encoded (`cmd=<hex>`) so arbitrary
 * bytes — newlines, BEL, semicolons, multi-byte chars — survive the OSC
 * envelope intact. The parser (`oscParser.ts`, added in a later task) is
 * responsible for hex-decoding it.
 *
 * Sequences emitted:
 *   - `\\e]133;A\\a`               prompt start (pre-prompt hook)
 *   - `\\e]133;B;cmd=<hex>\\a`     command start (pre-command hook, with hex-encoded text)
 *   - `\\e]133;C\\a`               output start (pre-command hook, after command-start)
 *   - `\\e]133;D;<exit>\\a`        previous command finished (pre-prompt hook, with exit code)
 *   - `\\e]7;file://<host><pwd>\\a` current working directory (pre-prompt hook)
 */
export function getZshIntegrationScript(): string {
	return `# Maestro shell integration (zsh)
if [ -n "\${_MAESTRO_SI_LOADED:-}" ]; then
	return 0
fi
typeset -g _MAESTRO_SI_LOADED=1

autoload -Uz add-zsh-hook 2>/dev/null || return 0

# Hex-encode a string byte-by-byte so it can ride safely inside an OSC sequence
# without being terminated by BEL or confused by control characters.
__maestro_hex_encode() {
	printf '%s' "$1" | od -An -tx1 -v 2>/dev/null | tr -d ' \\n\\t'
}

# Fires after Enter is pressed but before the command starts running.
# $1 is the raw command line as the user typed it.
__maestro_on_preexec() {
	local cmd_hex
	cmd_hex=$(__maestro_hex_encode "$1")
	printf '\\033]133;B;cmd=%s\\007' "$cmd_hex"
	printf '\\033]133;C\\007'
}

# Fires before each prompt is drawn (also fires once at shell start before any
# command has run, so the OSC 133;D below reports last_status=0).
__maestro_on_precmd() {
	local last_status=$?
	printf '\\033]133;D;%d\\007' "$last_status"
	printf '\\033]133;A\\007'
	printf '\\033]7;file://%s%s\\007' "\${HOST:-\${HOSTNAME:-localhost}}" "$PWD"
}

add-zsh-hook preexec __maestro_on_preexec
add-zsh-hook precmd __maestro_on_precmd
`;
}
