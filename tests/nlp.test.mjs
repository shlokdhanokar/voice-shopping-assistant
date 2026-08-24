/**
 * Tests for the NLP layer — intent detection, quantities, units, price
 * filters, multi-item commands and all four supported languages.
 *
 * Run with:  node --test tests/
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, normalize, detectIntent, extractPriceFilter, findProducts } from '../js/nlp.js';

/** Convenience: first item's product id. */
const firstId = (result) => result.items[0]?.productId;

test('normalize lowercases, strips punctuation and keeps Devanagari marks', () => {
  assert.equal(normalize('  Add MILK, please!  '), 'add milk please');
  assert.equal(normalize('दूध जोड़ो'), 'दूध जोड़ो');
  assert.equal(normalize('under ₹5'), 'under $5');
  assert.equal(normalize('५ अंडे'), '5 अंडे');
  assert.equal(normalize(null), '');
});

test('detects the add intent across varied English phrasings', () => {
  const phrasings = [
    'add milk',
    'I need apples',
    'I want to buy bananas',
    'add bananas to my list',
    'get me some bread',
    'grab a bottle of water',
    'pick up eggs',
    "don't forget the coffee",
    'put rice on my list'
  ];
  for (const phrase of phrasings) {
    assert.equal(parse(phrase).intent, 'add', `expected add for "${phrase}"`);
  }
});

test('add commands resolve the right catalogue product', () => {
  assert.equal(firstId(parse('add milk')), 'milk');
  assert.equal(firstId(parse('I need apples')), 'apples');
  assert.equal(firstId(parse('I want to buy bananas')), 'bananas');
});

test('longest alias wins so qualified products beat their base word', () => {
  assert.equal(firstId(parse('add almond milk')), 'almond-milk');
  assert.equal(firstId(parse('add orange juice')), 'orange-juice');
  assert.equal(firstId(parse('add whole wheat bread')), 'whole-wheat-bread');
  assert.equal(firstId(parse('add sweet potatoes')), 'sweet-potatoes');
});

test('extracts numeric quantities and units', () => {
  const water = parse('Add 2 bottles of water');
  assert.equal(water.items[0].productId, 'water');
  assert.equal(water.items[0].quantity, 2);
  assert.equal(water.items[0].unit, 'bottle');

  const oranges = parse('Buy 5 oranges');
  assert.equal(oranges.items[0].quantity, 5);
  assert.equal(oranges.items[0].unit, null);

  const rice = parse('add 2 kg rice');
  assert.equal(rice.items[0].quantity, 2);
  assert.equal(rice.items[0].unit, 'kg');
});

test('understands spelled-out numbers and bare units', () => {
  assert.equal(parse('add three apples').items[0].quantity, 3);
  assert.equal(parse('buy a dozen eggs').items[0].unit, 'dozen');
  assert.equal(parse('add half kg tomatoes').items[0].quantity, 0.5);
  assert.equal(parse('add a couple of lemons').items[0].quantity, 2);
});

test('quantity defaults to 1 and is flagged as unspecified', () => {
  const result = parse('add milk');
  assert.equal(result.items[0].quantity, 1);
  assert.equal(result.items[0].quantitySpecified, false);
});

test('handles several items in one utterance with their own quantities', () => {
  const result = parse('add 2 bottles of water and 5 oranges');
  assert.equal(result.items.length, 2);
  assert.deepEqual(result.items.map((i) => i.productId), ['water', 'oranges']);
  assert.equal(result.items[0].quantity, 2);
  assert.equal(result.items[1].quantity, 5);
});

test('preserves the order items were spoken in', () => {
  const result = parse('add bread, milk and eggs');
  assert.deepEqual(result.items.map((i) => i.productId), ['bread', 'milk', 'eggs']);
});

test('detects remove intent and its variants', () => {
  for (const phrase of [
    'remove milk from my list',
    'delete the bread',
    'take eggs off my list',
    "I don't need coffee",
    'get rid of the chips'
  ]) {
    assert.equal(parse(phrase).intent, 'remove', `expected remove for "${phrase}"`);
  }
  assert.equal(firstId(parse('Remove milk from my list')), 'milk');
});

test('clear beats remove when the whole list is targeted', () => {
  assert.equal(parse('clear my list').intent, 'clear');
  assert.equal(parse('remove everything').intent, 'clear');
  assert.equal(parse('empty my cart').intent, 'clear');
});

test('update intent reads the quantity that follows the item', () => {
  const result = parse('change milk to 3');
  assert.equal(result.intent, 'update');
  assert.equal(result.items[0].productId, 'milk');
  assert.equal(result.items[0].quantity, 3);
});

test('complete intent marks things already bought', () => {
  const result = parse('I already bought bread');
  assert.equal(result.intent, 'complete');
  assert.equal(result.items[0].productId, 'bread');
});

test('search intent with a qualifier tag', () => {
  const result = parse('Find me organic apples');
  assert.equal(result.intent, 'search');
  assert.equal(result.items[0].productId, 'apples');
  assert.deepEqual(result.tags, ['organic']);
});

test('search intent with a maximum price', () => {
  const result = parse('Find toothpaste under $5');
  assert.equal(result.intent, 'search');
  assert.equal(result.items[0].productId, 'toothpaste');
  assert.equal(result.filters.maxPrice, 5);
});

test('price filters cover under / over / between and bare currency words', () => {
  assert.equal(parse('find rice less than 8 dollars').filters.maxPrice, 8);
  assert.equal(parse('find cheese over $4').filters.minPrice, 4);

  const range = parse('find shampoo between 5 and 9');
  assert.equal(range.filters.minPrice, 5);
  assert.equal(range.filters.maxPrice, 9);
});

test('extractPriceFilter removes the phrase from the working text', () => {
  const { filters, text } = extractPriceFilter('find toothpaste under $5');
  assert.equal(filters.maxPrice, 5);
  assert.ok(!text.includes('under'), 'price phrase should be blanked out');
  assert.ok(text.includes('toothpaste'), 'the product must survive');
});

test('undo and help are recognised', () => {
  assert.equal(parse('undo').intent, 'undo');
  assert.equal(parse('never mind').intent, 'undo');
  assert.equal(parse('help').intent, 'help');
  assert.equal(parse('what can you do').intent, 'help');
});

test('unknown items are still captured as free text rather than dropped', () => {
  const result = parse('add dragon fruit');
  assert.equal(result.intent, 'add');
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].productId, null);
  assert.equal(result.items[0].name, 'Dragon Fruit');
  assert.equal(result.items[0].category, 'other');
  assert.ok(result.confidence < 0.92, 'free-text matches should be less confident');
});

test('a bounded fuzzy pass recovers common mis-recognitions', () => {
  assert.equal(firstId(parse('add bred')), 'bread');
  assert.equal(firstId(parse('add chese')), 'cheese');
});

test('empty and nonsense input degrade gracefully', () => {
  const blank = parse('');
  assert.equal(blank.intent, 'unknown');
  assert.equal(blank.items.length, 0);
  assert.equal(blank.confidence, 0);

  assert.doesNotThrow(() => parse(undefined));
  assert.doesNotThrow(() => parse(12345));
});

test('an item with no command verb is treated as an add', () => {
  const result = parse('milk');
  assert.equal(result.intent, 'add');
  assert.equal(result.items[0].productId, 'milk');
});

// ------------------------------------------------------------ languages ----

test('Hindi commands are understood', () => {
  assert.equal(parse('दूध जोड़ो', 'hi').intent, 'add');
  assert.equal(firstId(parse('दूध जोड़ो', 'hi')), 'milk');

  const qty = parse('2 लीटर दूध चाहिए', 'hi');
  assert.equal(qty.items[0].quantity, 2);
  assert.equal(qty.items[0].unit, 'litre');

  assert.equal(parse('ब्रेड हटाओ', 'hi').intent, 'remove');
  assert.equal(parse('सेब ढूंढो', 'hi').intent, 'search');
  assert.equal(firstId(parse('मुझे 5 अंडे चाहिए', 'hi')), 'eggs');
});

test('Spanish commands are understood', () => {
  assert.equal(parse('Añade leche', 'es').intent, 'add');
  assert.equal(firstId(parse('Añade leche', 'es')), 'milk');
  assert.equal(parse('Quita el pan', 'es').intent, 'remove');
  assert.equal(firstId(parse('Necesito manzanas', 'es')), 'apples');
  assert.equal(parse('Busca pasta de dientes menos de 5', 'es').filters.maxPrice, 5);
});

test('French commands are understood', () => {
  assert.equal(parse("J'ai besoin de lait", 'fr').intent, 'add');
  assert.equal(firstId(parse("J'ai besoin de lait", 'fr')), 'milk');
  assert.equal(parse('Enlève le pain', 'fr').intent, 'remove');
  assert.equal(parse('Trouve du dentifrice moins de 5', 'fr').filters.maxPrice, 5);
  assert.equal(firstId(parse('Achète 5 oranges', 'fr')), 'oranges');
});

test('the parser falls back to other languages if the selector is wrong', () => {
  // User left the selector on English but spoke Hindi.
  const result = parse('दूध जोड़ो', 'en');
  assert.equal(result.intent, 'add');
  assert.equal(result.items[0].productId, 'milk');
  assert.equal(result.lang, 'hi');
});

test('detectIntent reports which phrase triggered the match', () => {
  const { intent, trigger } = detectIntent('please add milk', 'en');
  assert.equal(intent, 'add');
  assert.equal(trigger, 'add');
});

test('findProducts blanks matches so they cannot be double-counted', () => {
  const { matches, text } = findProducts('milk and milk');
  assert.equal(matches.length, 2);
  assert.ok(!text.includes('milk'));
});
