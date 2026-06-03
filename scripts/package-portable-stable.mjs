import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const cacheDir = resolve(projectRoot, '.cache', 'electron-builder');

await mkdir(cacheDir, { recursive: true });

if (!hasPackagingDependencies()) {
  await runCommand('npm install');
}

await runCommand('npm run generate:icon');
await runCommand('npm run build');
await runCommand(
  'npx electron-builder --win portable --config.win.signAndEditExecutable=false --config.win.forceCodeSigning=false',
  {
    ELECTRON_BUILDER_CACHE: cacheDir,
    ELECTRON_BUILDER_BINARIES_MIRROR: 'https://npmmirror.com/mirrors/electron-builder-binaries/'
  }
);

function runCommand(command, extraEnv = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, {
      cwd: projectRoot,
      stdio: 'inherit',
      shell: true,
      env: {
        ...process.env,
        ...extraEnv
      }
    });

    child.on('error', rejectPromise);
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(new Error(`Command failed: ${command}`));
    });
  });
}

function hasPackagingDependencies() {
  return existsSync(resolve(projectRoot, 'node_modules', 'svg-to-ico')) &&
    existsSync(resolve(projectRoot, 'node_modules', 'electron-builder')) &&
    existsSync(resolve(projectRoot, 'node_modules', 'electron-vite'));
}
