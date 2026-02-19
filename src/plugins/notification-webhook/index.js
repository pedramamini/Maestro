/**
 * Notification Webhook Plugin
 *
 * Sends HTTP POST requests on agent lifecycle events.
 * Main-process-only plugin — uses Node.js http/https modules directly.
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

let api = null;
const unsubscribers = [];

/**
 * Sends a webhook POST request.
 * Never throws — all errors are caught and logged.
 */
function sendWebhook(url, payload) {
	return new Promise((resolve) => {
		try {
			const parsed = new URL(url);
			const transport = parsed.protocol === 'https:' ? https : http;
			const body = JSON.stringify(payload);

			const req = transport.request(
				{
					hostname: parsed.hostname,
					port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
					path: parsed.pathname + parsed.search,
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Content-Length': Buffer.byteLength(body),
					},
					timeout: 10000,
				},
				(res) => {
					// Consume response data to free memory
					res.resume();
					resolve({ status: res.statusCode });
				}
			);

			req.on('timeout', () => {
				req.destroy();
				console.error('[notification-webhook] Request timed out');
				resolve({ error: 'timeout' });
			});

			req.on('error', (err) => {
				console.error('[notification-webhook] Request error:', err.message);
				resolve({ error: err.message });
			});

			req.write(body);
			req.end();
		} catch (err) {
			console.error('[notification-webhook] Failed to send webhook:', err.message);
			resolve({ error: err.message });
		}
	});
}

/** Common error indicators in agent output */
const ERROR_PATTERNS = [
	'Error:',
	'FATAL',
	'panic:',
	'Traceback',
	'ECONNREFUSED',
	'ENOENT',
	'Permission denied',
];

function containsError(data) {
	if (typeof data !== 'string') return false;
	return ERROR_PATTERNS.some((pattern) => data.includes(pattern));
}

async function activate(pluginApi) {
	api = pluginApi;

	// Subscribe to agent exits
	const unsubExit = api.process.onExit(async (sessionId, code) => {
		try {
			const notifyOnCompletion = await api.settings.get('notifyOnCompletion');
			if (notifyOnCompletion === false) return;

			const webhookUrl = await api.settings.get('webhookUrl');
			if (!webhookUrl) return;

			await sendWebhook(webhookUrl, {
				event: 'agent.exit',
				sessionId,
				exitCode: code,
				timestamp: Date.now(),
			});
		} catch (err) {
			console.error('[notification-webhook] Error handling exit event:', err.message);
		}
	});
	unsubscribers.push(unsubExit);

	// Subscribe to data events for error detection
	const unsubData = api.process.onData(async (sessionId, data) => {
		if (!containsError(data)) return;

		try {
			const notifyOnError = await api.settings.get('notifyOnError');
			if (notifyOnError === false) return;

			const webhookUrl = await api.settings.get('webhookUrl');
			if (!webhookUrl) return;

			await sendWebhook(webhookUrl, {
				event: 'agent.error',
				sessionId,
				snippet: typeof data === 'string' ? data.substring(0, 500) : '',
				timestamp: Date.now(),
			});
		} catch (err) {
			console.error('[notification-webhook] Error handling data event:', err.message);
		}
	});
	unsubscribers.push(unsubData);
}

async function deactivate() {
	for (const unsub of unsubscribers) {
		try {
			unsub();
		} catch {
			// Ignore cleanup errors
		}
	}
	unsubscribers.length = 0;
	api = null;
}

module.exports = { activate, deactivate, sendWebhook, containsError };
