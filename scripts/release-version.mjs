import { readFileSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function androidReleaseVersion(version, applicationId) {
  const match = /^(?:v)?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version);
  if (!match) throw new Error('Use a stable semantic version, for example v1.0.0.');
  const [major, minor, patch] = match.slice(1).map(Number);
  const code = major * 1_000_000 + minor * 1000 + patch;
  if (minor > 999 || patch > 999 || !Number.isSafeInteger(code) || code <= 0 || code > 2_100_000_000) {
    throw new Error('Version exceeds the supported Android version-code range (minor/patch: 0–999).');
  }
  if (!/^[A-Za-z][A-Za-z\d_]*(?:\.[A-Za-z][A-Za-z\d_]*)+$/.test(applicationId || '')) {
    throw new Error('app.json must define the official Android package ID.');
  }
  return { name: `${major}.${minor}.${patch}`, code, tag: `v${major}.${minor}.${patch}`, applicationId };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { expo } = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8'));
  const version = androidReleaseVersion(process.argv[2] || expo.version, expo.android.package);
  const output = `name=${version.name}\ncode=${version.code}\ntag=${version.tag}\napplication_id=${version.applicationId}\n`;
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, output);
  process.stdout.write(output);
}
