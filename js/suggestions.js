/**
 * suggestions.js — The "smart" half of the assistant.
 *
 * Four independent strategies each propose candidates with a score and a
 * human-readable reason; the results are merged, de-duplicated and ranked.
 * Keeping them separate means a strategy can be tuned or removed without
 * touching the others, and every suggestion can explain itself to the user —
 * which matters far more than raw accuracy for trust.
 *
 *   restock   — time since last purchase vs. the item's typical restock cycle
 *   pairing   — co-occurrence with what is already on the list
 *   seasonal  — peak-season produce, plus this week's promotions
 *   habit     — most frequently purchased items not currently listed
 */

import { PRODUCTS, getProduct, seasonalProducts, isOnSale, salePrice } from './catalog.js';

const DAY = 86400000;
const MAX_SUGGESTIONS = 8;

/** How many suggestions each strategy may contribute to one panel. */
const TYPE_QUOTA = { restock: 4, pairing: 3, habit: 3, seasonal: 2, sale: 2 };

/** Keys already on the list, so we never suggest something twice. */
function listedKeys(items) {
  return new Set(items.filter((i) => !i.done).map((i) => i.productId || i.name.toLowerCase()));
}

/** "Running low on bread" — the headline feature of the brief. */
function restockSuggestions(state, now) {
  const out = [];
  const listed = listedKeys(state.items);
  for (const [key, lastAt] of Object.entries(state.history.lastPurchased || {})) {
    const product = getProduct(key);
    if (!product || listed.has(key)) continue;
    const daysSince = (now - lastAt) / DAY;
    const ratio = daysSince / product.restockDays;
    if (ratio < 0.8) continue;
    const days = Math.round(daysSince);
    out.push({
      type: 'restock',
      productId: product.id,
      name: product.name,
      score: 2.4 + Math.min(ratio, 2.5),
      reason: `Running low — last bought ${days} day${days === 1 ? '' : 's'} ago`
    });
  }
  return out;
}

/** "You usually buy butter with bread." */
function pairingSuggestions(state) {
  const out = [];
  const listed = listedKeys(state.items);
  const pairs = state.history.pairs || {};
  const scores = new Map();

  for (const key of listed) {
    const partners = pairs[key];
    if (!partners) continue;
    for (const [partnerKey, count] of Object.entries(partners)) {
      if (listed.has(partnerKey) || !getProduct(partnerKey)) continue;
      const prev = scores.get(partnerKey);
      if (!prev || count > prev.count) scores.set(partnerKey, { count, withKey: key });
    }
  }

  for (const [key, { count, withKey }] of scores) {
    const product = getProduct(key);
    const partner = getProduct(withKey);
    out.push({
      type: 'pairing',
      productId: product.id,
      name: product.name,
      score: 1.8 + Math.min(count, 5) * 0.15,
      reason: `You usually buy this with ${partner ? partner.name.toLowerCase() : withKey}`
    });
  }
  return out;
}

/** Peak-season produce and the current week's promotions. */
function seasonalSuggestions(state, now) {
  const out = [];
  const listed = listedKeys(state.items);
  const monthName = new Date(now).toLocaleString('en', { month: 'long' });

  for (const product of seasonalProducts(new Date(now).getMonth() + 1)) {
    if (listed.has(product.id)) continue;
    out.push({
      type: 'seasonal',
      productId: product.id,
      name: product.name,
      score: 1.5,
      reason: `In season this month — peak ${monthName.toLowerCase()} pick`
    });
  }

  for (const product of PRODUCTS) {
    if (listed.has(product.id) || !isOnSale(product.id, new Date(now))) continue;
    out.push({
      type: 'sale',
      productId: product.id,
      name: product.name,
      score: 1.35,
      reason: `On sale this week — $${salePrice(product).toFixed(2)} (was $${product.price.toFixed(2)})`
    });
  }
  return out;
}

/** Long-run favourites that are missing from today's list. */
function habitSuggestions(state) {
  const out = [];
  const listed = listedKeys(state.items);
  const counts = Object.entries(state.history.counts || {})
    .filter(([key]) => getProduct(key) && !listed.has(key))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  for (const [key, count] of counts) {
    const product = getProduct(key);
    out.push({
      type: 'habit',
      productId: product.id,
      name: product.name,
      score: 1 + Math.min(count, 10) * 0.05,
      reason: `You have bought this ${count} times`
    });
  }
  return out;
}

/**
 * Runs every strategy and returns a ranked, de-duplicated shortlist.
 * @param {object} state the store state
 * @param {number} now   injectable clock, so the behaviour is testable
 */
export function buildSuggestions(state, now = Date.now()) {
  const all = [
    ...restockSuggestions(state, now),
    ...pairingSuggestions(state),
    ...seasonalSuggestions(state, now),
    ...habitSuggestions(state)
  ];

  const dismissed = new Set(state.dismissed || []);
  const best = new Map();
  for (const s of all) {
    if (dismissed.has(s.productId)) continue;
    const prev = best.get(s.productId);
    if (!prev || s.score > prev.score) best.set(s.productId, s);
  }

  const ranked = [...best.values()].sort((a, b) => b.score - a.score);

  // Quotas keep the panel varied. Without them a month with a lot of seasonal
  // produce fills every slot and drowns out the personal signals, which are
  // the ones the user actually finds useful.
  const picked = [];
  const used = {};
  for (const s of ranked) {
    if (picked.length >= MAX_SUGGESTIONS) break;
    if ((used[s.type] || 0) >= (TYPE_QUOTA[s.type] ?? MAX_SUGGESTIONS)) continue;
    used[s.type] = (used[s.type] || 0) + 1;
    picked.push(s);
  }
  // If the quotas left room, top up with the next best of any type.
  const chosen = new Set(picked);
  for (const s of ranked) {
    if (picked.length >= MAX_SUGGESTIONS) break;
    if (!chosen.has(s)) picked.push(s);
  }

  return picked
    .map((s) => {
      const product = getProduct(s.productId);
      const onSale = isOnSale(s.productId, new Date(now));
      return {
        ...s,
        key: s.productId,
        category: product.category,
        unit: product.unit,
        price: onSale ? salePrice(product) : product.price,
        onSale
      };
    });
}

/**
 * Alternatives for a product — used both for "we're out of X" and for the
 * gentler "prefer almond milk?" nudge shown when an item is added.
 *
 * @param {string} productId
 * @param {object} [opts]
 * @param {string[]} [opts.exclude] product ids already on the list
 * @param {number} [opts.limit]
 */
export function substitutesFor(productId, { exclude = [], limit = 3, now = Date.now() } = {}) {
  const product = getProduct(productId);
  if (!product) return [];
  const skip = new Set([productId, ...exclude]);

  const direct = product.substitutes.filter((id) => !skip.has(id));

  // If the catalogue has no explicit alternatives, fall back to the same
  // category at a similar price point.
  const fallback = direct.length
    ? []
    : PRODUCTS
      .filter((p) => p.category === product.category && !skip.has(p.id))
      .sort((a, b) => Math.abs(a.price - product.price) - Math.abs(b.price - product.price))
      .map((p) => p.id);

  return [...direct, ...fallback].slice(0, limit).map((id) => {
    const sub = getProduct(id);
    const onSale = isOnSale(id, new Date(now));
    const price = onSale ? salePrice(sub) : sub.price;
    const diff = price - product.price;
    return {
      productId: sub.id,
      name: sub.name,
      category: sub.category,
      unit: sub.unit,
      price,
      onSale,
      tags: sub.tags,
      reason: onSale
        ? `On sale — $${price.toFixed(2)}`
        : diff <= -0.2
          ? `Cheaper by $${Math.abs(diff).toFixed(2)}`
          : sub.tags.length
            ? sub.tags.slice(0, 2).join(', ')
            : 'Similar alternative'
    };
  });
}
