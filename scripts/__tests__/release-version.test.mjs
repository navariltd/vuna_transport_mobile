import assert from 'node:assert/strict';
import test from 'node:test';
import { androidReleaseVersion } from '../release-version.mjs';

const packageId = 'ke.navari.vunatransport';
test('stable semantic tags map to deterministic increasing Android codes', () => {
  assert.deepEqual(androidReleaseVersion('v1.0.0', packageId), { name: '1.0.0', code: 1_000_000, tag: 'v1.0.0', applicationId: packageId });
  const versions = ['1.0.0', '1.0.1', '1.1.0', '1.999.999', '2.0.0'].map(version => androidReleaseVersion(version, packageId).code);
  assert.deepEqual(versions, [...versions].sort((a, b) => a - b));
});
test('invalid, ambiguous and out-of-range versions cannot be published', () => {
  for (const version of ['1.0', '01.0.0', '1.0.0-beta.1', '1.0.0+build', '0.0.0', '1.1000.0', '1.0.1000', '2101.0.0', '999999999999999999999.0.0']) {
    assert.throws(() => androidReleaseVersion(version, packageId));
  }
  assert.throws(() => androidReleaseVersion('1.0.0', ''));
});
