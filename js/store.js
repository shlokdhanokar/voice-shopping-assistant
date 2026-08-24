/**
 * store.js — Application state, persistence and purchase history.
 *
 * A tiny observable store rather than a framework: the app has one state tree,
 * every mutation goes through a method here, and subscribers re-render. State
 * is persisted to localStorage so a list survives a refresh, and every
 * mutation pushes a snapshot onto an undo stack.
 *
 * Purchase history is what makes the suggestions engine useful, so ticking an
 * item off is recorded with a timestamp and a running count.
 */

const STORAGE_KEY = 'vsa.state.v2';
const UNDO_LIMIT = 25;
const DAY = 86400000;

const emptyState = () => ({
  items: [],
  history: { counts: {}, lastPurchased: {}, pairs: {} },
  lang: 'en',
  dismissed: [],
  seeded: false
});

/** Crypto-backed id with a fallback for older browsers. */
function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export class Store {
  constructor(storage = typeof localStorage !== 'undefined' ? localStorage : null) {
    this.storage = storage;
    this.state = this.#load();
    this.undoStack = [];
    this.listeners = new Set();
  }

  #load() {
    try {
      const raw = this.storage?.getItem(STORAGE_KEY);
      if (!raw) return emptyState();
      const parsed = JSON.parse(raw);
      // Merge onto a fresh shape so an older/partial payload cannot break the app.
      return { ...emptyState(), ...parsed, history: { ...emptyState().history, ...(parsed.history || {}) } };
    } catch (err) {
      console.warn('Could not read saved list, starting fresh.', err);
      return emptyState();
    }
  }

  #persist() {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (err) {
      // Quota or private-mode failures must not break the interaction.
      console.warn('Could not save list.', err);
    }
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  #emit() {
    this.#persist();
    for (const fn of this.listeners) fn(this.state);
  }

  /** Snapshot the mutable parts of state so the action can be undone. */
  #snapshot() {
    this.undoStack.push(JSON.stringify({ items: this.state.items, history: this.state.history }));
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
  }

  get items() {
    return this.state.items;
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  setLanguage(lang) {
    this.state.lang = lang;
    this.#emit();
  }

  /**
   * Adds an item, merging quantities when the same product is already listed.
   * @returns {{item:object, merged:boolean}}
   */
  addItem({ productId, name, category, quantity = 1, unit = null, source = 'voice' }) {
    this.#snapshot();
    const existing = productId
      ? this.state.items.find((i) => i.productId === productId && !i.done)
      : this.state.items.find((i) => i.name.toLowerCase() === String(name).toLowerCase() && !i.done);

    if (existing) {
      existing.quantity = Math.round((existing.quantity + quantity) * 100) / 100;
      if (unit) existing.unit = unit;
      existing.updatedAt = Date.now();
      this.#emit();
      return { item: existing, merged: true };
    }

    const item = {
      id: uid(),
      productId: productId || null,
      name,
      category: category || 'other',
      quantity,
      unit,
      done: false,
      source,
      addedAt: Date.now()
    };
    this.state.items.push(item);
    this.#emit();
    return { item, merged: false };
  }

  /** Removes by product id or, for free-text entries, by name. */
  removeItem({ productId, name }) {
    const index = this.state.items.findIndex((i) =>
      productId ? i.productId === productId : i.name.toLowerCase() === String(name).toLowerCase());
    if (index === -1) return null;
    this.#snapshot();
    const [removed] = this.state.items.splice(index, 1);
    this.#emit();
    return removed;
  }

  removeById(id) {
    const index = this.state.items.findIndex((i) => i.id === id);
    if (index === -1) return null;
    this.#snapshot();
    const [removed] = this.state.items.splice(index, 1);
    this.#emit();
    return removed;
  }

  setQuantity({ productId, name, quantity }) {
    const item = this.state.items.find((i) =>
      productId ? i.productId === productId : i.name.toLowerCase() === String(name).toLowerCase());
    if (!item) return null;
    this.#snapshot();
    item.quantity = Math.max(0.25, quantity);
    this.#emit();
    return item;
  }

  adjustQuantityById(id, delta) {
    const item = this.state.items.find((i) => i.id === id);
    if (!item) return null;
    this.#snapshot();
    item.quantity = Math.round(Math.max(0.25, item.quantity + delta) * 100) / 100;
    this.#emit();
    return item;
  }

  /**
   * Marks an item bought (or un-buys it). Buying is what feeds the history
   * used by the restock and "bought together" suggestion strategies.
   */
  toggleDone(id, done) {
    const item = this.state.items.find((i) => i.id === id);
    if (!item) return null;
    this.#snapshot();
    item.done = done === undefined ? !item.done : done;
    if (item.done) this.#recordPurchase(item);
    this.#emit();
    return item;
  }

  markDone({ productId, name }) {
    const item = this.state.items.find((i) =>
      productId ? i.productId === productId : i.name.toLowerCase() === String(name).toLowerCase());
    return item ? this.toggleDone(item.id, true) : null;
  }

  #recordPurchase(item, at = Date.now()) {
    const key = item.productId || item.name.toLowerCase();
    const h = this.state.history;
    h.counts[key] = (h.counts[key] || 0) + 1;
    h.lastPurchased[key] = at;

    // Co-occurrence: things bought in the same session tend to go together.
    const sameTrip = this.state.items.filter((i) => i.done && i !== item);
    for (const other of sameTrip) {
      const otherKey = other.productId || other.name.toLowerCase();
      h.pairs[key] = h.pairs[key] || {};
      h.pairs[key][otherKey] = (h.pairs[key][otherKey] || 0) + 1;
      h.pairs[otherKey] = h.pairs[otherKey] || {};
      h.pairs[otherKey][key] = (h.pairs[otherKey][key] || 0) + 1;
    }
  }

  /** Clears the list; purchase history is kept so suggestions still work. */
  clear() {
    this.#snapshot();
    this.state.items = [];
    this.#emit();
  }

  /** Removes only the ticked-off items, recording the shopping trip. */
  clearCompleted() {
    this.#snapshot();
    this.state.items = this.state.items.filter((i) => !i.done);
    this.#emit();
  }

  undo() {
    const snap = this.undoStack.pop();
    if (!snap) return false;
    const parsed = JSON.parse(snap);
    this.state.items = parsed.items;
    this.state.history = parsed.history;
    this.#emit();
    return true;
  }

  /** Hides a suggestion the user is not interested in, for this session onward. */
  dismissSuggestion(key) {
    if (!this.state.dismissed.includes(key)) this.state.dismissed.push(key);
    this.#emit();
  }

  /** Items grouped by category, ready for rendering. */
  grouped() {
    const groups = new Map();
    for (const item of this.state.items) {
      if (!groups.has(item.category)) groups.set(item.category, []);
      groups.get(item.category).push(item);
    }
    return groups;
  }

  /**
   * Seeds a plausible purchase history on first run so the suggestion engine
   * has something to reason about immediately. Without this, a brand-new user
   * would see an empty suggestions panel until their second shopping trip.
   */
  seedDemoHistory(now = Date.now()) {
    if (this.state.seeded) return false;
    const seed = [
      ['milk', 9, 6], ['bread', 8, 7], ['eggs', 5, 12], ['bananas', 4, 6],
      ['rice', 2, 26], ['coffee', 3, 19], ['toilet-paper', 2, 20],
      ['tomatoes', 6, 4], ['chicken', 3, 8], ['yogurt', 4, 6],
      ['toothpaste', 1, 40], ['dish-soap', 1, 28], ['onions', 3, 13]
    ];
    const h = this.state.history;
    for (const [id, count, daysAgo] of seed) {
      h.counts[id] = count;
      h.lastPurchased[id] = now - daysAgo * DAY;
    }
    // A couple of habitual pairings.
    h.pairs.bread = { butter: 4, eggs: 3, jam: 2 };
    h.pairs.milk = { cereal: 4, coffee: 3, bread: 3 };
    h.pairs.pasta = { cheese: 3, tomatoes: 3 };
    h.pairs.chicken = { onions: 3, rice: 2 };
    this.state.seeded = true;
    this.#emit();
    return true;
  }

  /** Wipes everything, including history. Used by the "reset demo" control. */
  reset() {
    this.undoStack = [];
    this.state = emptyState();
    this.#emit();
  }
}
