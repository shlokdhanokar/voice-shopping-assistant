/**
 * lexicon.js — Language packs for the NLP layer.
 *
 * Everything language-specific lives here so adding a new language is a data
 * change, not a code change: add an entry to LANGUAGES and a matching block in
 * LEXICON, and the parser, the speech recogniser and the UI all pick it up.
 */

/** Languages offered in the UI. `code` is the BCP-47 tag for SpeechRecognition. */
export const LANGUAGES = [
  { key: 'en', code: 'en-US', label: 'English', flag: '🇬🇧' },
  { key: 'hi', code: 'hi-IN', label: 'हिन्दी', flag: '🇮🇳' },
  { key: 'es', code: 'es-ES', label: 'Español', flag: '🇪🇸' },
  { key: 'fr', code: 'fr-FR', label: 'Français', flag: '🇫🇷' }
];

/** Words that introduce a second item: "milk and eggs", "leche y huevos". */
export const CONNECTORS = ['and', 'plus', 'also', 'aur', 'और', 'y', 'e', 'et', 'ainsi que'];

/**
 * Measurement units, mapped to a canonical singular form. Order matters only
 * for readability; matching is exact-token based.
 */
export const UNITS = {
  bottle: ['bottle', 'bottles', 'botella', 'botellas', 'bouteille', 'bouteilles', 'बोतल'],
  pack: ['pack', 'packs', 'packet', 'packets', 'paquete', 'paquetes', 'paquet', 'paquets', 'पैकेट'],
  box: ['box', 'boxes', 'caja', 'cajas', 'boîte', 'boite', 'boites', 'डिब्बा'],
  can: ['can', 'cans', 'tin', 'tins', 'lata', 'latas', 'boîte de conserve'],
  kg: ['kg', 'kgs', 'kilo', 'kilos', 'kilogram', 'kilograms', 'kilogramme', 'किलो'],
  g: ['g', 'gram', 'grams', 'gramme', 'grammes', 'gramo', 'gramos', 'ग्राम'],
  litre: ['l', 'litre', 'litres', 'liter', 'liters', 'litro', 'litros', 'लीटर'],
  ml: ['ml', 'millilitre', 'millilitres', 'milliliter', 'milliliters'],
  dozen: ['dozen', 'dozens', 'docena', 'douzaine', 'दर्जन'],
  loaf: ['loaf', 'loaves', 'barra', 'baguette'],
  jar: ['jar', 'jars', 'tarro', 'pot', 'बरनी'],
  bunch: ['bunch', 'bunches', 'manojo', 'botte', 'गुच्छा'],
  bag: ['bag', 'bags', 'bolsa', 'bolsas', 'sac', 'थैला'],
  carton: ['carton', 'cartons', 'cartón', 'brique'],
  tub: ['tub', 'tubs', 'tarrina'],
  roll: ['roll', 'rolls', 'rollo', 'rouleau'],
  tube: ['tube', 'tubes', 'tubo'],
  bar: ['bar', 'bars', 'barra', 'barre'],
  cup: ['cup', 'cups', 'taza', 'tasse'],
  head: ['head', 'heads', 'cabeza', 'tête'],
  piece: ['piece', 'pieces', 'pcs', 'pieza', 'piezas', 'pièce', 'pièces', 'टुकड़ा']
};

/** Flattened unit lookup: spelling -> canonical unit. */
export const UNIT_LOOKUP = (() => {
  const map = new Map();
  for (const [canonical, spellings] of Object.entries(UNITS)) {
    for (const s of spellings) map.set(s, canonical);
  }
  return map;
})();

/** Spelled-out numbers across all supported languages. */
export const NUMBER_WORDS = {
  // English
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20,
  couple: 2, half: 0.5, quarter: 0.25,
  // Hindi (romanised + Devanagari)
  ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5, chhe: 6, che: 6,
  saat: 7, aath: 8, nau: 9, das: 10, aadha: 0.5,
  'एक': 1, 'दो': 2, 'तीन': 3, 'चार': 4, 'पांच': 5, 'पाँच': 5, 'छह': 6, 'सात': 7,
  'आठ': 8, 'नौ': 9, 'दस': 10, 'आधा': 0.5,
  // Spanish
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7,
  ocho: 8, nueve: 9, diez: 10, doce: 12, medio: 0.5,
  // French
  une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, sept: 7, huit: 8, neuf: 9,
  dix: 10, douze: 12, demi: 0.5
};

/** Product qualities a shopper can filter on by voice. */
export const TAG_PHRASES = {
  organic: ['organic', 'orgánico', 'organico', 'bio', 'biologique', 'ऑर्गेनिक', 'जैविक'],
  vegan: ['vegan', 'vegano', 'végétalien', 'शाकाहारी'],
  'gluten-free': ['gluten free', 'gluten-free', 'sin gluten', 'sans gluten'],
  'lactose-free': ['lactose free', 'lactose-free', 'dairy free', 'sin lactosa', 'sans lactose'],
  'whole-grain': ['whole grain', 'wholegrain', 'whole wheat', 'integral', 'complet'],
  'high-protein': ['high protein', 'protein rich', 'alto en proteínas', 'riche en protéines']
};

/**
 * Intent triggers per language. Each entry is a list of regular-expression
 * source strings; they are compiled once, case-insensitively, in nlp.js.
 *
 * Order of evaluation is defined by INTENT_PRIORITY below, not by this object,
 * because several phrases legitimately overlap ("show me" is a search even
 * though a search result can later be added).
 */
export const LEXICON = {
  en: {
    stopwords: ['please', 'my', 'the', 'a', 'an', 'to', 'from', 'of', 'some', 'for', 'me', 'list',
      'shopping', 'cart', 'basket', 'items', 'item', 'can', 'you', 'could', 'would', 'i', 'we'],
    intents: {
      help: ['\\bhelp\\b', 'what can (you|i) (do|say)', '\\bcommands\\b'],
      undo: ['\\bundo\\b', 'never ?mind', 'go back'],
      clear: ['clear (my |the )?(list|everything|all)', 'empty (my |the )?(list|cart)',
        'delete everything', 'remove everything', 'start (a )?(new|over)', 'reset (my |the )?list'],
      search: ['\\bfind\\b', '\\bsearch\\b', 'look(ing)? for', 'show me', 'do you have',
        'how much (is|are|does)', "what'?s the price"],
      complete: ['(mark|tick|check)( it| them)?( off| as)?( bought| done| purchased| complete)',
        "i (already )?(bought|got|picked up|have)", 'done with'],
      update: ['change .+ to', 'make (it|that) \\d', 'update .+ to', 'set .+ to'],
      remove: ['\\bremove\\b', '\\bdelete\\b', '\\btake\\b.*\\boff\\b', 'get rid of',
        "(don'?t|do not) (need|want)", 'no longer need', '\\bcancel\\b', 'scratch'],
      add: ['\\badd\\b', 'i need', 'i want', 'we need', '\\bbuy\\b', '\\bget\\b', 'put .+ on',
        'pick up', '\\bgrab\\b', '\\bpurchase\\b', 'remind me to (buy|get)', "don'?t forget"]
    },
    priceFilters: {
      max: ['under', 'below', 'less than', 'cheaper than', 'at most', 'up to', 'max'],
      min: ['over', 'above', 'more than', 'at least', 'starting at', 'min'],
      range: ['between']
    }
  },

  hi: {
    stopwords: ['कृपया', 'मेरी', 'मेरे', 'की', 'का', 'के', 'में', 'से', 'को', 'लिस्ट', 'सूची', 'है', 'हैं', 'दो', 'दे'],
    intents: {
      help: ['मदद', '\\bhelp\\b'],
      undo: ['वापस', 'अनडू', '\\bundo\\b'],
      clear: ['सब हटा', 'सारे हटा', 'लिस्ट खाली', 'सूची खाली', 'सब कुछ हटा'],
      search: ['ढूंढ', 'ढून्ढ', 'खोज', 'दिखा', 'कीमत', 'दाम', '\\bfind\\b'],
      complete: ['खरीद लिया', 'ले लिया', 'हो गया', 'मिल गया'],
      update: ['बदल', 'कर दो'],
      remove: ['हटा', 'निकाल', 'मिटा', 'नहीं चाहिए', 'मत'],
      add: ['जोड़', 'डाल', 'चाहिए', 'खरीद', 'लाना', 'लेना', 'ऐड', '\\badd\\b']
    },
    priceFilters: {
      max: ['से कम', 'से सस्ता', 'तक', 'under'],
      min: ['से ज्यादा', 'से अधिक', 'से महंगा', 'over'],
      range: ['के बीच', 'between']
    }
  },

  es: {
    stopwords: ['por favor', 'mi', 'la', 'el', 'los', 'las', 'de', 'del', 'un', 'una', 'a',
      'lista', 'compra', 'carrito', 'me', 'por'],
    intents: {
      help: ['ayuda', '\\bhelp\\b'],
      undo: ['deshacer', 'olvídalo', 'olvidalo'],
      clear: ['borra la lista', 'vacía la lista', 'vacia la lista', 'limpia la lista', 'borra todo'],
      search: ['busca', 'buscar', 'encuentra', 'muéstrame', 'muestrame', 'cuánto cuesta', 'cuanto cuesta'],
      complete: ['ya (compré|compre|tengo)', 'hecho', 'marcar como comprado'],
      update: ['cambia .+ a', 'actualiza .+ a'],
      remove: ['quita', 'elimina', 'borra', 'saca', 'no necesito', 'no quiero'],
      add: ['añade', 'anade', 'agrega', 'agregar', 'necesito', 'quiero', 'comprar', 'compra', 'pon']
    },
    priceFilters: {
      max: ['menos de', 'por debajo de', 'máximo', 'maximo', 'hasta'],
      min: ['más de', 'mas de', 'por encima de', 'mínimo', 'minimo'],
      range: ['entre']
    }
  },

  fr: {
    stopwords: ['s\'il te plaît', 'ma', 'le', 'la', 'les', 'de', 'du', 'des', 'un', 'une',
      'liste', 'course', 'courses', 'panier', 'moi', 'pour', 'à'],
    intents: {
      help: ['aide', '\\bhelp\\b'],
      undo: ['annuler', 'annule', 'oublie'],
      clear: ['vide la liste', 'efface la liste', 'supprime tout', 'efface tout'],
      search: ['trouve', 'cherche', 'recherche', 'montre', 'combien coûte', 'combien coute'],
      complete: ["j'ai (acheté|achete|pris)", 'terminé', 'termine', 'marquer comme acheté'],
      update: ['change .+ en', 'mets .+ à'],
      remove: ['enlève', 'enleve', 'supprime', 'retire', 'efface', "je n'ai plus besoin", 'plus besoin'],
      add: ['ajoute', 'ajouter', "j'ai besoin", 'je veux', 'acheter', 'achète', 'achete', 'mets', 'prends']
    },
    priceFilters: {
      max: ['moins de', 'en dessous de', 'maximum', "jusqu'à", 'jusqua'],
      min: ['plus de', 'au dessus de', 'au-dessus de', 'minimum'],
      range: ['entre']
    }
  }
};

/**
 * Evaluation order for intents. More specific intents are tested first so that
 * "remove everything from my list" resolves to `clear`, not `remove`.
 */
export const INTENT_PRIORITY = ['help', 'undo', 'clear', 'search', 'complete', 'update', 'remove', 'add'];

/** UI strings, kept next to the language packs they belong to. */
export const UI_TEXT = {
  en: {
    tagline: 'Say what you need — I will sort it out.',
    listening: 'Listening…',
    processing: 'Processing…',
    idle: 'Tap the mic and speak',
    empty: 'Your list is empty. Try saying "Add milk and eggs".',
    added: 'Added',
    removed: 'Removed',
    updated: 'Updated',
    notFound: 'I could not find that on your list',
    cleared: 'List cleared',
    noMatch: 'Sorry, I did not catch an item there',
    results: 'Search results',
    suggestions: 'Suggestions for you',
    total: 'Estimated total'
  },
  hi: {
    tagline: 'बोलिए, बाकी मैं संभाल लूँगा।',
    listening: 'सुन रहा हूँ…',
    processing: 'प्रोसेस हो रहा है…',
    idle: 'माइक दबाकर बोलें',
    empty: 'आपकी सूची खाली है। कहें "दूध और अंडे जोड़ो"।',
    added: 'जोड़ा गया',
    removed: 'हटाया गया',
    updated: 'अपडेट किया',
    notFound: 'यह सूची में नहीं मिला',
    cleared: 'सूची खाली कर दी',
    noMatch: 'माफ़ कीजिए, वस्तु समझ नहीं आई',
    results: 'खोज परिणाम',
    suggestions: 'आपके लिए सुझाव',
    total: 'अनुमानित कुल'
  },
  es: {
    tagline: 'Dime qué necesitas y yo me encargo.',
    listening: 'Escuchando…',
    processing: 'Procesando…',
    idle: 'Toca el micrófono y habla',
    empty: 'Tu lista está vacía. Prueba "Añade leche y huevos".',
    added: 'Añadido',
    removed: 'Eliminado',
    updated: 'Actualizado',
    notFound: 'No encontré eso en tu lista',
    cleared: 'Lista vaciada',
    noMatch: 'No entendí qué artículo era',
    results: 'Resultados',
    suggestions: 'Sugerencias para ti',
    total: 'Total estimado'
  },
  fr: {
    tagline: 'Dites ce qu’il vous faut, je m’occupe du reste.',
    listening: 'J’écoute…',
    processing: 'Traitement…',
    idle: 'Touchez le micro et parlez',
    empty: 'Votre liste est vide. Essayez « Ajoute du lait et des œufs ».',
    added: 'Ajouté',
    removed: 'Supprimé',
    updated: 'Mis à jour',
    notFound: 'Introuvable dans votre liste',
    cleared: 'Liste vidée',
    noMatch: 'Je n’ai pas compris l’article',
    results: 'Résultats',
    suggestions: 'Suggestions pour vous',
    total: 'Total estimé'
  }
};
