import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatPhoneInput,
  formatPhoneNumber,
  isValidE164,
  normalizePhoneE164,
  normalizePhoneLookup,
} from '../src/utils/phoneFormat.ts';

test('normalizes US numbers to E.164 without invoking messaging', () => {
  assert.equal(normalizePhoneE164('(312) 555-0199'), '+13125550199');
  assert.equal(normalizePhoneE164('+44 20 7946 0958'), '+442079460958');
  assert.equal(normalizePhoneE164(''), '');
});

test('validates and formats phone numbers', () => {
  assert.equal(isValidE164('+13125550199'), true);
  assert.equal(isValidE164('3125550199'), false);
  assert.equal(formatPhoneNumber('+13125550199'), '(312) 555-0199');
  assert.equal(formatPhoneInput('3125550199'), '(312) 555-0199');
  assert.equal(normalizePhoneLookup('+1 (312) 555-0199'), '3125550199');
});
