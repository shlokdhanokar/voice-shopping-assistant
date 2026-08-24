/**
 * app.js — Application controller.
 *
 * Owns the flow: speech (or typing) → NLP → store mutation → re-render →
 * spoken confirmation. Every intent handler returns a short message, which is
 * both shown as visual feedback and read back, so the app is usable with the
 * screen off.
 */

import { Store } from './store.js';
import { VoiceEngine, isSpeechSupported, supportsOnDevice, isBraveBrowser } from './speech.js';
import { parse } from './nlp.js';
import { UI, formatQuantity } from './ui.js';
import { buildSuggestions, substitutesFor } from './suggestions.js';
import { searchCatalog, estimateTotal } from './search.js';
import { LANGUAGES, UI_TEXT } from './lexicon.js';
import { getProduct, isOnSale, salePrice } from './catalog.js';

/** Minimum visible duration of the "processing" state, in ms. */
const PROCESSING_FRAME = 180;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class App {
  constructor() {
    this.store = new Store();
    this.busy = false;

    this.ui = new UI({
      onMicToggle: () => this.toggleMic(),
      onTextCommand: (text) => this.handleCommand(text, 'text'),
      onLanguageChange: (lang) => this.setLanguage(lang),
      onMuteToggle: () => this.toggleMute(),
      onUndo: () => this.undo(),
      onClearCompleted: () => this.clearCompleted(),
      onReset: () => this.reset(),
      onToggleItem: (id, done) => this.toggleItem(id, done),
      onAdjustQuantity: (id, delta) => this.store.adjustQuantityById(id, delta),
      onRemoveItem: (id) => this.removeById(id),
      onRequestSubstitutes: (item) => this.showSubstitutes(item),
      onDismissSubstitutes: (id) => { this.ui.dismissSubstitutes(id); this.render(); },
      onSwapItem: (item, sub) => this.swapItem(item, sub),
      onAddSuggestion: (suggestion) => this.addSuggestion(suggestion),
      onAddSearchResult: (result) => this.addSearchResult(result)
    });

    this.voice = new VoiceEngine({
      onInterim: (text) => this.ui.setTranscript(text, true),
      onFinal: (text) => this.handleCommand(text, 'voice'),
      onError: (message, code) => this.handleSpeechError(message, code),
      onStateChange: (state) => {
        if (!this.busy) this.ui.setMicState(state);
      }
    });

    this.store.subscribe(() => this.render());
  }

  get lang() {
    return this.store.state.lang || 'en';
  }

  get t() {
    return UI_TEXT[this.lang] || UI_TEXT.en;
  }

  /** Boots the UI: language, seeded history, first render. */
  async start() {
    this.setLanguage(this.lang, { silent: true });
    this.ui.setMuted(false);
    this.ui.showSuggestionsLoading();

    if (!isSpeechSupported()) {
      this.ui.setMicState('unsupported');
      this.ui.showError(
        'This browser has no speech recognition. Everything still works — type commands in the box below. For voice, use Chrome, Edge or Safari.'
      );
    } else {
      this.ui.setMicState('idle');
      // If the on-device model is already downloaded, use it: no speech server
      // round-trip, works offline, and audio never leaves the machine.
      this.voice.useOnDeviceIfReady().catch(() => {});
    }

    // Seeding gives the suggestion engine a plausible history on first run.
    this.store.seedDemoHistory();

    await sleep(PROCESSING_FRAME);
    this.render();
  }

  // ------------------------------------------------------------ speech ----

  toggleMic() {
    this.ui.hideError();
    if (this.voice.listening) {
      this.voice.stop();
      return;
    }
    this.ui.setTranscript('');
    this.ui.setFeedback('');
    this.voice.start();
  }

  handleSpeechError(message, code) {
    this.ui.setMicState('idle');
    if (code === 'no-speech') {
      this.ui.setFeedback(message, 'warn');
      return;
    }

    // A `network` error means the browser's own speech service is unreachable
    // — a firewall, VPN or restrictive ISP, not the user's Wi-Fi.
    if (code === 'network' && !this.voice.localMode) {
      this.explainVoiceUnavailable(message);
      return;
    }

    this.ui.showError(message);
  }

  /**
   * Chooses the right advice for a browser that cannot reach its speech
   * service. Brave is called out explicitly: it ships without Google's speech
   * API key *and* blocks the on-device model download, so offering the install
   * button there would spin forever with no possible success.
   */
  async explainVoiceUnavailable(message) {
    if (await isBraveBrowser()) {
      this.ui.showError(
        'Brave blocks voice recognition: it ships without the online speech service, and also blocks the offline voice model. Use Chrome or Edge for voice input — or just type your command below, which supports every command.'
      );
      this.ui.focusTextInput();
      return;
    }

    if (supportsOnDevice()) {
      this.ui.showError(message, {
        label: 'Enable offline voice',
        onClick: () => this.enableOfflineVoice()
      });
      return;
    }

    this.ui.showError(`${message} You can type your command below instead.`);
    this.ui.focusTextInput();
  }

  /**
   * Downloads the on-device speech model and switches to it. Invoked from the
   * banner button so the browser sees a user gesture, which the download
   * requires. The model is a one-time download of a fair size, so the UI stays
   * explicit about what is happening.
   */
  async enableOfflineVoice() {
    this.ui.setErrorActionBusy('Downloading…');
    this.ui.setFeedback('Downloading the offline voice model — this takes a couple of minutes, one time only.', 'warn');
    try {
      const outcome = await this.voice.enableOnDevice();
      if (outcome === 'installed') {
        this.ui.hideError();
        this.ui.setFeedback('Offline voice ready — tap the mic and speak.', 'ok');
        this.say('Offline voice is ready.');
        return;
      }
      if (outcome === 'timeout') {
        this.ui.showError(
          'The offline voice model did not finish downloading — your network or browser is blocking it. Type your command below instead, or try Chrome.'
        );
      } else {
        this.ui.showError(
          'Offline voice could not be installed for this language. You can still type commands below.'
        );
      }
      this.ui.focusTextInput();
    } catch (err) {
      console.error('Offline voice setup failed', err);
      this.ui.showError('Offline voice setup failed. You can still type commands below.');
      this.ui.focusTextInput();
    }
  }

  toggleMute() {
    const muted = !this.voice.muted;
    this.voice.setMuted(muted);
    this.ui.setMuted(muted);
  }

  setLanguage(langKey, { silent = false } = {}) {
    this.store.setLanguage(langKey);
    this.ui.setLanguage(langKey);
    const config = LANGUAGES.find((l) => l.key === langKey) || LANGUAGES[0];
    // Re-checks on-device availability for the new language; failures are
    // non-fatal because cloud recognition remains as the fallback.
    Promise.resolve(this.voice.setLanguage(config.code)).catch(() => {});
    if (!silent) this.ui.setFeedback(`Language set to ${config.label}`, 'ok');
  }

  /** BCP-47 tag for speech synthesis in the active language. */
  get speechLang() {
    return (LANGUAGES.find((l) => l.key === this.lang) || LANGUAGES[0]).code;
  }

  say(message) {
    this.voice.speak(message, this.speechLang);
  }

  // ----------------------------------------------------------- command ----

  /**
   * Single entry point for a user command, whether spoken or typed.
   * @param {string} transcript
   * @param {'voice'|'text'} source
   */
  async handleCommand(transcript, source = 'voice') {
    if (this.busy) return;
    this.busy = true;
    this.ui.setTranscript(transcript, false);
    this.ui.setMicState('processing');
    this.ui.setFeedback('');

    try {
      // A visible processing beat: parsing is sub-millisecond, but a state that
      // flickers past in one frame reads as "nothing happened".
      await sleep(PROCESSING_FRAME);
      const command = parse(transcript, this.lang);
      const result = this.dispatch(command, source);

      this.ui.setFeedback(result.message, result.tone || 'ok');
      if (result.speak !== false) this.say(result.message);
    } catch (err) {
      console.error('Command failed', err);
      this.ui.setFeedback('Something went wrong handling that command.', 'error');
    } finally {
      this.busy = false;
      this.ui.setMicState(this.voice.listening ? 'listening' : 'idle');
      this.render();
    }
  }

  /** Routes a parsed command to its handler. */
  dispatch(command, source) {
    switch (command.intent) {
      case 'add': return this.handleAdd(command, source);
      case 'remove': return this.handleRemove(command);
      case 'update': return this.handleUpdate(command);
      case 'complete': return this.handleComplete(command);
      case 'clear': return this.handleClear();
      case 'undo': return this.handleUndo();
      case 'search': return this.handleSearch(command);
      case 'help': return this.handleHelp();
      default:
        return {
          message: `${this.t.noMatch}. Try “add milk” or “find apples under $4”.`,
          tone: 'warn'
        };
    }
  }

  handleAdd(command, source) {
    if (!command.items.length) {
      return { message: `${this.t.noMatch}. Tell me what to add, e.g. “add bread”.`, tone: 'warn' };
    }

    const added = [];
    for (const parsed of command.items) {
      const { item } = this.store.addItem({
        productId: parsed.productId,
        name: parsed.name,
        category: parsed.category,
        quantity: parsed.quantity,
        unit: parsed.unit,
        source: source === 'text' ? 'text' : 'voice'
      });
      this.ui.flagRecent(item.id);
      added.push(item);
    }

    this.offerSubstituteFor(added[0]);

    const summary = added.map((i) => `${formatQuantity(i)} ${i.name.toLowerCase()}`).join(', ');
    const uncertain = command.items.some((i) => !i.exact);
    return {
      message: `${this.t.added}: ${summary}${uncertain ? ' — say “undo” if that is wrong' : ''}`,
      tone: uncertain ? 'warn' : 'ok'
    };
  }

  /**
   * Shows an alternative only when it is genuinely worth a look: on sale, or
   * meaningfully cheaper. Suggesting a swap for every item would be noise.
   */
  offerSubstituteFor(item) {
    if (!item?.productId) return;
    const product = getProduct(item.productId);
    if (!product) return;
    const listed = this.store.items.map((i) => i.productId).filter(Boolean);
    const worthwhile = substitutesFor(item.productId, { exclude: listed })
      .filter((sub) => sub.onSale || sub.price < product.price - 0.2);
    if (worthwhile.length) this.ui.offerSubstitutes(item.id, worthwhile.slice(0, 3));
  }

  handleRemove(command) {
    if (!command.items.length) {
      return { message: 'Tell me what to remove, e.g. “remove milk”.', tone: 'warn' };
    }
    const removed = [];
    const missing = [];
    for (const parsed of command.items) {
      const gone = this.store.removeItem({ productId: parsed.productId, name: parsed.name });
      (gone ? removed : missing).push(gone ? gone.name : parsed.name);
    }
    if (!removed.length) {
      return { message: `${this.t.notFound}: ${missing.join(', ').toLowerCase()}`, tone: 'warn' };
    }
    const tail = missing.length ? ` (${missing.join(', ').toLowerCase()} was not on the list)` : '';
    return { message: `${this.t.removed}: ${removed.join(', ').toLowerCase()}${tail}`, tone: 'ok' };
  }

  handleUpdate(command) {
    const parsed = command.items[0];
    if (!parsed) return { message: 'Which item should I change?', tone: 'warn' };
    const updated = this.store.setQuantity({
      productId: parsed.productId,
      name: parsed.name,
      quantity: parsed.quantity
    });
    if (!updated) return { message: `${this.t.notFound}: ${parsed.name.toLowerCase()}`, tone: 'warn' };
    return { message: `${this.t.updated}: ${updated.name.toLowerCase()} → ${formatQuantity(updated)}`, tone: 'ok' };
  }

  handleComplete(command) {
    const done = [];
    for (const parsed of command.items) {
      const item = this.store.markDone({ productId: parsed.productId, name: parsed.name });
      if (item) done.push(item.name);
    }
    if (!done.length) return { message: this.t.notFound, tone: 'warn' };
    return { message: `Ticked off: ${done.join(', ').toLowerCase()}`, tone: 'ok' };
  }

  handleClear() {
    const count = this.store.items.length;
    if (!count) return { message: 'Your list is already empty.', tone: 'warn' };
    this.store.clear();
    return { message: `${this.t.cleared} — ${count} item${count === 1 ? '' : 's'} removed. Say “undo” to restore.`, tone: 'ok' };
  }

  handleUndo() {
    const ok = this.store.undo();
    return ok
      ? { message: 'Undone.', tone: 'ok' }
      : { message: 'Nothing left to undo.', tone: 'warn' };
  }

  handleSearch(command) {
    this.ui.showSearchLoading();
    const search = searchCatalog(command);
    this.ui.renderSearch(search);
    if (!search.results.length) {
      return { message: `No matches. ${search.filters.maxPrice ? 'Try a higher price limit.' : 'Try a different item.'}`, tone: 'warn' };
    }
    const cheapest = search.results[0];
    return {
      message: `Found ${search.total} option${search.total === 1 ? '' : 's'} — cheapest is ${cheapest.name} from ${cheapest.brand} at $${cheapest.price.toFixed(2)}`,
      tone: 'ok'
    };
  }

  handleHelp() {
    document.querySelector('.examples')?.setAttribute('open', '');
    return {
      message: 'Try: add milk, buy 5 oranges, remove bread, find toothpaste under $5, or clear my list.',
      tone: 'ok'
    };
  }

  // ------------------------------------------------------- direct edits ----

  toggleItem(id, done) {
    const item = this.store.toggleDone(id, done);
    if (item?.done) this.ui.setFeedback(`Ticked off ${item.name.toLowerCase()}`, 'ok');
  }

  removeById(id) {
    const removed = this.store.removeById(id);
    if (removed) this.ui.setFeedback(`${this.t.removed}: ${removed.name.toLowerCase()}`, 'ok');
  }

  showSubstitutes(item) {
    const listed = this.store.items.map((i) => i.productId).filter(Boolean);
    const subs = substitutesFor(item.productId, { exclude: listed });
    if (!subs.length) {
      this.ui.setFeedback(`No alternatives listed for ${item.name.toLowerCase()}.`, 'warn');
      return;
    }
    this.ui.offerSubstitutes(item.id, subs);
    this.render();
  }

  swapItem(item, sub) {
    this.store.removeById(item.id);
    const { item: added } = this.store.addItem({
      productId: sub.productId,
      name: sub.name,
      category: sub.category,
      quantity: item.quantity,
      unit: item.unit,
      source: 'suggestion'
    });
    this.ui.dismissSubstitutes(item.id);
    this.ui.flagRecent(added.id);
    const message = `Swapped ${item.name.toLowerCase()} for ${sub.name.toLowerCase()}`;
    this.ui.setFeedback(message, 'ok');
    this.say(message);
  }

  addSuggestion(suggestion) {
    const { item } = this.store.addItem({
      productId: suggestion.productId,
      name: suggestion.name,
      category: suggestion.category,
      quantity: 1,
      unit: null,
      source: 'suggestion'
    });
    this.ui.flagRecent(item.id);
    const message = `${this.t.added}: ${suggestion.name.toLowerCase()}`;
    this.ui.setFeedback(message, 'ok');
    this.say(message);
  }

  addSearchResult(result) {
    const { item } = this.store.addItem({
      productId: result.productId,
      name: result.name,
      category: result.category,
      quantity: 1,
      unit: null,
      source: 'search'
    });
    this.ui.flagRecent(item.id);
    const message = `${this.t.added}: ${result.name.toLowerCase()} (${result.brand})`;
    this.ui.setFeedback(message, 'ok');
    this.say(message);
  }

  clearCompleted() {
    const done = this.store.items.filter((i) => i.done).length;
    if (!done) {
      this.ui.setFeedback('Nothing is ticked off yet.', 'warn');
      return;
    }
    this.store.clearCompleted();
    this.ui.setFeedback(`Cleared ${done} bought item${done === 1 ? '' : 's'}.`, 'ok');
  }

  undo() {
    const ok = this.store.undo();
    this.ui.setFeedback(ok ? 'Undone.' : 'Nothing left to undo.', ok ? 'ok' : 'warn');
  }

  reset() {
    if (!window.confirm('Reset the list, purchase history and preferences?')) return;
    this.store.reset();
    this.store.seedDemoHistory();
    this.setLanguage('en', { silent: true });
    this.ui.hideSearch();
    this.ui.setFeedback('Everything reset.', 'ok');
  }

  // ------------------------------------------------------------ render ----

  render() {
    const items = this.store.items;
    this.ui.renderList(items);
    this.ui.renderSuggestions(buildSuggestions(this.store.state));
    this.ui.setTotal(estimateTotal(items));
    this.ui.setUndoAvailable(this.store.canUndo);
  }
}

const app = new App();
app.start().catch((err) => {
  console.error('Startup failed', err);
  const banner = document.getElementById('error-banner');
  const text = document.getElementById('error-text');
  if (banner && text) {
    text.textContent = 'The app failed to start. Please refresh the page.';
    banner.hidden = false;
  }
});

// Exposed for manual poking in the browser console during development.
window.__voiceCart = app;

export { App, isOnSale, salePrice };
