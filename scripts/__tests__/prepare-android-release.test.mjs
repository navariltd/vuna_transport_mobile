import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { prepareAndroidRelease, releaseConfigurationBlock } from "../prepare-android-release.mjs";

test("release Gradle configuration runs before variant configuration", () => {
  const block = releaseConfigurationBlock();

  assert.doesNotMatch(block, /afterEvaluate/);
  assert.match(block, /android\.defaultConfig\.versionCode = transportReleaseVersionCode/);
  assert.match(block, /android\.defaultConfig\.versionName = transportReleaseVersionName/);
  assert.match(block, /abiFilters 'arm64-v8a'/);
  assert.match(block, /android\.buildTypes\.getByName\('release'\)\.signingConfig = transportReleaseSigning/);
});

test("release Gradle configuration fails closed without signing inputs", () => {
  const block = releaseConfigurationBlock();

  assert.match(block, /Release signing is required/);
  assert.match(block, /transportReleaseTaskRequested && !transportHasReleaseSigning/);
});

test('preparing generated Gradle configuration is repeatable and refreshes owned configuration', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'transport-gradle-test-'));
  const filename = join(directory, 'build.gradle');
  try {
    await writeFile(filename, 'android {}\n');
    assert.equal(await prepareAndroidRelease(filename), true);
    assert.equal(await prepareAndroidRelease(filename), false);
    await writeFile(filename, (await readFile(filename, 'utf8')).replace('Release signing is required.', 'Obsolete signing message.'));
    assert.equal(await prepareAndroidRelease(filename), true);
    assert.match(await readFile(filename, 'utf8'), /Release signing is required/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('local release build refuses to generate a debug-signed release without credentials', () => {
  const result = spawnSync('bash', [new URL('../build-release-apk.sh', import.meta.url).pathname], { env: { PATH: process.env.PATH }, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Missing VUNA_TRANSPORT_RELEASE_STORE_FILE/);
});
