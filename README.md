# 🛒 VoiceCart — Voice Command Shopping Assistant

A voice-controlled shopping list with natural-language understanding, smart
suggestions and voice-activated search. **Zero dependencies, zero build step,
zero API keys** — it is plain ES modules, served as static files.

> **Live demo:** <https://voice-shopping-assistant-vc.netlify.app>
> **Mirror:** <https://shlokdhanokar.github.io/voice-shopping-assistant/> (GitHub Pages)
> **Repository:** <https://github.com/shlokdhanokar/voice-shopping-assistant>

---

## What it does

Say *"I need two bottles of water and five oranges"* and the app parses the
intent, the quantities, the units and both products, files them under
**Beverages** and **Produce**, prices the list, and reads a confirmation back.

Say *"find toothpaste under $5"* and it searches a 105-product catalogue across
brand variants and returns only what fits the budget.

---

## Feature coverage

| Requirement | Status | Where |
|---|---|---|
| **Voice command recognition** | ✅ | [`js/speech.js`](js/speech.js) — Web Speech API, on-device |
| **NLP for varied phrasing** | ✅ | [`js/nlp.js`](js/nlp.js) — 8 intents, ~40 trigger patterns |
| **Multilingual support** | ✅ | English, हिन्दी, Español, Français — [`js/lexicon.js`](js/lexicon.js) |
| **Product recommendations from history** | ✅ | `restock` + `habit` strategies, [`js/suggestions.js`](js/suggestions.js) |
| **Seasonal / on-sale recommendations** | ✅ | `seasonal` + `sale` strategies |
| **Substitutes** | ✅ | `substitutesFor()` — explicit alternatives with category fallback |
| **Add / remove / modify by voice** | ✅ | `add`, `remove`, `update`, `complete`, `clear`, `undo` intents |
| **Automatic categorisation** | ✅ | 10 store-aisle categories in [`js/catalog.js`](js/catalog.js) |
| **Quantity management** | ✅ | Digits, spelled-out numbers, fractions, 22 units |
| **Voice search with brand / size** | ✅ | [`js/search.js`](js/search.js) — searches brand variants |
| **Price-range filtering by voice** | ✅ | "under $5", "over $3", "between 2 and 6", and per-language forms |
| **Minimalist interface** | ✅ | [`css/styles.css`](css/styles.css) — single column, mic-first |
| **Real-time visual feedback** | ✅ | Live interim transcript, per-action confirmations, item flash |
| **Mobile / voice-only** | ✅ | Mobile-first, spoken confirmations, 92px touch target |
| **Error handling & loading states** | ✅ | Mic states, skeletons, mapped speech errors, storage failures |

---

## Quick start

The app is static, but ES modules need a real HTTP origin — opening
`index.html` from the filesystem will not work.

```bash
git clone https://github.com/shlokdhanokar/voice-shopping-assistant.git
cd voice-shopping-assistant

python -m http.server 8000     # or: npx serve .
```

Then open <http://localhost:8000> in **Chrome, Edge or Safari** and allow
microphone access.

There is no `npm install`, no bundler and no configuration.

---

## Testing

**Unit / logic tests** — 85 assertions via Node's built-in test runner:

```bash
node --test "tests/*.test.mjs"
```

Covers intent detection across all four languages, quantity and unit parsing,
price filters, multi-item commands, fuzzy matching, store merging and undo,
persistence failure modes, every suggestion strategy, and search filtering.

**Browser integration tests** — 31 checks driving the real UI:

```bash
python -m http.server 8000
# then open http://localhost:8000/tests/e2e.html
```

It loads the app in an iframe, issues real commands and asserts on the rendered
DOM: adding, merging, categorising, quantities, search price ceilings,
suggestion and substitute clicks, Hindi commands, clear/undo, and persistence.
Results print as a PASS/FAIL list on the page.

---

## Architecture

```
index.html          markup and ARIA structure
css/styles.css      theme tokens, responsive layout, light + dark
js/
  catalog.js        105 products: categories, prices, seasons, substitutes, aliases
  lexicon.js        language packs — intents, numbers, units, UI strings
  nlp.js            transcript  ->  { intent, items, quantities, filters, tags }
  store.js          state, localStorage persistence, purchase history, undo
  suggestions.js    four ranked recommendation strategies + substitutes
  search.js         catalogue query with price/tag/brand filters, list totals
  speech.js         Web Speech API wrapper (recognition + synthesis)
  ui.js             all DOM rendering
  app.js            controller wiring the above together
tests/              85 Node assertions + 31 browser checks
```

Data flows one way:

```
speech/typing → nlp.parse() → app.dispatch() → store mutation
                                                    ↓
                        ui re-render  ←  subscriber  ┘
```

The logic modules never touch the DOM, which is what makes them testable in
Node with no browser and no mocking framework.

### How the NLP works

A deterministic pipeline rather than an LLM call:

1. **Normalise** — lowercase, convert Devanagari digits, unify currency symbols,
   strip punctuation while preserving Unicode combining marks.
2. **Detect intent** — regex trigger sets per language, evaluated most-specific
   first so *"remove everything"* resolves to `clear`, not `remove`. If the
   selected language does not match, the other language packs are tried, so a
   Hindi phrase still works with the selector left on English.
3. **Strip price filters** — before quantity parsing, so "$5" is never read as a
   quantity. Handles both prefix ("under $5") and postfix ("5 से कम") forms.
4. **Locate products** — 560 alias spellings matched longest-first, so
   *"almond milk"* beats *"milk"*. Matches are blanked from the working string,
   which is how multi-item commands stay unambiguous. A bounded
   edit-distance-1 pass then recovers mis-recognitions like *"bred" → bread*.
5. **Attach quantities** — the words before each product are scanned backwards
   for a unit and a number, covering digits, words (*"three"*, *"तीन"*,
   *"cinco"*), and fractions (*"half kg"*).
6. **Fall back** — anything unrecognised is still captured as a custom item
   rather than silently dropped.

Parsing runs offline in well under a millisecond, costs nothing per request, and
has no key to leak — which matters when it sits inside a voice feedback loop.

### How suggestions work

Four independent strategies each score candidates and explain themselves:

| Strategy | Signal |
|---|---|
| **Restock** | Days since last purchase vs. that product's typical restock cycle |
| **Pairing** | Co-occurrence with items already on the list, learned from past trips |
| **Seasonal** | Peak-season produce for the current month, plus the week's promotions |
| **Habit** | Most frequently purchased items missing from today's list |

Results are merged, de-duplicated by product (strongest reason wins) and
ranked, then **per-strategy quotas** are applied. The quotas matter: without
them a month rich in seasonal produce fills all eight slots and buries the
personal signals users actually act on.

Every suggestion carries its reason as visible text — *"Running low — last
bought 7 days ago"* — because an unexplained recommendation is one users learn
to ignore.

Sale promotions use a **seeded weekly hash** rather than `Math.random()`, so
offers stay stable for the week and survive a reload, the way a real promotion
would.

A plausible purchase history is seeded on first run so the suggestion panel is
meaningful immediately rather than after your second shopping trip. The
**Reset** button clears it.

---

## Design decisions

**Why no framework?** The submission guidelines ask for minimal, native
dependencies. Everything here is a platform feature: ES modules, the Web Speech
API, `localStorage`, CSS custom properties. Nothing to install, nothing to
audit, and the whole app is a handful of static files.

**Why rule-based NLP instead of an LLM?** A shopping command is a small,
closed grammar. Rules are instant, free, work offline, and — most importantly —
are *testable*, which is why the intent layer has 28 assertions pinning its
behaviour. A cloud NLU call would add latency, a key to manage and a free-tier
ceiling, for accuracy this domain does not need.

**Why on-device speech?** No audio leaves the browser and there is no API key
in the client. The trade-off is browser support, which is handled explicitly
below.

**Why a typed-command fallback?** It keeps the app fully usable in browsers
without speech recognition, on a bad microphone, or in a quiet room — and it is
what makes automated browser testing of the whole pipeline possible.

---

## Browser support

| Browser | Voice input | List, search, suggestions |
|---|---|---|
| Chrome (desktop + Android) | ✅ | ✅ |
| Edge | ✅ | ✅ |
| Safari (macOS + iOS) | ✅ | ✅ |
| Firefox | ❌ no `SpeechRecognition` | ✅ via typed commands |

When speech recognition is unavailable the app says so, disables the mic and
directs the user to the text input rather than failing silently.

### Known limitations

- Speech recognition accuracy is the browser's, not ours; the fuzzy-match pass
  only covers single-token, edit-distance-1 slips.
- The catalogue and its prices are static sample data compiled from public
  supermarket taxonomies — there is no retailer integration.
- The list lives in `localStorage`, so it is per-device and not synced.
- One intent per utterance: *"add milk and remove bread"* resolves to a single
  intent covering both items.

---

## Deployment

The app is a static site with no build step, so any static host works. The
repository root is the web root.

**GitHub Pages** — Settings → Pages → Source: *Deploy from a branch* →
`main` / `/ (root)`. Live at `https://<user>.github.io/<repo>/`.

**Netlify** — drag the folder onto [app.netlify.com/drop](https://app.netlify.com/drop),
or connect the repo with build command *(none)* and publish directory `.`.

**Vercel** — `vercel --prod`, framework preset *Other*, no build command.

**Firebase Hosting** — `firebase init hosting` with public directory `.`,
then `firebase deploy`.

HTTPS is required in production: browsers only grant microphone access on
secure origins (`localhost` is exempt).

---

## Voice commands

| Intent | Examples |
|---|---|
| Add | "Add milk" · "I need apples and bread" · "I want to buy bananas" · "Grab a dozen eggs" |
| Quantity | "Add 2 bottles of water" · "Buy 5 oranges" · "Add half kg tomatoes" |
| Remove | "Remove milk from my list" · "Take eggs off my list" · "I don't need coffee" |
| Modify | "Change bread to 3" |
| Complete | "I already bought eggs" |
| Search | "Find me organic apples" · "Find toothpaste under $5" · "Find shampoo between 6 and 9" |
| Manage | "Clear my list" · "Undo" · "Help" |

**हिन्दी:** "दूध जोड़ो" · "2 लीटर दूध चाहिए" · "ब्रेड हटाओ" · "सेब ढूंढो" · "सब हटा दो"

**Español:** "Añade leche" · "Necesito manzanas y pan" · "Quita el pan" ·
"Busca pasta de dientes menos de 5"

**Français:** "J'ai besoin de lait" · "Achète 5 oranges" · "Enlève le pain" ·
"Trouve du dentifrice moins de 5"

---

## Licence

MIT — sample data compiled from public sources.
