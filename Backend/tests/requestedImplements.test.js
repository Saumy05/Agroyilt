const test = require('node:test');
const assert = require('node:assert/strict');

const { sanitizeSlug, normalizeRequestedImplements } = require('../utils/requestedImplements');

test('sanitizeSlug produces lowercase hyphenated slugs and empty string for non-ASCII', () => {
  assert.equal(sanitizeSlug('  Bund Maker 2000! '), 'bund-maker-2000');
  assert.equal(sanitizeSlug('मेड़ बनाने की मशीन'), '');
});

test('normalizeRequestedImplements trims, deduplicates, and forces pending on new entries', () => {
  const { requestedImplements, error } = normalizeRequestedImplements([
    { name: '  Bund Maker ', status: 'approved', pricing: { hourly: { price: 450, isEnabled: true } } },
    { name: 'bund maker', pricing: { hourly: { price: 500, isEnabled: true } } },
    { name: 'Zero Till', pricing: { land_based: { price: 800, isEnabled: true } } }
  ]);
  assert.equal(error, undefined);
  assert.equal(requestedImplements.length, 2);
  assert.equal(requestedImplements[0].name, 'Bund Maker');
  assert.equal(requestedImplements[0].status, 'pending');
  assert.equal(requestedImplements[0].pricing.hourly.price, 450);
  assert.equal(requestedImplements[1].pricing.land_based.isEnabled, true);
});

test('normalizeRequestedImplements rejects invalid names or out-of-bounds prices', () => {
  assert.match(normalizeRequestedImplements([{ name: 'A' }]).error, /2 and 80/);
  assert.match(
    normalizeRequestedImplements([{ name: 'Bund Maker', pricing: { hourly: { price: 99999 } } }]).error,
    /Invalid hourly rate/
  );
  assert.match(
    normalizeRequestedImplements([{ name: 'Bund Maker', pricing: { land_based: { price: -10 } } }]).error,
    /Invalid land based rate/
  );
});

test('normalizeRequestedImplements keeps untouched rejected item rejected and resets edited item to pending', () => {
  const existingRequested = [
    {
      _id: 'req1',
      name: 'Laser Scraper',
      status: 'rejected',
      adminRemarks: 'Use Laser Land Leveler instead',
      pricing: { hourly: { price: 900, isEnabled: true }, land_based: { price: 0, isEnabled: false }, daily: { price: 0, isEnabled: false }, distance_based: { price: 0, isEnabled: false } }
    },
    {
      _id: 'req2',
      name: 'Puddler',
      status: 'rejected',
      adminRemarks: 'Too expensive',
      pricing: { hourly: { price: 1500, isEnabled: true }, land_based: { price: 0, isEnabled: false }, daily: { price: 0, isEnabled: false }, distance_based: { price: 0, isEnabled: false } }
    }
  ];

  const { requestedImplements, error } = normalizeRequestedImplements([
    {
      _id: 'req1',
      name: 'Laser Scraper',
      status: 'rejected',
      pricing: { hourly: { price: 900, isEnabled: true } }
    },
    {
      _id: 'req2',
      name: 'Puddler',
      status: 'rejected',
      pricing: { hourly: { price: 700, isEnabled: true } }
    }
  ], { existingRequested });

  assert.equal(error, undefined);
  assert.equal(requestedImplements[0].status, 'rejected');
  assert.equal(requestedImplements[0].adminRemarks, 'Use Laser Land Leveler instead');
  assert.equal(requestedImplements[1].status, 'pending');
  assert.equal(requestedImplements[1].adminRemarks, null);
});
