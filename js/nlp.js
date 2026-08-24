/**
 * nlp.js — Rule-based natural-language understanding for shopping commands.
 *
 * Deliberately dependency-free and fully local: it runs offline, costs nothing
 * per request and returns in well under a millisecond, which matters because it
 * sits directly in the voice feedback loop.
 *
 * The pipeline is:
 *   normalise → detect intent → strip price filters → strip qualifier tags →
 *   locate products (longest alias first, with a bounded fuzzy fallback) →
 *   attach quantity/unit to each product → free-text fallback.
 *
 * parse() always returns a well-formed result; an unparseable utterance comes
 * back as intent `unknown` with a confidence of 0 rather than throwing.
 */

import { ALIAS_INDEX, getProduct } from './catalog.js';
import {
  LEXICON, INTENT_PRIORITY, UNIT_LOOKUP, NUMBER_WORDS, TAG_PHRASES, CONNECTORS
} from './lexicon.js';

const DEVANAGARI_DIGITS = '०१२३४५६७८९';
// Includes \p{M} so Devanagari combining vowel marks count as part of a word.
const LETTER_OR_DIGIT = /[\p{L}\p{M}\p{N}]/u;

/** Words that may sit between a quantity and its product ("2 bottles of water"). */
const QTY_GLUE = new Set(['of', 'de', 'du', 'des', 'd', 'ka', 'ki', 'ke', 'का', 'की', 'के']);

/**
 * Lower-cases, converts Devanagari digits to ASCII, normalises currency symbols
 * and strips punctuation that carries no meaning for us.
 */
export function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)))
    .replace(/[₹€£¥]/g, '$')
    .replace(/[,;:!?"“”()]/g, ' ')
    .replace(/[’`]/g, "'")
    .replace(/[^\p{L}\p{M}\p{N}$.'\-\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Compiled intent matchers, built once per language on first use. */
const intentCache = new Map();
function intentMatchers(langKey) {
  if (!intentCache.has(langKey)) {
    const pack = LEXICON[langKey];
    const compiled = {};
    for (const intent of INTENT_PRIORITY) {
      const patterns = (pack?.intents?.[intent]) || [];
      compiled[intent] = patterns.map((p) => new RegExp(p, 'iu'));
    }
    intentCache.set(langKey, compiled);
  }
  return intentCache.get(langKey);
}

/**
 * Finds the intent and the span of text that triggered it.
 * Falls back to scanning every other language pack, so a Hindi phrase still
 * works if the user forgot to switch the language selector.
 */
export function detectIntent(text, langKey = 'en') {
  const order = [langKey, ...Object.keys(LEXICON).filter((k) => k !== langKey)];
  for (const key of order) {
    const matchers = intentMatchers(key);
    for (const intent of INTENT_PRIORITY) {
      for (const re of matchers[intent]) {
        const m = text.match(re);
        if (m) return { intent, trigger: m[0], index: m.index, lang: key };
      }
    }
  }
  return { intent: 'unknown', trigger: '', index: -1, lang: langKey };
}

/** Blanks out a span while preserving string offsets of everything else. */
function blank(text, start, length) {
  return text.slice(0, start) + ' '.repeat(length) + text.slice(start + length);
}

/**
 * Extracts price constraints such as "under $5", "between 2 and 6 dollars" or
 * the Hindi postfix form "5 से कम", and blanks them out of the working text.
 */
export function extractPriceFilter(text, langKey = 'en') {
  const filters = {};
  let working = text;
  const NUM = '\\$?\\s*(\\d+(?:\\.\\d+)?)';
  const packs = [LEXICON[langKey], ...Object.values(LEXICON)].filter(Boolean);

  const apply = (re, handler) => {
    const m = working.match(re);
    if (m) {
      handler(m);
      working = blank(working, m.index, m[0].length);
      return true;
    }
    return false;
  };

  for (const pack of packs) {
    const pf = pack.priceFilters || {};
    for (const phrase of pf.range || []) {
      apply(
        new RegExp(`${escapeRe(phrase)}\\s*${NUM}\\s*(?:and|to|y|et|और|-)\\s*${NUM}`, 'iu'),
        (m) => { filters.minPrice = parseFloat(m[1]); filters.maxPrice = parseFloat(m[2]); }
      );
    }
    if (filters.maxPrice === undefined) {
      for (const phrase of pf.max || []) {
        // Prefix form ("under $5") and postfix form ("$5 से कम").
        if (apply(new RegExp(`${escapeRe(phrase)}\\s*${NUM}`, 'iu'), (m) => { filters.maxPrice = parseFloat(m[1]); })) break;
        if (apply(new RegExp(`${NUM}\\s*${escapeRe(phrase)}`, 'iu'), (m) => { filters.maxPrice = parseFloat(m[1]); })) break;
      }
    }
    if (filters.minPrice === undefined) {
      for (const phrase of pf.min || []) {
        if (apply(new RegExp(`${escapeRe(phrase)}\\s*${NUM}`, 'iu'), (m) => { filters.minPrice = parseFloat(m[1]); })) break;
        if (apply(new RegExp(`${NUM}\\s*${escapeRe(phrase)}`, 'iu'), (m) => { filters.minPrice = parseFloat(m[1]); })) break;
      }
    }
  }

  // Bare currency words left over ("dollars", "rupees") carry no further meaning.
  working = working.replace(/\b(dollars?|bucks?|rupees?|rs|euros?|pesos?|रुपये|रुपए)\b/giu, ' ');
  return { filters, text: working };
}

/** Detects qualifiers like "organic" or "gluten free" and blanks them out. */
export function extractTags(text) {
  const tags = [];
  let working = text;
  for (const [tag, phrases] of Object.entries(TAG_PHRASES)) {
    for (const phrase of phrases) {
      const re = new RegExp(`(^|\\s)${escapeRe(phrase)}(?=\\s|$)`, 'iu');
      const m = working.match(re);
      if (m) {
        tags.push(tag);
        working = blank(working, m.index, m[0].length);
        break;
      }
    }
  }
  return { tags, text: working };
}

/** True when the character at `i` is not part of a word (Unicode-aware). */
const isBoundary = (text, i) => i < 0 || i >= text.length || !LETTER_OR_DIGIT.test(text[i]);

/** Whole-phrase indexOf that respects Unicode word boundaries. */
function findPhrase(haystack, phrase) {
  let from = 0;
  while (from <= haystack.length - phrase.length) {
    const i = haystack.indexOf(phrase, from);
    if (i === -1) return -1;
    if (isBoundary(haystack, i - 1) && isBoundary(haystack, i + phrase.length)) return i;
    from = i + 1;
  }
  return -1;
}

/** Levenshtein distance, short-circuited at `max` for speed. */
function editDistance(a, b, max = 1) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      best = Math.min(best, curr[j]);
    }
    if (best > max) return max + 1;
    prev = curr;
  }
  return prev[b.length];
}

/** Single-word aliases, used only by the fuzzy fallback. */
const SINGLE_WORD_ALIASES = ALIAS_INDEX.filter((a) => !a.phrase.includes(' ') && a.phrase.length >= 4);

/**
 * Locates every product mentioned in `text`, longest alias first so that
 * "almond milk" beats "milk". Returns matches sorted by position, with the
 * matched spans blanked out of the returned text.
 */
export function findProducts(text) {
  let working = text;
  const matches = [];

  for (const { phrase, id } of ALIAS_INDEX) {
    let index = findPhrase(working, phrase);
    while (index !== -1) {
      matches.push({ id, index, length: phrase.length, phrase, exact: true });
      working = blank(working, index, phrase.length);
      index = findPhrase(working, phrase);
    }
  }

  // Bounded fuzzy pass for mis-recognised words ("brad" -> "bread").
  if (matches.length === 0) {
    const tokenRe = /[\p{L}\p{M}\p{N}'-]+/gu;
    for (const tok of working.matchAll(tokenRe)) {
      const word = tok[0];
      if (word.length < 4) continue;
      const hit = SINGLE_WORD_ALIASES.find((a) => editDistance(word, a.phrase, 1) <= 1);
      if (hit) {
        matches.push({ id: hit.id, index: tok.index, length: word.length, phrase: word, exact: false });
        working = blank(working, tok.index, word.length);
        break;
      }
    }
  }

  matches.sort((a, b) => a.index - b.index);
  return { matches, text: working };
}

/**
 * Reads a quantity and unit out of the words immediately preceding a product
 * mention: "2 bottles of water", "a dozen eggs", "half kg tomatoes".
 */
function quantityBefore(window) {
  const tokens = window.split(/\s+/).filter(Boolean);
  let unit = null;
  let quantity = null;
  let i = tokens.length - 1;

  while (i >= 0 && QTY_GLUE.has(tokens[i])) i--;
  if (i >= 0 && UNIT_LOOKUP.has(tokens[i])) { unit = UNIT_LOOKUP.get(tokens[i]); i--; }
  while (i >= 0 && QTY_GLUE.has(tokens[i])) i--;

  if (i >= 0) {
    const tok = tokens[i];
    if (/^\d+(\.\d+)?$/.test(tok)) quantity = parseFloat(tok);
    else if (Object.prototype.hasOwnProperty.call(NUMBER_WORDS, tok)) quantity = NUMBER_WORDS[tok];
  }
  // "a dozen eggs" — the unit alone implies a single unit of it.
  if (quantity === null && unit) quantity = 1;
  return { quantity, unit };
}

/** First number appearing after `index`, used by "change milk to 3". */
function quantityAfter(text, index) {
  const tail = text.slice(index);
  const digit = tail.match(/\b(\d+(?:\.\d+)?)\b/);
  if (digit) return parseFloat(digit[1]);
  for (const tok of tail.split(/\s+/)) {
    if (Object.prototype.hasOwnProperty.call(NUMBER_WORDS, tok)) return NUMBER_WORDS[tok];
  }
  return null;
}

/** Cleans leftover text into a usable free-text item name. */
function cleanupFreeText(text, langKey, trigger) {
  let out = text;
  if (trigger) out = out.replace(trigger, ' ');
  const stop = new Set([
    ...(LEXICON[langKey]?.stopwords || []),
    ...CONNECTORS,
    ...QTY_GLUE,
    ...UNIT_LOOKUP.keys(),
    ...Object.keys(NUMBER_WORDS)
  ]);
  const words = out
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w && !stop.has(w) && !/^\d+(\.\d+)?$/.test(w) && !/^\$/.test(w));
  return words.join(' ').trim();
}

const titleCase = (s) => s.replace(/\b\p{L}/gu, (c) => c.toUpperCase());

/**
 * Parses a raw transcript into a structured command.
 *
 * @param {string} transcript raw text from speech recognition or typing
 * @param {string} langKey    'en' | 'hi' | 'es' | 'fr'
 * @returns {{intent:string, items:Array, filters:object, tags:string[],
 *            query:string, confidence:number, raw:string, lang:string}}
 */
export function parse(transcript, langKey = 'en') {
  const raw = String(transcript ?? '');
  const normalized = normalize(raw);
  const base = {
    intent: 'unknown', items: [], filters: {}, tags: [],
    query: '', confidence: 0, raw, normalized, lang: langKey
  };
  if (!normalized) return base;

  const { intent, trigger, lang } = detectIntent(normalized, langKey);

  // Order matters: prices are stripped first so their digits cannot be read as
  // quantities, then products, then tags. Tags must come *after* products,
  // because qualifiers like "whole wheat" are part of some product names.
  const priced = extractPriceFilter(normalized, lang);
  const scanText = priced.text;
  const found = findProducts(scanText);
  const tagged = extractTags(found.text);

  const items = [];
  let cursor = 0;
  for (const match of found.matches) {
    const product = getProduct(match.id);
    if (!product) continue;
    const window = scanText.slice(cursor, match.index);
    let { quantity, unit } = quantityBefore(window);
    if (quantity === null && intent === 'update') {
      quantity = quantityAfter(scanText, match.index + match.length);
    }
    items.push({
      productId: product.id,
      name: product.name,
      category: product.category,
      quantity: quantity === null ? 1 : quantity,
      quantitySpecified: quantity !== null,
      unit: unit || null,
      matchedPhrase: match.phrase,
      exact: match.exact
    });
    cursor = match.index + match.length;
  }

  // Nothing in the catalogue matched: keep whatever the user actually said so
  // the item is still captured rather than silently dropped.
  const leftover = cleanupFreeText(tagged.text, lang, trigger);
  if (items.length === 0 && leftover && intent !== 'clear' && intent !== 'help' && intent !== 'undo') {
    const firstWord = leftover.split(' ')[0];
    const at = scanText.indexOf(firstWord);
    const { quantity, unit } = quantityBefore(at > 0 ? scanText.slice(0, at) : '');
    items.push({
      productId: null,
      name: titleCase(leftover),
      category: 'other',
      quantity: quantity === null ? 1 : quantity,
      quantitySpecified: quantity !== null,
      unit: unit || null,
      matchedPhrase: leftover,
      exact: false
    });
  }

  let confidence = 0;
  if (intent === 'unknown') confidence = items.length ? 0.4 : 0;
  else if (items.length === 0) confidence = ['clear', 'help', 'undo'].includes(intent) ? 0.95 : 0.35;
  else confidence = found.matches.some((m) => m.exact) ? 0.92 : 0.6;

  return {
    ...base,
    intent: intent === 'unknown' && items.length ? 'add' : intent,
    items,
    filters: priced.filters,
    tags: tagged.tags,
    query: leftover,
    confidence,
    lang
  };
}
