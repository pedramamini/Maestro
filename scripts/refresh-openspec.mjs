#!/usr/bin/env node
/**
 * Refresh OpenSpec Prompts
 *
 * Fetches the latest OpenSpec prompts from GitHub by parsing AGENTS.md
 * and extracts the three workflow stages (proposal, apply, archive).
 *
 * Unlike spec-kit which uses ZIP releases, OpenSpec bundles all workflow
 * instructions in a single AGENTS.md file that we parse into sections.
 *
 * Usage: npm run refresh-openspec
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OPENSPEC_DIR = path.join(__dirname, '..', 'src', 'prompts', 'openspec');
const METADATA_PATH = path.join(OPENSPEC_DIR, 'metadata.json');

// GitHub OpenSpec repository info
const GITHUB_API = 'https://api.github.com';
const REPO_OWNER = 'Fission-AI';
const REPO_NAME = 'OpenSpec';
const AGENTS_MD_URL = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/openspec/AGENTS.md`;

// Commands to extract from AGENTS.md (we skip custom commands like 'help' and 'implement')
const UPSTREAM_COMMANDS = ['proposal', 'apply', 'archive'];

// Section markers for parsing AGENTS.md
// Stage headers are formatted as: ### Stage N: Title
const SECTION_MARKERS = {
  proposal: {
    start: /^###\s*Stage\s*1[:\s]+Creating\s+Changes/i,
    end: /^###\s*Stage\s*2[:\s]+/i,
  },
  apply: {
    start: /^###\s*Stage\s*2[:\s]+Implementing\s+Changes/i,
    end: /^###\s*Stage\s*3[:\s]+/i,
  },
  archive: {
    start: /^###\s*Stage\s*3[:\s]+Archiving\s+Changes/i,
    end: /^##[^#]/,  // End at next level-2 heading or end of file
  },
};

/**
 * Make an HTTPS GET request
 */
function httpsGet(url, options = {}) {
  return new Promise((resolve, reject) => {
    const headers = {
      'User-Agent': 'Maestro-OpenSpec-Refresher',
      ...options.headers,
    };

    https.get(url, { headers }, (res) => {
      // Handle redirects
      if (res.statusCode === 301 || res.statusCode === 302) {
        return resolve(httpsGet(res.headers.location, options));
      }

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}: ${url}`));
        return;
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ data, headers: res.headers }));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Parse AGENTS.md and extract workflow sections as prompts
 */
function parseAgentsMd(content) {
  const result = {};
  const lines = content.split('\n');

  for (const [sectionId, markers] of Object.entries(SECTION_MARKERS)) {
    let inSection = false;
    let sectionLines = [];

    for (const line of lines) {
      if (!inSection && markers.start.test(line)) {
        inSection = true;
        sectionLines.push(line);
        continue;
      }

      if (inSection) {
        // Check if we've hit the end marker (next stage or next major section)
        if (markers.end.test(line) && line.trim() !== '') {
          // Don't include the end marker line, it belongs to the next section
          break;
        }
        sectionLines.push(line);
      }
    }

    if (sectionLines.length > 0) {
      // Clean up trailing empty lines
      while (sectionLines.length > 0 && sectionLines[sectionLines.length - 1].trim() === '') {
        sectionLines.pop();
      }
      result[sectionId] = sectionLines.join('\n').trim();
    }
  }

  return result;
}

/**
 * Get the latest commit SHA from the main branch
 */
async function getLatestCommitSha() {
  try {
    const url = `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/commits/main`;
    const { data } = await httpsGet(url);
    const commit = JSON.parse(data);
    return commit.sha.substring(0, 7);
  } catch (error) {
    console.warn('   Warning: Could not fetch commit SHA, using "main"');
    return 'main';
  }
}

/**
 * Main refresh function
 */
async function refreshOpenSpec() {
  console.log('🔄 Refreshing OpenSpec prompts from GitHub...\n');

  // Ensure openspec directory exists
  if (!fs.existsSync(OPENSPEC_DIR)) {
    console.error('❌ OpenSpec directory not found:', OPENSPEC_DIR);
    process.exit(1);
  }

  try {
    // Fetch AGENTS.md
    console.log('📡 Fetching AGENTS.md from OpenSpec repository...');
    const { data: agentsMdContent } = await httpsGet(AGENTS_MD_URL);
    console.log(`   Downloaded AGENTS.md (${agentsMdContent.length} bytes)`);

    // Parse sections
    console.log('\n📦 Parsing workflow sections...');
    const extractedPrompts = parseAgentsMd(agentsMdContent);
    const extractedCount = Object.keys(extractedPrompts).length;
    console.log(`   Extracted ${extractedCount} sections from AGENTS.md`);

    if (extractedCount === 0) {
      console.error('❌ Failed to extract any sections from AGENTS.md');
      console.error('   Check that the section markers match the current format');
      process.exit(1);
    }

    // Get commit SHA for version tracking
    console.log('\n📋 Getting version info...');
    const commitSha = await getLatestCommitSha();
    console.log(`   Commit: ${commitSha}`);

    // Update prompt files
    console.log('\n✏️  Updating prompt files...');
    let updatedCount = 0;
    for (const commandName of UPSTREAM_COMMANDS) {
      const content = extractedPrompts[commandName];
      if (!content) {
        console.log(`   ⚠ Missing: openspec.${commandName}.md (section not found)`);
        continue;
      }

      const promptFile = path.join(OPENSPEC_DIR, `openspec.${commandName}.md`);
      const existingContent = fs.existsSync(promptFile)
        ? fs.readFileSync(promptFile, 'utf8')
        : '';

      if (content !== existingContent) {
        fs.writeFileSync(promptFile, content);
        console.log(`   ✓ Updated: openspec.${commandName}.md`);
        updatedCount++;
      } else {
        console.log(`   - Unchanged: openspec.${commandName}.md`);
      }
    }

    // Update metadata
    const metadata = {
      lastRefreshed: new Date().toISOString(),
      commitSha,
      sourceVersion: '0.1.0',
      sourceUrl: `https://github.com/${REPO_OWNER}/${REPO_NAME}`,
    };

    fs.writeFileSync(METADATA_PATH, JSON.stringify(metadata, null, 2));
    console.log('\n📄 Updated metadata.json');

    // Summary
    console.log('\n✅ Refresh complete!');
    console.log(`   Commit: ${commitSha}`);
    console.log(`   Updated: ${updatedCount} files`);
    console.log(`   Skipped: help, implement (custom Maestro prompts)`);

  } catch (error) {
    console.error('\n❌ Refresh failed:', error.message);
    process.exit(1);
  }
}

// Run
refreshOpenSpec();
