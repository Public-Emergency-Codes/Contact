import test from 'node:test';
import assert from 'node:assert/strict';

import { extractPsapVideoUrl } from '../src/services/psap/videoLinkService.ts';

test('accepts only hardcoded PSAP video provider domains', () => {
  assert.equal(
    extractPsapVideoUrl('Join https://video.rapidsos.com/session/abc123'),
    'https://video.rapidsos.com/session/abc123',
  );
  assert.equal(extractPsapVideoUrl('Open https://example.com/session/abc123'), null);
  assert.equal(extractPsapVideoUrl('Open http://video.rapidsos.com/session/abc123'), null);
});
