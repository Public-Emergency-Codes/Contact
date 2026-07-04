import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLocalProfileMessage } from '../src/screens/EmergencyCall/emergencyProfileMessage.ts';

test('builds a dispatcher profile message from local data only', () => {
  const message = buildLocalProfileMessage(
    JSON.stringify({ firstName: 'Alex', lastName: 'Morgan' }),
    JSON.stringify({ bloodType: 'O+', allergies: 'penicillin', organDonor: true }),
  );
  assert.match(message, /My name is Alex Morgan/);
  assert.match(message, /blood type is O\+/);
  assert.match(message, /organ donor/);
  assert.match(message, /allergic to penicillin/);
});

test('returns null when no profile fields exist', () => {
  assert.equal(buildLocalProfileMessage(null, null), null);
});
