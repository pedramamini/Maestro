#!/usr/bin/env node
/**
 * Build script for the Maestro CLI using esbuild.
 *
 * Bundles the CLI into a single JavaScript file that can be run with Node.js.
 * Users of this CLI already have Node.js installed (required for Claude Code),
 * so we don't need standalone binaries.
 */

import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const outfile = path.join(rootDir, 'dist/cli/maestro-cli.js');

/**
 * esbuild plugin to handle .md?raw imports (Vite-style raw imports)
 * Converts the file contents to a string export
 */
const rawMdPlugin = {
  name: 'raw-md',
  setup(build) {
    // Handle imports ending with .md?raw
    build.onResolve({ filter: /\.md\?raw$/ }, (args) => {
      // Remove the ?raw suffix and resolve the path
      const cleanPath = args.path.replace(/\?raw$/, '');
      const resolvedPath = path.resolve(path.dirname(args.importer), cleanPath);
      return { path: resolvedPath, namespace: 'raw-md' };
    });

    // Load the file contents as a string
    build.onLoad({ filter: /.*/, namespace: 'raw-md' }, async (args) => {
      const content = await fs.promises.readFile(args.path, 'utf8');
      return {
        contents: `export default ${JSON.stringify(content)};`,
        loader: 'js',
      };
    });
  },
};

async function build() {
  console.log('Building CLI with esbuild...');

  try {
    await esbuild.build({
      entryPoints: [path.join(rootDir, 'src/cli/index.ts')],
      bundle: true,
      platform: 'node',
      target: 'node20',
      outfile,
      format: 'cjs',
      sourcemap: true,
      minify: false, // Keep readable for debugging
      // Note: shebang is already in src/cli/index.ts, no banner needed
      external: [],
      plugins: [rawMdPlugin],
    });

    // Make the output executable
    fs.chmodSync(outfile, 0o755);

    const stats = fs.statSync(outfile);
    const sizeKB = (stats.size / 1024).toFixed(1);
    console.log(`✓ Built ${outfile} (${sizeKB} KB)`);
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
