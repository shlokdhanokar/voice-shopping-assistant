/**
 * search.js — Voice-activated catalogue search.
 *
 * Turns a parsed command such as "find organic apples under $5" into a ranked
 * list of concrete buyable variants (brand + price), honouring price bounds and
 * quality tags. Searching brand/size/price variants rather than bare products
 * is what lets a spoken price filter mean something.
 */

import { PRODUCTS, CATEGORIES, getProduct, isOnSale, salePrice } from './catalog.js';

const MAX_RESULTS = 12;

/** Brand names known to the catalogue, for "show me Value Pick rice". */
const BRANDS = [...new Set(PRODUCTS.flatMap((p) => p.variants.map((v) => v.brand)))];

/** Loose token match of a query against a product's names and aliases. */
function matchesQuery(product, tokens) {
  if (!tokens.length) return false;
  const haystack = [
    product.name,
    product.id.replace(/-/g, ' '),
    CATEGORIES[product.category]?.label || '',
    ...Object.values(product.aliases).flat()
  ].join(' ').toLowerCase();
  return tokens.some((t) => haystack.includes(t));
}

/**
 * @param {object} parsed result from nlp.parse()
 * @param {object} [opts]
 * @returns {{results:Array, filters:object, brand:string|null, tags:string[]}}
 */
export function searchCatalog(parsed, { now = Date.now() } = {}) {
  const { filters = {}, tags = [], query = '' } = parsed || {};
  const tokens = query.split(/\s+/).map((t) => t.trim()).filter((t) => t.length > 2);

  const brand = BRANDS.find((b) => query.toLowerCase().includes(b.toLowerCase())) || null;

  // Candidate products: explicit catalogue hits from the parser first, then a
  // free-text match, then — for a pure price/tag query — the whole catalogue.
  let candidates = (parsed?.items || [])
    .map((i) => i.productId && getProduct(i.productId))
    .filter(Boolean);

  if (!candidates.length) candidates = PRODUCTS.filter((p) => matchesQuery(p, tokens));

  if (!candidates.length) {
    const hasConstraint = filters.maxPrice !== undefined || filters.minPrice !== undefined || tags.length;
    candidates = hasConstraint ? PRODUCTS : [];
  }

  const results = [];
  for (const product of candidates) {
    const onSale = isOnSale(product.id, new Date(now));
    for (const variant of product.variants) {
      if (brand && variant.brand !== brand) continue;
      if (tags.length && !tags.every((t) => variant.tags.includes(t))) continue;

      const price = onSale ? Math.round(variant.price * 0.8 * 100) / 100 : variant.price;
      if (filters.maxPrice !== undefined && price > filters.maxPrice) continue;
      if (filters.minPrice !== undefined && price < filters.minPrice) continue;

      results.push({
        productId: product.id,
        name: product.name,
        category: product.category,
        unit: product.unit,
        brand: variant.brand,
        price,
        wasPrice: onSale ? variant.price : null,
        onSale,
        tags: variant.tags
      });
    }
  }

  results.sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));
  return {
    results: results.slice(0, MAX_RESULTS),
    total: results.length,
    filters,
    tags,
    brand,
    query
  };
}

/** Human-readable description of the filters applied, for the results header. */
export function describeSearch({ query, filters = {}, tags = [], brand }) {
  const parts = [];
  if (tags.length) parts.push(tags.join(' + '));
  if (query) parts.push(query);
  if (brand) parts.push(`by ${brand}`);
  if (filters.minPrice !== undefined && filters.maxPrice !== undefined) {
    parts.push(`$${filters.minPrice}–$${filters.maxPrice}`);
  } else if (filters.maxPrice !== undefined) {
    parts.push(`under $${filters.maxPrice}`);
  } else if (filters.minPrice !== undefined) {
    parts.push(`over $${filters.minPrice}`);
  }
  return parts.join(' · ') || 'everything';
}

/** Total price of the current list, using sale prices where they apply. */
export function estimateTotal(items, now = Date.now()) {
  let total = 0;
  for (const item of items) {
    const product = item.productId ? getProduct(item.productId) : null;
    if (!product) continue;
    const unit = isOnSale(product.id, new Date(now)) ? salePrice(product) : product.price;
    total += unit * (item.quantity || 1);
  }
  return Math.round(total * 100) / 100;
}
