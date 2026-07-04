import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateDistance,
  calculateHeading,
  generateCirclePoints,
  toStreetAddress,
} from '../src/screens/EmergencyCall/emergencyMapGeometry.ts';

test('calculates deterministic geometry without location or network access', () => {
  assert.equal(calculateDistance(41, -87, 41, -87), 0);
  assert.ok(calculateDistance(41, -87, 41.001, -87) > 100);
  assert.ok(Math.abs(calculateHeading(0, 0, 1, 0)) < 0.001);
});

test('builds map display values', () => {
  assert.equal(toStreetAddress('257, East 4th Street, Canton'), '257 East 4th Street');
  assert.equal(generateCirclePoints(41, -87, 20, 4).split('|').length, 5);
});
