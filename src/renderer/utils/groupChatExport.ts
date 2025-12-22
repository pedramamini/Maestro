/**
 * @file groupChatExport.ts
 * @description Export utility for Group Chat conversations.
 *
 * Generates a self-contained HTML file with the user's current theme colors
 * and properly rendered markdown content.
 */

import type {
  GroupChat,
  GroupChatMessage,
  GroupChatHistoryEntry,
  Theme,
} from '../types';

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Format a timestamp for display
 */
function formatTimestamp(timestamp: string | number): string {
  const date = new Date(timestamp);
  return date.toLocaleString();
}

/**
 * Format duration from milliseconds
 */
function formatDuration(messages: GroupChatMessage[]): string {
  if (messages.length < 2) return '0m';

  const firstTimestamp = new Date(messages[0].timestamp).getTime();
  const lastTimestamp = new Date(messages[messages.length - 1].timestamp).getTime();
  const durationMs = lastTimestamp - firstTimestamp;
  const durationHours = Math.floor(durationMs / (1000 * 60 * 60));
  const durationMins = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));

  return durationHours > 0
    ? `${durationHours}h ${durationMins}m`
    : `${durationMins}m`;
}

/**
 * Get participant color or default
 */
function getParticipantColor(
  groupChat: GroupChat,
  from: string,
  theme: Theme
): string {
  if (from === 'user') return theme.colors.accent;
  if (from === 'moderator') return theme.colors.warning;

  const participant = groupChat.participants.find(
    (p) => p.name.toLowerCase() === from.toLowerCase()
  );
  return participant?.color || theme.colors.textDim;
}

/**
 * Convert markdown-style formatting to HTML
 * Accepts an images map to embed base64 images
 */
function formatContent(content: string, images: Record<string, string> = {}): string {
  let html = escapeHtml(content);

  // Code blocks (```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, _lang, code) => {
    return `<pre class="code-block"><code>${code.trim()}</code></pre>`;
  });

  // Inline code (`)
  html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

  // Bold (**)
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Italic (*)
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Headers (# ## ###)
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bullet lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // Numbered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Markdown images ![alt](url) - must come before links
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, url) => {
    // Check if this image filename has a base64 version
    const filename = url.split('/').pop() || url;
    const dataUrl = images[filename];
    if (dataUrl) {
      return `<img src="${dataUrl}" alt="${alt}" class="embedded-image" />`;
    }
    return `<img src="${url}" alt="${alt}" class="embedded-image" />`;
  });

  // [Image: filename] pattern
  html = html.replace(/\[Image: ([^\]]+)\]/gi, (_match, filename) => {
    const dataUrl = images[filename.trim()];
    if (dataUrl) {
      return `<img src="${dataUrl}" alt="${filename.trim()}" class="embedded-image" />`;
    }
    return _match; // Leave as-is if no image data
  });

  // Links [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

  // Newlines to <br> (but not inside code blocks or after block elements)
  html = html.replace(/\n(?!<\/?(pre|ul|ol|li|h[1-3]))/g, '<br>');

  return html;
}

/**
 * Generate the HTML export content with theme colors
 */
export function generateGroupChatExportHtml(
  groupChat: GroupChat,
  messages: GroupChatMessage[],
  _history: GroupChatHistoryEntry[],
  images: Record<string, string>,
  theme: Theme
): string {
  // Calculate stats
  const userMessages = messages.filter((m) => m.from === 'user').length;
  const agentMessages = messages.filter(
    (m) => m.from !== 'user' && m.from !== 'moderator'
  ).length;

  const stats = {
    participantCount: groupChat.participants.length,
    totalMessages: messages.length,
    agentMessages,
    userMessages,
    duration: formatDuration(messages),
  };

  // Generate messages HTML with embedded images
  const messagesHtml = messages
    .map((msg) => {
      const color = getParticipantColor(groupChat, msg.from, theme);
      const isUser = msg.from === 'user';

      // Format content with images map for embedding
      const formattedContent = formatContent(msg.content, images);

      return `
      <div class="message ${isUser ? 'message-user' : 'message-agent'}">
        <div class="message-header">
          <span class="message-from" style="color: ${color}">${escapeHtml(msg.from)}</span>
          <span class="message-time">${formatTimestamp(msg.timestamp)}</span>
          ${msg.readOnly ? '<span class="read-only-badge">read-only</span>' : ''}
        </div>
        <div class="message-content">${formattedContent}</div>
      </div>`;
    })
    .join('\n');

  // Generate participants HTML
  const participantsHtml = groupChat.participants
    .map((p) => {
      return `
      <div class="participant">
        <span class="participant-color" style="background-color: ${p.color || theme.colors.textDim}"></span>
        <span class="participant-name">${escapeHtml(p.name)}</span>
        <span class="participant-agent">${escapeHtml(p.agentId)}</span>
      </div>`;
    })
    .join('\n');

  // Build HTML document with theme colors
  const colors = theme.colors;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(groupChat.name)} - Group Chat Export</title>
  <style>
    :root {
      --bg-primary: ${colors.bgMain};
      --bg-secondary: ${colors.bgSidebar};
      --bg-tertiary: ${colors.bgActivity};
      --text-primary: ${colors.textMain};
      --text-secondary: ${colors.textDim};
      --text-dim: ${colors.textDim};
      --border: ${colors.border};
      --accent: ${colors.accent};
      --accent-dim: ${colors.accentDim};
      --success: ${colors.success};
      --warning: ${colors.warning};
      --error: ${colors.error};
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background-color: var(--bg-primary);
      color: var(--text-primary);
      line-height: 1.6;
      padding: 2rem;
    }

    .container {
      max-width: 900px;
      margin: 0 auto;
    }

    .header {
      text-align: center;
      margin-bottom: 2rem;
      padding-bottom: 1.5rem;
      border-bottom: 1px solid var(--border);
    }

    .header h1 {
      font-size: 1.75rem;
      font-weight: 600;
      margin-bottom: 0.5rem;
    }

    .header .subtitle {
      color: var(--text-secondary);
      font-size: 0.875rem;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1rem;
      margin-bottom: 2rem;
    }

    .stat-card {
      background-color: var(--accent-dim);
      border-radius: 0.5rem;
      padding: 1rem;
      text-align: center;
    }

    .stat-value {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--text-primary);
    }

    .stat-label {
      font-size: 0.75rem;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .section {
      margin-bottom: 2rem;
    }

    .section-title {
      font-size: 1rem;
      font-weight: 600;
      color: var(--text-secondary);
      margin-bottom: 1rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .info-grid {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 0.5rem 1rem;
      font-size: 0.875rem;
    }

    .info-label {
      color: var(--text-dim);
    }

    .info-value {
      color: var(--text-primary);
      font-family: 'SF Mono', Monaco, 'Courier New', monospace;
      word-break: break-all;
    }

    .participants {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .participant {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      background-color: var(--bg-secondary);
      padding: 0.5rem 0.75rem;
      border-radius: 0.375rem;
      font-size: 0.875rem;
    }

    .participant-color {
      width: 0.75rem;
      height: 0.75rem;
      border-radius: 50%;
    }

    .participant-name {
      font-weight: 500;
    }

    .participant-agent {
      color: var(--text-dim);
      font-size: 0.75rem;
    }

    .messages {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .message {
      background-color: var(--bg-secondary);
      border-radius: 0.5rem;
      padding: 1rem;
      border-left: 3px solid var(--border);
    }

    .message-user {
      border-left-color: var(--accent);
    }

    .message-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 0.5rem;
    }

    .message-from {
      font-weight: 600;
      font-size: 0.875rem;
    }

    .message-time {
      color: var(--text-dim);
      font-size: 0.75rem;
    }

    .read-only-badge {
      background-color: rgba(251, 191, 36, 0.2);
      color: var(--warning);
      font-size: 0.625rem;
      padding: 0.125rem 0.375rem;
      border-radius: 0.25rem;
      text-transform: uppercase;
      font-weight: 600;
    }

    .message-content {
      font-size: 0.9375rem;
      color: var(--text-primary);
    }

    .message-content h1 {
      font-size: 1.5rem;
      margin: 1rem 0 0.5rem;
    }

    .message-content h2 {
      font-size: 1.25rem;
      margin: 1rem 0 0.5rem;
    }

    .message-content h3 {
      font-size: 1.1rem;
      margin: 0.75rem 0 0.5rem;
    }

    .message-content ul, .message-content ol {
      margin: 0.5rem 0;
      padding-left: 1.5rem;
    }

    .message-content li {
      margin: 0.25rem 0;
    }

    .message-content a {
      color: var(--accent);
      text-decoration: none;
    }

    .message-content a:hover {
      text-decoration: underline;
    }

    .code-block {
      background-color: var(--bg-tertiary);
      border-radius: 0.375rem;
      padding: 0.75rem;
      overflow-x: auto;
      margin: 0.5rem 0;
      font-family: 'SF Mono', Monaco, 'Courier New', monospace;
      font-size: 0.8125rem;
    }

    .inline-code {
      background-color: var(--bg-tertiary);
      padding: 0.125rem 0.25rem;
      border-radius: 0.25rem;
      font-family: 'SF Mono', Monaco, 'Courier New', monospace;
      font-size: 0.875em;
    }

    .embedded-image {
      max-width: 100%;
      height: auto;
      border-radius: 0.5rem;
      margin: 0.5rem 0;
    }

    .footer {
      margin-top: 3rem;
      padding-top: 1.5rem;
      border-top: 1px solid var(--border);
      text-align: center;
      color: var(--text-dim);
      font-size: 0.75rem;
    }

    .footer a {
      color: var(--accent);
      text-decoration: none;
    }

    .footer a:hover {
      text-decoration: underline;
    }

    @media (max-width: 640px) {
      body {
        padding: 1rem;
      }

      .stats-grid {
        grid-template-columns: repeat(2, 1fr);
      }

      .info-grid {
        grid-template-columns: 1fr;
      }
    }

    @media print {
      body {
        background-color: white;
        color: black;
      }

      .message {
        background-color: #f5f5f5;
        border-left-color: #ccc;
      }

      .stat-card {
        background-color: #f5f5f5;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header class="header">
      <h1>${escapeHtml(groupChat.name)}</h1>
      <p class="subtitle">Group Chat Export - ${formatTimestamp(groupChat.createdAt)}</p>
    </header>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${stats.participantCount}</div>
        <div class="stat-label">Agents</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.totalMessages}</div>
        <div class="stat-label">Messages</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.agentMessages}</div>
        <div class="stat-label">Agent Replies</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.duration}</div>
        <div class="stat-label">Duration</div>
      </div>
    </div>

    <section class="section">
      <h2 class="section-title">Details</h2>
      <div class="info-grid">
        <span class="info-label">Group Chat ID</span>
        <span class="info-value">${escapeHtml(groupChat.id)}</span>
        <span class="info-label">Created</span>
        <span class="info-value">${formatTimestamp(groupChat.createdAt)}</span>
        <span class="info-label">Moderator</span>
        <span class="info-value">${escapeHtml(groupChat.moderatorAgentId)}</span>
      </div>
    </section>

    ${groupChat.participants.length > 0 ? `
    <section class="section">
      <h2 class="section-title">Participants</h2>
      <div class="participants">
        ${participantsHtml}
      </div>
    </section>
    ` : ''}

    <section class="section">
      <h2 class="section-title">Conversation</h2>
      <div class="messages">
        ${messagesHtml}
      </div>
    </section>

    <footer class="footer">
      <p>Exported from <a href="https://maestro.sh" target="_blank">Maestro</a> on ${formatTimestamp(Date.now())}</p>
      <p style="margin-top: 0.5rem;">Theme: ${escapeHtml(theme.name)}</p>
    </footer>
  </div>
</body>
</html>`;
}

/**
 * Escape special regex characters in a string
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Download the group chat as an HTML file
 */
export async function downloadGroupChatExport(
  groupChat: GroupChat,
  messages: GroupChatMessage[],
  history: GroupChatHistoryEntry[],
  theme: Theme
): Promise<void> {
  // Fetch images from the main process
  let images: Record<string, string> = {};
  try {
    images = await window.maestro.groupChat.getImages(groupChat.id);
  } catch (error) {
    console.warn('Failed to fetch images for export:', error);
  }

  // Generate HTML
  const html = generateGroupChatExportHtml(groupChat, messages, history, images, theme);

  // Create blob and download
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `${groupChat.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-export.html`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}
