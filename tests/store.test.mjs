/**
 * Tests for the state store: merging, quantities, undo, purchase history and
 * resilience to a broken or unavailable localStorage.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../js/store.js';

/** In-memory stand-in for localStorage. */
function fakeStorage(initial = null) {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_key, next) => { value = next; },
    get raw() { return value; }
  };
}

const milk = { productId: 'milk', name: 'Milk', category: 'dairy', quantity: 1 };

test('adds an item with sensible defaults', () => {
  const store = new Store(fakeStorage());
  const { item, merged } = store.addItem(milk);
  assert.equal(merged, false);
  assert.equal(store.items.length, 1);
  assert.equal(item.name, 'Milk');
  assert.equal(item.done, false);
  assert.ok(item.id, 'item should get an id');
});

test('adding the same product again merges quantities instead of duplicating', () => {
  const store = new Store(fakeStorage());
  store.addItem({ ...milk, quantity: 2 });
  const { merged } = store.addItem({ ...milk, quantity: 3 });
  assert.equal(merged, true);
  assert.equal(store.items.length, 1);
  assert.equal(store.items[0].quantity, 5);
});

test('free-text items merge by name, case-insensitively', () => {
  const store = new Store(fakeStorage());
  store.addItem({ productId: null, name: 'Dragon Fruit', category: 'other', quantity: 1 });
  store.addItem({ productId: null, name: 'dragon fruit', category: 'other', quantity: 2 });
  assert.equal(store.items.length, 1);
  assert.equal(store.items[0].quantity, 3);
});

test('a completed item does not absorb a new one of the same product', () => {
  const store = new Store(fakeStorage());
  const { item } = store.addItem(milk);
  store.toggleDone(item.id, true);
  store.addItem(milk);
  assert.equal(store.items.length, 2, 'buying milk then re-adding it starts a fresh line');
});

test('removes by product id and reports a miss', () => {
  const store = new Store(fakeStorage());
  store.addItem(milk);
  assert.ok(store.removeItem({ productId: 'milk' }));
  assert.equal(store.items.length, 0);
  assert.equal(store.removeItem({ productId: 'bread' }), null);
});

test('quantity adjustments never fall to zero or below', () => {
  const store = new Store(fakeStorage());
  const { item } = store.addItem(milk);
  store.adjustQuantityById(item.id, -5);
  assert.ok(store.items[0].quantity > 0, 'quantity stays positive');
  assert.equal(store.items[0].quantity, 0.25);
});

test('setQuantity targets an item by product id', () => {
  const store = new Store(fakeStorage());
  store.addItem(milk);
  const updated = store.setQuantity({ productId: 'milk', quantity: 4 });
  assert.equal(updated.quantity, 4);
  assert.equal(store.setQuantity({ productId: 'bread', quantity: 2 }), null);
});

test('ticking an item off records a timestamped purchase', () => {
  const store = new Store(fakeStorage());
  const { item } = store.addItem(milk);
  store.toggleDone(item.id, true);
  assert.equal(store.state.history.counts.milk, 1);
  assert.ok(store.state.history.lastPurchased.milk > 0);
});

test('items bought in the same trip are recorded as a pairing', () => {
  const store = new Store(fakeStorage());
  const bread = store.addItem({ productId: 'bread', name: 'Bread', category: 'bakery', quantity: 1 }).item;
  const butter = store.addItem({ productId: 'butter', name: 'Butter', category: 'dairy', quantity: 1 }).item;
  store.toggleDone(bread.id, true);
  store.toggleDone(butter.id, true);
  assert.equal(store.state.history.pairs.butter.bread, 1);
  assert.equal(store.state.history.pairs.bread.butter, 1);
});

test('undo restores the previous list state', () => {
  const store = new Store(fakeStorage());
  store.addItem(milk);
  store.addItem({ productId: 'bread', name: 'Bread', category: 'bakery', quantity: 1 });
  assert.equal(store.items.length, 2);

  assert.equal(store.undo(), true);
  assert.equal(store.items.length, 1);
  assert.equal(store.items[0].productId, 'milk');
});

test('undo can unwind a clear', () => {
  const store = new Store(fakeStorage());
  store.addItem(milk);
  store.clear();
  assert.equal(store.items.length, 0);
  store.undo();
  assert.equal(store.items.length, 1);
});

test('undo reports false when there is nothing to undo', () => {
  const store = new Store(fakeStorage());
  assert.equal(store.canUndo, false);
  assert.equal(store.undo(), false);
});

test('clearing the list keeps purchase history for future suggestions', () => {
  const store = new Store(fakeStorage());
  const { item } = store.addItem(milk);
  store.toggleDone(item.id, true);
  store.clear();
  assert.equal(store.items.length, 0);
  assert.equal(store.state.history.counts.milk, 1);
});

test('clearCompleted removes only the ticked-off items', () => {
  const store = new Store(fakeStorage());
  const a = store.addItem(milk).item;
  store.addItem({ productId: 'bread', name: 'Bread', category: 'bakery', quantity: 1 });
  store.toggleDone(a.id, true);
  store.clearCompleted();
  assert.equal(store.items.length, 1);
  assert.equal(store.items[0].productId, 'bread');
});

test('state is persisted and read back', () => {
  const storage = fakeStorage();
  const store = new Store(storage);
  store.addItem(milk);
  assert.ok(storage.raw.includes('Milk'));

  const reloaded = new Store(storage);
  assert.equal(reloaded.items.length, 1);
  assert.equal(reloaded.items[0].name, 'Milk');
});

test('corrupt saved state does not break startup', () => {
  const store = new Store(fakeStorage('{not valid json'));
  assert.deepEqual(store.items, []);
});

test('a partial saved payload is merged onto a complete shape', () => {
  const store = new Store(fakeStorage(JSON.stringify({ items: [{ id: 'x', name: 'Old', category: 'other', quantity: 1 }] })));
  assert.equal(store.items.length, 1);
  assert.deepEqual(store.state.history.counts, {}, 'missing history is rebuilt');
  assert.equal(store.state.lang, 'en');
});

test('the store works with no storage at all (private browsing)', () => {
  const store = new Store(null);
  assert.doesNotThrow(() => store.addItem(milk));
  assert.equal(store.items.length, 1);
});

test('a storage that throws on write does not break the interaction', () => {
  const hostile = {
    getItem: () => null,
    setItem: () => { throw new Error('QuotaExceededError'); }
  };
  const store = new Store(hostile);
  assert.doesNotThrow(() => store.addItem(milk));
  assert.equal(store.items.length, 1);
});

test('subscribers are notified on every mutation', () => {
  const store = new Store(fakeStorage());
  let calls = 0;
  const unsubscribe = store.subscribe(() => { calls++; });
  store.addItem(milk);
  store.clear();
  assert.equal(calls, 2);
  unsubscribe();
  store.addItem(milk);
  assert.equal(calls, 2, 'unsubscribed listeners stop firing');
});

test('demo history is seeded once and only once', () => {
  const store = new Store(fakeStorage());
  assert.equal(store.seedDemoHistory(), true);
  const counts = { ...store.state.history.counts };
  assert.equal(store.seedDemoHistory(), false);
  assert.deepEqual(store.state.history.counts, counts);
});

test('reset wipes items and history', () => {
  const store = new Store(fakeStorage());
  store.seedDemoHistory();
  store.addItem(milk);
  store.reset();
  assert.equal(store.items.length, 0);
  assert.deepEqual(store.state.history.counts, {});
});
