import semanticRelease from 'semantic-release';
import { appendFile } from 'node:fs/promises';

// This script publishes a GitHub release; invoke only from the main release workflow.
if (!process.env.GITHUB_ACTIONS || process.env.GITHUB_REF !== 'refs/heads/main') {
  throw new Error('Semantic publishing is restricted to the main GitHub Actions workflow.');
}
const result = await semanticRelease();
await appendFile(process.env.GITHUB_OUTPUT, result
  ? `published=true\ntag=${result.nextRelease.gitTag}\n`
  : 'published=false\n');
