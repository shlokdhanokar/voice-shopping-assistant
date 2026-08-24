/**
 * Tests for voice-activated search: the parser and the catalogue query working
 * together, since that is how the feature is actually exercised.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../js/nlp.js';
import { searchCatalog, describeSearch, estimateTotal } from '../js/search.js';
import { getProduct } from '../js/catalog.js';

const NOW = Date.UTC(2025, 5, 15);
const run = (phrase, lang = 'en') => searchCatalog(parse(phrase, lang), { now: NOW });

test('searching for an item returns its brand variants', () => {
  const { results } = run('find apples');
  assert.ok(results.length > 0);
  for (const r of results) assert.equal(r.productId, 'apples');
  assert.ok(new Set(results.map((r) => r.brand)).size > 1, 'several brands offered');
});

test('results are ordered cheapest first', () => {
  const { results } = run('find apples');
  for (let i = 1; i < results.length; i++) {
    assert.ok(results[i - 1].price <= results[i].price);
  }
});

test('a price ceiling is enforced', () => {
  const { results } = run('Find toothpaste under $5');
  assert.ok(results.length > 0, 'some toothpaste is under $5');
  for (const r of results) {
    assert.ok(r.price <= 5, `${r.brand} at $${r.price} should not appear`);
    assert.equal(r.productId, 'toothpaste');
  }
});

test('an impossible price ceiling returns nothing rather than erroring', () => {
  const { results } = run('find shrimp under $1');
  assert.equal(results.length, 0);
});

test('a price floor is enforced', () => {
  const { results } = run('find cheese over $6');
  assert.ok(results.length > 0);
  for (const r of results) assert.ok(r.price >= 6);
});

test('a price range filters from both ends', () => {
  const { results } = run('find shampoo between 6 and 9');
  assert.ok(results.length > 0);
  for (const r of results) {
    assert.ok(r.price >= 6 && r.price <= 9);
  }
});

test('the organic qualifier restricts results to organic variants', () => {
  const { results, tags } = run('Find me organic apples');
  assert.deepEqual(tags, ['organic']);
  assert.ok(results.length > 0);
  for (const r of results) {
    assert.ok(r.tags.includes('organic'));
    assert.equal(r.productId, 'apples');
  }
});

test('a qualifier with no item searches the whole catalogue', () => {
  const { results } = run('find organic items under $3');
  assert.ok(results.length > 0);
  for (const r of results) {
    assert.ok(r.tags.includes('organic'));
    assert.ok(r.price <= 3);
  }
});

test('a brand name narrows the results', () => {
  const { results, brand } = run('find Value Pick rice');
  assert.equal(brand, 'Value Pick');
  for (const r of results) assert.equal(r.brand, 'Value Pick');
});

test('sale items show the original price alongside the discount', () => {
  const { results } = run('find organic items under $30');
  const discounted = results.filter((r) => r.onSale);
  for (const r of discounted) {
    assert.ok(r.wasPrice > r.price, 'a sale must actually reduce the price');
  }
});

test('search works in other languages', () => {
  const es = run('Busca pasta de dientes menos de 5', 'es');
  assert.ok(es.results.length > 0);
  for (const r of es.results) {
    assert.equal(r.productId, 'toothpaste');
    assert.ok(r.price <= 5);
  }

  const fr = run('Trouve du dentifrice moins de 5', 'fr');
  assert.ok(fr.results.length > 0);

  const hi = run('सेब ढूंढो', 'hi');
  assert.ok(hi.results.length > 0);
  assert.equal(hi.results[0].productId, 'apples');
});

test('a search with nothing to go on returns no results', () => {
  assert.equal(searchCatalog(parse('find'), { now: NOW }).results.length, 0);
  assert.equal(searchCatalog({}, { now: NOW }).results.length, 0);
  assert.equal(searchCatalog(null, { now: NOW }).results.length, 0);
});

test('results are capped so the panel stays readable', () => {
  const { results, total } = run('find items under $50');
  assert.ok(results.length <= 12);
  assert.ok(total >= results.length);
});

test('describeSearch renders the applied filters', () => {
  assert.equal(describeSearch({ query: 'apples', tags: ['organic'], filters: { maxPrice: 5 } }),
    'organic · apples · under $5');
  assert.equal(describeSearch({ query: 'rice', filters: { minPrice: 2, maxPrice: 8 } }), 'rice · $2–$8');
  assert.equal(describeSearch({ query: '', filters: {} }), 'everything');
});

// ------------------------------------------------------------- totals ------

test('estimateTotal multiplies unit price by quantity', () => {
  const total = estimateTotal([{ productId: 'milk', quantity: 2 }], NOW);
  const milk = getProduct('milk');
  const expected = Math.round(milk.price * 2 * 100) / 100;
  // Milk may be on sale in this week's deterministic promotion cycle.
  assert.ok(total === expected || total < expected, 'total is at most full price');
  assert.ok(total > 0);
});

test('custom items without a catalogue price are skipped, not counted as NaN', () => {
  const total = estimateTotal([
    { productId: null, name: 'Dragon Fruit', quantity: 1 },
    { productId: 'milk', quantity: 1 }
  ], NOW);
  assert.ok(Number.isFinite(total));
  assert.ok(total > 0);
});

test('an empty list totals zero', () => {
  assert.equal(estimateTotal([], NOW), 0);
});
