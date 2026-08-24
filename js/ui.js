/**
 * ui.js — All DOM rendering.
 *
 * Kept strictly separate from the logic modules: this file never decides
 * anything, it only draws state and reports clicks back through callbacks.
 * Nodes are built with createElement/textContent rather than innerHTML, so a
 * spoken item name can never be interpreted as markup.
 */

import { CATEGORIES, getProduct, isOnSale, salePrice } from './catalog.js';
import { LANGUAGES, UI_TEXT } from './lexicon.js';
import { describeSearch } from './search.js';

/** Example commands shown in the "What can I say?" drawer. */
const EXAMPLES = {
  en: [
    'Add milk', 'I need apples and bread', 'Add 2 bottles of water',
    'Buy 5 oranges', 'Remove milk from my list', 'Change bread to 3',
    'Find me organic apples', 'Find toothpaste under $5',
    'I already bought eggs', 'Clear my list', 'Undo'
  ],
  hi: [
    'दूध जोड़ो', 'मुझे सेब और ब्रेड चाहिए', '2 लीटर दूध चाहिए',
    '5 अंडे खरीदो', 'ब्रेड हटाओ', 'सेब ढूंढो',
    'टूथपेस्ट 5 से कम', 'सब हटा दो'
  ],
  es: [
    'Añade leche', 'Necesito manzanas y pan', 'Compra 5 naranjas',
    'Quita el pan', 'Busca manzanas orgánicas', 'Busca pasta de dientes menos de 5',
    'Borra la lista'
  ],
  fr: [
    "J'ai besoin de lait", 'Ajoute des pommes et du pain', 'Achète 5 oranges',
    'Enlève le pain', 'Trouve des pommes bio', 'Trouve du dentifrice moins de 5',
    'Vide la liste'
  ]
};

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const money = (n) => `$${Number(n).toFixed(2)}`;

/** Formats "2 bottles" / "1.5 kg" / "3" for the quantity pill. */
export function formatQuantity(item) {
  const qty = Number.isInteger(item.quantity) ? item.quantity : item.quantity.toFixed(2).replace(/0$/, '');
  if (!item.unit) return String(qty);
  const plural = item.quantity !== 1 && !['kg', 'g', 'ml', 'litre'].includes(item.unit) ? 's' : '';
  return `${qty} ${item.unit}${plural}`;
}

export class UI {
  /** @param {object} handlers callbacks supplied by app.js */
  constructor(handlers = {}) {
    this.handlers = handlers;
    this.lang = 'en';
    this.recentlyAdded = new Set();
    this.pendingSubs = new Map(); // itemId -> substitute offers

    this.dom = {
      micBtn: document.getElementById('mic-btn'),
      micStatus: document.getElementById('mic-status'),
      transcript: document.getElementById('transcript'),
      feedback: document.getElementById('feedback'),
      list: document.getElementById('list'),
      suggestions: document.getElementById('suggestions'),
      searchPanel: document.getElementById('search-panel'),
      searchResults: document.getElementById('search-results'),
      searchSummary: document.getElementById('search-summary'),
      closeSearch: document.getElementById('close-search'),
      countBadge: document.getElementById('count-badge'),
      totalValue: document.getElementById('total-value'),
      langSelect: document.getElementById('lang-select'),
      muteBtn: document.getElementById('mute-btn'),
      textForm: document.getElementById('text-form'),
      textInput: document.getElementById('text-input'),
      undoBtn: document.getElementById('undo-btn'),
      clearDoneBtn: document.getElementById('clear-done-btn'),
      resetBtn: document.getElementById('reset-btn'),
      errorBanner: document.getElementById('error-banner'),
      errorText: document.getElementById('error-text'),
      errorAction: document.getElementById('error-action'),
      errorDismiss: document.getElementById('error-dismiss'),
      examplesList: document.getElementById('examples-list'),
      tagline: document.getElementById('tagline')
    };

    this.#wireStaticControls();
    this.#buildLanguageSelect();
  }

  #wireStaticControls() {
    const d = this.dom;
    d.micBtn.addEventListener('click', () => this.handlers.onMicToggle?.());
    d.textForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const value = d.textInput.value.trim();
      if (!value) return;
      d.textInput.value = '';
      this.handlers.onTextCommand?.(value);
    });
    d.langSelect.addEventListener('change', () => this.handlers.onLanguageChange?.(d.langSelect.value));
    d.muteBtn.addEventListener('click', () => this.handlers.onMuteToggle?.());
    d.undoBtn.addEventListener('click', () => this.handlers.onUndo?.());
    d.clearDoneBtn.addEventListener('click', () => this.handlers.onClearCompleted?.());
    d.resetBtn.addEventListener('click', () => this.handlers.onReset?.());
    d.closeSearch.addEventListener('click', () => this.hideSearch());
    d.errorDismiss.addEventListener('click', () => this.hideError());
  }

  #buildLanguageSelect() {
    for (const lang of LANGUAGES) {
      const option = el('option', null, `${lang.flag} ${lang.label}`);
      option.value = lang.key;
      this.dom.langSelect.appendChild(option);
    }
  }

  /** Applies translated chrome when the command language changes. */
  setLanguage(langKey) {
    this.lang = langKey;
    const text = UI_TEXT[langKey] || UI_TEXT.en;
    this.dom.langSelect.value = langKey;
    this.dom.tagline.textContent = text.tagline;
    this.dom.micStatus.textContent = text.idle;
    this.dom.examplesList.replaceChildren(
      ...(EXAMPLES[langKey] || EXAMPLES.en).map((example) => {
        const li = el('li');
        const btn = el('button', 'text-btn', `“${example}”`);
        btn.type = 'button';
        btn.addEventListener('click', () => this.handlers.onTextCommand?.(example));
        li.appendChild(btn);
        return li;
      })
    );
  }

  get t() {
    return UI_TEXT[this.lang] || UI_TEXT.en;
  }

  // ------------------------------------------------------ voice states ----

  /** @param {'idle'|'listening'|'processing'|'unsupported'} state */
  setMicState(state) {
    const { micBtn, micStatus } = this.dom;
    micBtn.dataset.state = state;
    if (state === 'listening') {
      micStatus.textContent = this.t.listening;
      micBtn.setAttribute('aria-label', 'Stop listening');
    } else if (state === 'processing') {
      micStatus.textContent = this.t.processing;
    } else if (state === 'unsupported') {
      micBtn.disabled = true;
      micStatus.textContent = 'Voice input unavailable — type your commands below';
    } else {
      micStatus.textContent = this.t.idle;
      micBtn.setAttribute('aria-label', 'Start listening');
    }
  }

  setTranscript(text, interim = false) {
    const node = this.dom.transcript;
    node.textContent = text ? `“${text}”` : '';
    node.dataset.empty = text ? 'false' : 'true';
    node.dataset.interim = interim ? 'true' : 'false';
  }

  /** @param {'ok'|'warn'|'error'|'muted'} tone */
  setFeedback(message, tone = 'ok') {
    this.dom.feedback.textContent = message || '';
    this.dom.feedback.dataset.tone = tone;
  }

  /**
   * @param {string} message
   * @param {{label:string, onClick:Function}} [action] optional call-to-action
   */
  showError(message, action = null) {
    this.dom.errorText.textContent = message;
    const button = this.dom.errorAction;
    button.replaceWith(button.cloneNode(false)); // drop any previous listener
    this.dom.errorAction = document.getElementById('error-action');

    if (action) {
      this.dom.errorAction.textContent = action.label;
      this.dom.errorAction.hidden = false;
      this.dom.errorAction.addEventListener('click', action.onClick);
    } else {
      this.dom.errorAction.hidden = true;
    }
    this.dom.errorBanner.hidden = false;
  }

  /** Puts the banner's action button into a pending state during a long task. */
  setErrorActionBusy(label) {
    this.dom.errorAction.disabled = true;
    this.dom.errorAction.textContent = label;
  }

  hideError() {
    this.dom.errorBanner.hidden = true;
  }

  setMuted(muted) {
    this.dom.muteBtn.textContent = muted ? '🔇' : '🔊';
    this.dom.muteBtn.setAttribute('aria-pressed', String(muted));
    this.dom.muteBtn.setAttribute('aria-label', muted ? 'Unmute spoken replies' : 'Mute spoken replies');
  }

  setUndoAvailable(available) {
    this.dom.undoBtn.disabled = !available;
  }

  /** Highlights an item briefly so the user sees what the command did. */
  flagRecent(itemId) {
    this.recentlyAdded.add(itemId);
    setTimeout(() => this.recentlyAdded.delete(itemId), 1400);
  }

  /** Queues an inline "prefer an alternative?" row beneath an item. */
  offerSubstitutes(itemId, substitutes) {
    if (substitutes.length) this.pendingSubs.set(itemId, substitutes);
  }

  dismissSubstitutes(itemId) {
    this.pendingSubs.delete(itemId);
  }

  // ------------------------------------------------------------- list ----

  renderList(items) {
    const container = this.dom.list;
    container.replaceChildren();

    if (!items.length) {
      const empty = el('div', 'empty-state');
      empty.appendChild(el('span', null, '🧺'));
      empty.appendChild(el('p', null, this.t.empty));
      container.appendChild(empty);
      this.dom.countBadge.textContent = '0 items';
      return;
    }

    const groups = new Map();
    for (const item of items) {
      if (!groups.has(item.category)) groups.set(item.category, []);
      groups.get(item.category).push(item);
    }

    const ordered = [...groups.entries()].sort(
      (a, b) => (CATEGORIES[a[0]]?.order ?? 99) - (CATEGORIES[b[0]]?.order ?? 99)
    );

    for (const [category, group] of ordered) {
      const meta = CATEGORIES[category] || CATEGORIES.other;
      const section = el('div', 'category');
      const head = el('div', 'category-head');
      head.appendChild(el('span', null, meta.icon));
      head.appendChild(el('span', null, meta.label));
      section.appendChild(head);
      for (const item of group) section.appendChild(this.#renderItem(item));
      container.appendChild(section);
    }

    const pending = items.filter((i) => !i.done).length;
    this.dom.countBadge.textContent =
      `${pending} item${pending === 1 ? '' : 's'}${items.length - pending ? ` · ${items.length - pending} bought` : ''}`;
  }

  #renderItem(item) {
    const row = el('div', 'item');
    row.dataset.done = String(item.done);
    if (this.recentlyAdded.has(item.id)) row.dataset.new = 'true';

    const checkbox = el('input', 'item-check');
    checkbox.type = 'checkbox';
    checkbox.checked = item.done;
    checkbox.setAttribute('aria-label', `Mark ${item.name} as bought`);
    checkbox.addEventListener('change', () => this.handlers.onToggleItem?.(item.id, checkbox.checked));
    row.appendChild(checkbox);

    const main = el('div', 'item-main');
    main.appendChild(el('div', 'item-name', item.name));

    const meta = el('div', 'item-meta');
    const product = item.productId ? getProduct(item.productId) : null;
    if (product) {
      const onSale = isOnSale(product.id);
      const unitPrice = onSale ? salePrice(product) : product.price;
      meta.appendChild(el('span', null, `${money(unitPrice * item.quantity)} · ${money(unitPrice)}/${product.unit}`));
      if (onSale) meta.appendChild(el('span', 'badge-sale', 'SALE'));
    } else {
      meta.appendChild(el('span', null, 'custom item'));
    }
    if (item.source === 'voice') meta.appendChild(el('span', null, '🎙'));
    main.appendChild(meta);
    row.appendChild(main);

    const qty = el('div', 'qty-control');
    const minus = el('button', null, '−');
    minus.type = 'button';
    minus.setAttribute('aria-label', `Decrease quantity of ${item.name}`);
    minus.addEventListener('click', () => this.handlers.onAdjustQuantity?.(item.id, -1));
    const value = el('span', 'qty-value', formatQuantity(item));
    const plus = el('button', null, '+');
    plus.type = 'button';
    plus.setAttribute('aria-label', `Increase quantity of ${item.name}`);
    plus.addEventListener('click', () => this.handlers.onAdjustQuantity?.(item.id, 1));
    qty.append(minus, value, plus);
    row.appendChild(qty);

    const actions = el('div', 'item-actions');
    if (item.productId) {
      const swap = el('button', 'mini-btn', '⇄');
      swap.type = 'button';
      swap.title = 'Show alternatives';
      swap.setAttribute('aria-label', `Show alternatives to ${item.name}`);
      swap.addEventListener('click', () => this.handlers.onRequestSubstitutes?.(item));
      actions.appendChild(swap);
    }
    const remove = el('button', 'mini-btn remove', '✕');
    remove.type = 'button';
    remove.title = 'Remove';
    remove.setAttribute('aria-label', `Remove ${item.name}`);
    remove.addEventListener('click', () => this.handlers.onRemoveItem?.(item.id));
    actions.appendChild(remove);
    row.appendChild(actions);

    const subs = this.pendingSubs.get(item.id);
    if (subs) row.appendChild(this.#renderSubstitutes(item, subs));

    return row;
  }

  #renderSubstitutes(item, substitutes) {
    const wrap = el('div', 'subs-row');
    wrap.appendChild(el('span', 'subs-label', `Instead of ${item.name.toLowerCase()}?`));
    for (const sub of substitutes) {
      const chip = el('button', 'sub-chip', `${sub.name} · ${money(sub.price)}`);
      chip.type = 'button';
      chip.title = sub.reason;
      chip.addEventListener('click', () => this.handlers.onSwapItem?.(item, sub));
      wrap.appendChild(chip);
    }
    const close = el('button', 'mini-btn', '✕');
    close.type = 'button';
    close.setAttribute('aria-label', 'Hide alternatives');
    close.addEventListener('click', () => this.handlers.onDismissSubstitutes?.(item.id));
    wrap.appendChild(close);
    return wrap;
  }

  // ------------------------------------------------------ suggestions ----

  showSuggestionsLoading() {
    this.dom.suggestions.replaceChildren(
      ...Array.from({ length: 4 }, () => el('div', 'chip skeleton'))
    );
  }

  renderSuggestions(suggestions) {
    const container = this.dom.suggestions;
    container.replaceChildren();

    if (!suggestions.length) {
      container.appendChild(el('p', 'hint', 'No suggestions right now — tick a few items off and I will learn your habits.'));
      return;
    }

    for (const suggestion of suggestions) {
      const chip = el('button', 'chip');
      chip.type = 'button';
      chip.dataset.type = suggestion.type;
      chip.title = suggestion.reason;

      const label = el('span');
      label.appendChild(el('strong', null, suggestion.name));
      label.appendChild(document.createElement('br'));
      label.appendChild(el('span', 'chip-reason', suggestion.reason));
      chip.appendChild(label);
      chip.appendChild(el('span', 'chip-price', money(suggestion.price)));

      chip.addEventListener('click', () => this.handlers.onAddSuggestion?.(suggestion));
      container.appendChild(chip);
    }
  }

  // ----------------------------------------------------------- search ----

  renderSearch(search) {
    const { searchPanel, searchResults, searchSummary } = this.dom;
    searchPanel.hidden = false;
    searchSummary.textContent = search.results.length
      ? `${search.total} match${search.total === 1 ? '' : 'es'} for ${describeSearch(search)} — showing the ${search.results.length} cheapest`
      : `Nothing matched ${describeSearch(search)}. Try widening the price range.`;

    searchResults.replaceChildren();
    for (const result of search.results) {
      const card = el('button', 'result');
      card.type = 'button';
      card.appendChild(el('div', 'result-name', result.name));
      card.appendChild(el('div', 'result-meta', `${result.brand} · per ${result.unit}${result.tags.length ? ` · ${result.tags.join(', ')}` : ''}`));

      const price = el('div', 'result-price', money(result.price));
      if (result.wasPrice) {
        const was = document.createElement('s');
        was.textContent = money(result.wasPrice);
        price.appendChild(was);
      }
      card.appendChild(price);
      card.appendChild(el('span', 'result-add', '+ Add to list'));
      card.addEventListener('click', () => this.handlers.onAddSearchResult?.(result));
      searchResults.appendChild(card);
    }
    searchPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  showSearchLoading() {
    this.dom.searchPanel.hidden = false;
    this.dom.searchSummary.textContent = 'Searching…';
    this.dom.searchResults.replaceChildren(
      ...Array.from({ length: 3 }, () => el('div', 'chip skeleton'))
    );
  }

  hideSearch() {
    this.dom.searchPanel.hidden = true;
  }

  setTotal(amount) {
    this.dom.totalValue.textContent = money(amount);
  }
}
