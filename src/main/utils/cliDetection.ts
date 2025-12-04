import { execFileNoThrow } from './execFile';
import * as os from 'os';

let cloudflaredInstalledCache: boolean | null = null;
let cloudflaredPathCache: string | null = null;

/**
 * Build an expanded PATH that includes common binary installation locations.
 * This is necessary because packaged Electron apps don't inherit shell environment.
 */
function getExpandedEnv(): NodeJS.ProcessEnv {
  const home = os.homedir();
  const env = { ...process.env };

  const additionalPaths = [
    '/opt/homebrew/bin',           // Homebrew on Apple Silicon
    '/opt/homebrew/sbin',
    '/usr/local/bin',              // Homebrew on Intel, common install location
    '/usr/local/sbin',
    `${home}/.local/bin`,          // User local installs
    `${home}/bin`,                 // User bin directory
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
  ];

  const currentPath = env.PATH || '';
  const pathParts = currentPath.split(':');

  for (const p of additionalPaths) {
    if (!pathParts.includes(p)) {
      pathParts.unshift(p);
    }
  }

  env.PATH = pathParts.join(':');
  return env;
}

export async function isCloudflaredInstalled(): Promise<boolean> {
  // Return cached result if available
  if (cloudflaredInstalledCache !== null) {
    return cloudflaredInstalledCache;
  }

  // Use 'which' on macOS/Linux, 'where' on Windows
  const command = process.platform === 'win32' ? 'where' : 'which';
  const env = getExpandedEnv();
  const result = await execFileNoThrow(command, ['cloudflared'], undefined, env);

  if (result.exitCode === 0 && result.stdout.trim()) {
    cloudflaredInstalledCache = true;
    cloudflaredPathCache = result.stdout.trim().split('\n')[0];
  } else {
    cloudflaredInstalledCache = false;
  }

  return cloudflaredInstalledCache;
}

export function getCloudflaredPath(): string | null {
  return cloudflaredPathCache;
}

export function clearCloudflaredCache(): void {
  cloudflaredInstalledCache = null;
}
