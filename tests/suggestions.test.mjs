/**
 * Tests for the suggestion strategies and the substitute engine.
 *
 * Every case injects an explicit clock so results do not drift with the
 * real date.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSuggestions, substitutesFor } from '../js/suggestions.js';
import { getProduct, seasonalProducts, isOnSale } from '../js/catalog.js';

const DAY = 86400000;

/** Builds a store-shaped state object for the engine to read. */
function stateWith({ items = [], counts = {}, lastPurchased = {}, pairs = {}, dismissed = [] } = {}) {
  return { items, history: { counts, lastPurchased, pairs }, dismissed };
}

const listed = (name, productId, done = false) => ({
  id: name, productId, name, category: 'other', quantity: 1, done
});

test('suggests a restock once the typical cycle has elapsed', () => {
  const now = Date.UTC(2025, 5, 15);
  const bread = getProduct('bread'); // restocks every 4 days
  const state = stateWith({ lastPurchased: { bread: now - bread.restockDays * 2 * DAY } });

  const hit = buildSuggestions(state, now).find((s) => s.productId === 'bread');
  assert.ok(hit, 'bread should be suggested');
  assert.equal(hit.type, 'restock');
  assert.match(hit.reason, /Running low/);
  assert.match(hit.reason, /8 days ago/);
});

test('does not suggest a restock for something bought yesterday', () => {
  const now = Date.UTC(2025, 5, 15);
  const state = stateWith({ lastPurchased: { rice: now - 1 * DAY } }); // rice cycle is 30 days
  assert.equal(buildSuggestions(state, now).find((s) => s.productId === 'rice'), undefined);
});

test('never suggests something already on the list', () => {
  const now = Date.UTC(2025, 5, 15);
  const state = stateWith({
    items: [listed('Bread', 'bread')],
    lastPurchased: { bread: now - 40 * DAY }
  });
  assert.equal(buildSuggestions(state, now).find((s) => s.productId === 'bread'), undefined);
});

test('an item already ticked off still counts as needing a restock', () => {
  const now = Date.UTC(2025, 5, 15);
  const state = stateWith({
    items: [listed('Bread', 'bread', true)], // done, so no longer "on" the list
    lastPurchased: { bread: now - 40 * DAY }
  });
  assert.ok(buildSuggestions(state, now).find((s) => s.productId === 'bread'));
});

test('suggests things habitually bought alongside what is on the list', () => {
  const now = Date.UTC(2025, 5, 15);
  const state = stateWith({
    items: [listed('Bread', 'bread')],
    pairs: { bread: { butter: 5 } }
  });
  const hit = buildSuggestions(state, now).find((s) => s.productId === 'butter');
  assert.ok(hit, 'butter should be suggested with bread');
  assert.equal(hit.type, 'pairing');
  assert.match(hit.reason, /usually buy this with bread/);
});

test('seasonal suggestions follow the month', () => {
  const december = Date.UTC(2025, 11, 10);
  const suggestions = buildSuggestions(stateWith(), december);
  const seasonalIds = seasonalProducts(12).map((p) => p.id);
  const seasonal = suggestions.filter((s) => s.type === 'seasonal');
  assert.ok(seasonal.length > 0, 'December should have seasonal picks');
  for (const s of seasonal) assert.ok(seasonalIds.includes(s.productId));

  // Mangoes peak in spring, not December.
  assert.equal(suggestions.find((s) => s.productId === 'mangoes' && s.type === 'seasonal'), undefined);
});

test('sale suggestions quote the discounted price', () => {
  const now = Date.UTC(2025, 5, 15);
  const hit = buildSuggestions(stateWith(), now).find((s) => s.type === 'sale');
  if (hit) {
    assert.ok(isOnSale(hit.productId, new Date(now)));
    assert.match(hit.reason, /On sale this week/);
    assert.ok(hit.price < getProduct(hit.productId).price);
  }
});

test('frequently bought items surface as habits', () => {
  const now = Date.UTC(2025, 5, 15);
  const state = stateWith({ counts: { coffee: 9 }, lastPurchased: { coffee: now - 1 * DAY } });
  const hit = buildSuggestions(state, now).find((s) => s.productId === 'coffee');
  assert.ok(hit);
  assert.match(hit.reason, /bought this 9 times/);
});

test('a product is suggested once, by its strongest reason', () => {
  const now = Date.UTC(2025, 5, 15);
  const state = stateWith({
    counts: { bread: 9 },
    lastPurchased: { bread: now - 40 * DAY },
    pairs: { milk: { bread: 4 } },
    items: [listed('Milk', 'milk')]
  });
  const hits = buildSuggestions(state, now).filter((s) => s.productId === 'bread');
  assert.equal(hits.length, 1, 'no duplicate suggestions');
  assert.equal(hits[0].type, 'restock', 'the highest-scoring reason wins');
});

test('dismissed suggestions stay hidden', () => {
  const now = Date.UTC(2025, 5, 15);
  const state = stateWith({ lastPurchased: { bread: now - 40 * DAY }, dismissed: ['bread'] });
  assert.equal(buildSuggestions(state, now).find((s) => s.productId === 'bread'), undefined);
});

test('suggestions are ranked and capped', () => {
  const now = Date.UTC(2025, 5, 15);
  const lastPurchased = {};
  for (const id of ['milk', 'bread', 'eggs', 'rice', 'coffee', 'yogurt', 'chicken', 'tomatoes', 'onions', 'oats']) {
    lastPurchased[id] = now - 90 * DAY;
  }
  const suggestions = buildSuggestions(stateWith({ lastPurchased }), now);
  assert.ok(suggestions.length <= 8, 'at most eight suggestions');
  for (let i = 1; i < suggestions.length; i++) {
    assert.ok(suggestions[i - 1].score >= suggestions[i].score, 'sorted by score');
  }
});

test('an empty history still produces seasonal or sale ideas', () => {
  const suggestions = buildSuggestions(stateWith(), Date.UTC(2025, 9, 1));
  assert.ok(suggestions.length > 0);
});

test('every suggestion carries a price and an explanation', () => {
  const now = Date.UTC(2025, 5, 15);
  const state = stateWith({ lastPurchased: { milk: now - 30 * DAY }, counts: { milk: 3 } });
  for (const s of buildSuggestions(state, now)) {
    assert.equal(typeof s.price, 'number');
    assert.ok(s.price > 0);
    assert.ok(s.reason && s.reason.length > 5, 'suggestions must explain themselves');
    assert.ok(s.category);
  }
});

// ----------------------------------------------------------- substitutes ----

test('offers the catalogue-defined alternatives', () => {
  const subs = substitutesFor('milk', { now: Date.UTC(2025, 5, 15) });
  const ids = subs.map((s) => s.productId);
  assert.ok(ids.includes('almond-milk'), 'almond milk is a milk substitute');
  assert.ok(subs.length <= 3);
});

test('substitutes exclude the item itself and anything already listed', () => {
  const subs = substitutesFor('milk', { exclude: ['almond-milk'], now: Date.UTC(2025, 5, 15) });
  const ids = subs.map((s) => s.productId);
  assert.ok(!ids.includes('milk'));
  assert.ok(!ids.includes('almond-milk'));
});

test('products with no listed alternatives fall back to their category', () => {
  const subs = substitutesFor('carrots', { now: Date.UTC(2025, 5, 15) });
  assert.ok(subs.length > 0, 'a fallback is always offered');
  for (const sub of subs) assert.equal(getProduct(sub.productId).category, 'produce');
});

test('substitutes explain why they are worth considering', () => {
  for (const sub of substitutesFor('milk', { now: Date.UTC(2025, 5, 15) })) {
    assert.ok(sub.reason && sub.reason.length > 0);
    assert.equal(typeof sub.price, 'number');
  }
});

test('an unknown product id yields no substitutes rather than throwing', () => {
  assert.deepEqual(substitutesFor('not-a-real-product'), []);
  assert.deepEqual(substitutesFor(null), []);
});
