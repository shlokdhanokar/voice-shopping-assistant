/**
 * catalog.js — Static product catalogue.
 *
 * This is the knowledge base the whole app reasons over: it powers item
 * recognition (multilingual aliases), automatic categorisation, seasonal
 * hints, substitute suggestions and voice search.
 *
 * Compiled from public supermarket taxonomies and typical retail prices (USD).
 * `seasons` are 1-indexed months of peak availability; an empty array means the
 * item is available year-round. `restock` is the typical number of days a
 * household takes to run out, used by the "running low" suggestion engine.
 */

const RAW = [
  // ---------------------------------------------------------------- dairy --
  { id: 'milk', name: 'Milk', cat: 'dairy', unit: 'litre', price: 3.49, restock: 5,
    subs: ['almond-milk', 'soy-milk', 'oat-milk'],
    alias: { en: ['whole milk', 'full cream milk', 'dairy milk'], hi: ['दूध', 'doodh', 'dudh'], es: ['leche'], fr: ['lait'] } },
  { id: 'almond-milk', name: 'Almond Milk', cat: 'dairy', unit: 'litre', price: 4.29, restock: 8,
    subs: ['milk', 'soy-milk', 'oat-milk'], tags: ['vegan', 'lactose-free'],
    alias: { en: ['almondmilk'], hi: ['बादाम दूध', 'badam doodh'], es: ['leche de almendras'], fr: ["lait d'amande"] } },
  { id: 'soy-milk', name: 'Soy Milk', cat: 'dairy', unit: 'litre', price: 3.99, restock: 8,
    subs: ['milk', 'almond-milk'], tags: ['vegan', 'lactose-free'],
    alias: { en: ['soya milk'], hi: ['सोया दूध'], es: ['leche de soja'], fr: ['lait de soja'] } },
  { id: 'oat-milk', name: 'Oat Milk', cat: 'dairy', unit: 'litre', price: 4.49, restock: 8,
    subs: ['milk', 'almond-milk'], tags: ['vegan', 'lactose-free'],
    alias: { en: [], hi: ['ओट दूध'], es: ['leche de avena'], fr: ["lait d'avoine"] } },
  { id: 'butter', name: 'Butter', cat: 'dairy', unit: 'pack', price: 4.99, restock: 21,
    subs: ['ghee', 'margarine'],
    alias: { en: [], hi: ['मक्खन', 'makhan'], es: ['mantequilla'], fr: ['beurre'] } },
  { id: 'ghee', name: 'Ghee', cat: 'dairy', unit: 'jar', price: 8.99, restock: 45,
    subs: ['butter'],
    alias: { en: ['clarified butter'], hi: ['घी'], es: [], fr: [] } },
  { id: 'margarine', name: 'Margarine', cat: 'dairy', unit: 'pack', price: 3.19, restock: 30,
    subs: ['butter'], tags: ['vegan'],
    alias: { en: [], hi: [], es: ['margarina'], fr: ['margarine'] } },
  { id: 'cheese', name: 'Cheese', cat: 'dairy', unit: 'pack', price: 5.49, restock: 14,
    subs: ['paneer', 'tofu'],
    alias: { en: ['cheddar', 'mozzarella'], hi: ['चीज़', 'cheez'], es: ['queso'], fr: ['fromage'] } },
  { id: 'paneer', name: 'Paneer', cat: 'dairy', unit: 'pack', price: 4.79, restock: 10,
    subs: ['tofu', 'cheese'], tags: ['vegetarian'],
    alias: { en: ['cottage cheese'], hi: ['पनीर'], es: [], fr: [] } },
  { id: 'yogurt', name: 'Yogurt', cat: 'dairy', unit: 'cup', price: 1.29, restock: 7,
    subs: ['greek-yogurt'],
    alias: { en: ['curd', 'yoghurt'], hi: ['दही', 'dahi'], es: ['yogur'], fr: ['yaourt'] } },
  { id: 'greek-yogurt', name: 'Greek Yogurt', cat: 'dairy', unit: 'cup', price: 2.19, restock: 7,
    subs: ['yogurt'], tags: ['high-protein'],
    alias: { en: [], hi: ['ग्रीक दही'], es: ['yogur griego'], fr: ['yaourt grec'] } },
  { id: 'eggs', name: 'Eggs', cat: 'dairy', unit: 'dozen', price: 4.29, restock: 10,
    subs: ['tofu'],
    alias: { en: ['egg'], hi: ['अंडे', 'अंडा', 'ande', 'anda'], es: ['huevos', 'huevo'], fr: ['oeufs', 'œufs', 'oeuf'] } },

  // -------------------------------------------------------------- produce --
  { id: 'apples', name: 'Apples', cat: 'produce', unit: 'kg', price: 3.99, restock: 7, seasons: [9, 10, 11],
    subs: ['pears'],
    alias: { en: ['apple'], hi: ['सेब', 'seb'], es: ['manzanas', 'manzana'], fr: ['pommes', 'pomme'] } },
  { id: 'pears', name: 'Pears', cat: 'produce', unit: 'kg', price: 4.29, restock: 7, seasons: [9, 10],
    subs: ['apples'],
    alias: { en: ['pear'], hi: ['नाशपाती'], es: ['peras'], fr: ['poires'] } },
  { id: 'bananas', name: 'Bananas', cat: 'produce', unit: 'dozen', price: 2.19, restock: 5,
    subs: ['apples'],
    alias: { en: ['banana'], hi: ['केला', 'केले', 'kela'], es: ['plátanos', 'platanos', 'bananas'], fr: ['bananes', 'banane'] } },
  { id: 'oranges', name: 'Oranges', cat: 'produce', unit: 'kg', price: 3.49, restock: 7, seasons: [12, 1, 2, 3],
    subs: ['lemons'],
    alias: { en: ['orange'], hi: ['संतरा', 'संतरे', 'santra'], es: ['naranjas', 'naranja'], fr: ['oranges', 'orange'] } },
  { id: 'strawberries', name: 'Strawberries', cat: 'produce', unit: 'box', price: 4.99, restock: 5, seasons: [3, 4, 5],
    subs: ['grapes'],
    alias: { en: ['strawberry'], hi: ['स्ट्रॉबेरी'], es: ['fresas'], fr: ['fraises'] } },
  { id: 'mangoes', name: 'Mangoes', cat: 'produce', unit: 'kg', price: 5.49, restock: 7, seasons: [4, 5, 6, 7],
    subs: ['peaches'],
    alias: { en: ['mango'], hi: ['आम', 'aam'], es: ['mangos'], fr: ['mangues'] } },
  { id: 'peaches', name: 'Peaches', cat: 'produce', unit: 'kg', price: 4.79, restock: 6, seasons: [6, 7, 8],
    subs: ['mangoes'],
    alias: { en: ['peach'], hi: ['आड़ू'], es: ['melocotones'], fr: ['pêches'] } },
  { id: 'grapes', name: 'Grapes', cat: 'produce', unit: 'kg', price: 5.29, restock: 6, seasons: [1, 2, 3, 8, 9],
    subs: ['strawberries'],
    alias: { en: ['grape'], hi: ['अंगूर', 'angoor'], es: ['uvas'], fr: ['raisins'] } },
  { id: 'watermelon', name: 'Watermelon', cat: 'produce', unit: 'piece', price: 4.99, restock: 10, seasons: [5, 6, 7, 8],
    subs: ['melon'],
    alias: { en: [], hi: ['तरबूज', 'tarbooj'], es: ['sandía', 'sandia'], fr: ['pastèque'] } },
  { id: 'melon', name: 'Melon', cat: 'produce', unit: 'piece', price: 3.99, restock: 10, seasons: [6, 7, 8],
    subs: ['watermelon'],
    alias: { en: ['cantaloupe', 'muskmelon'], hi: ['खरबूजा'], es: ['melón'], fr: ['melon'] } },
  { id: 'tomatoes', name: 'Tomatoes', cat: 'produce', unit: 'kg', price: 2.99, restock: 5,
    subs: [],
    alias: { en: ['tomato'], hi: ['टमाटर', 'tamatar'], es: ['tomates', 'tomate'], fr: ['tomates', 'tomate'] } },
  { id: 'onions', name: 'Onions', cat: 'produce', unit: 'kg', price: 1.99, restock: 14,
    subs: ['shallots'],
    alias: { en: ['onion'], hi: ['प्याज', 'pyaz', 'pyaaz'], es: ['cebollas', 'cebolla'], fr: ['oignons', 'oignon'] } },
  { id: 'shallots', name: 'Shallots', cat: 'produce', unit: 'kg', price: 3.49, restock: 14,
    subs: ['onions'],
    alias: { en: [], hi: ['छोटा प्याज'], es: ['chalotas'], fr: ['échalotes'] } },
  { id: 'potatoes', name: 'Potatoes', cat: 'produce', unit: 'kg', price: 2.49, restock: 14,
    subs: ['sweet-potatoes'],
    alias: { en: ['potato'], hi: ['आलू', 'aloo'], es: ['patatas', 'papas'], fr: ['pommes de terre'] } },
  { id: 'sweet-potatoes', name: 'Sweet Potatoes', cat: 'produce', unit: 'kg', price: 3.29, restock: 14, seasons: [10, 11, 12],
    subs: ['potatoes'],
    alias: { en: ['sweet potato'], hi: ['शकरकंद'], es: ['batatas'], fr: ['patates douces'] } },
  { id: 'spinach', name: 'Spinach', cat: 'produce', unit: 'bunch', price: 2.29, restock: 5, seasons: [11, 12, 1, 2],
    subs: ['lettuce', 'kale'],
    alias: { en: [], hi: ['पालक', 'palak'], es: ['espinacas'], fr: ['épinards'] } },
  { id: 'kale', name: 'Kale', cat: 'produce', unit: 'bunch', price: 2.79, restock: 5, seasons: [10, 11, 12, 1],
    subs: ['spinach'],
    alias: { en: [], hi: [], es: ['col rizada'], fr: ['chou frisé'] } },
  { id: 'lettuce', name: 'Lettuce', cat: 'produce', unit: 'head', price: 1.99, restock: 5,
    subs: ['spinach'],
    alias: { en: ['salad leaves'], hi: ['सलाद पत्ता'], es: ['lechuga'], fr: ['laitue'] } },
  { id: 'carrots', name: 'Carrots', cat: 'produce', unit: 'kg', price: 2.19, restock: 10, seasons: [11, 12, 1, 2],
    subs: [],
    alias: { en: ['carrot'], hi: ['गाजर', 'gajar'], es: ['zanahorias'], fr: ['carottes'] } },
  { id: 'broccoli', name: 'Broccoli', cat: 'produce', unit: 'head', price: 2.99, restock: 7, seasons: [10, 11, 12],
    subs: ['cauliflower'],
    alias: { en: [], hi: ['ब्रोकली'], es: ['brócoli'], fr: ['brocoli'] } },
  { id: 'cauliflower', name: 'Cauliflower', cat: 'produce', unit: 'head', price: 2.79, restock: 7, seasons: [10, 11, 12, 1],
    subs: ['broccoli'],
    alias: { en: [], hi: ['फूलगोभी', 'gobi'], es: ['coliflor'], fr: ['chou-fleur'] } },
  { id: 'pumpkin', name: 'Pumpkin', cat: 'produce', unit: 'piece', price: 4.49, restock: 20, seasons: [9, 10, 11],
    subs: [],
    alias: { en: [], hi: ['कद्दू', 'kaddu'], es: ['calabaza'], fr: ['citrouille'] } },
  { id: 'avocado', name: 'Avocado', cat: 'produce', unit: 'piece', price: 1.99, restock: 6,
    subs: [],
    alias: { en: ['avocados'], hi: ['एवोकाडो'], es: ['aguacate'], fr: ['avocat'] } },
  { id: 'lemons', name: 'Lemons', cat: 'produce', unit: 'kg', price: 3.29, restock: 14,
    subs: ['oranges'],
    alias: { en: ['lemon', 'lime'], hi: ['नींबू', 'nimbu'], es: ['limones', 'limón'], fr: ['citrons', 'citron'] } },
  { id: 'garlic', name: 'Garlic', cat: 'produce', unit: 'pack', price: 1.79, restock: 21,
    subs: [],
    alias: { en: [], hi: ['लहसुन', 'lehsun'], es: ['ajo'], fr: ['ail'] } },
  { id: 'ginger', name: 'Ginger', cat: 'produce', unit: 'pack', price: 2.09, restock: 21,
    subs: [],
    alias: { en: [], hi: ['अदरक', 'adrak'], es: ['jengibre'], fr: ['gingembre'] } },
  { id: 'cucumber', name: 'Cucumber', cat: 'produce', unit: 'piece', price: 1.29, restock: 6, seasons: [5, 6, 7, 8],
    subs: [],
    alias: { en: ['cucumbers'], hi: ['खीरा', 'kheera'], es: ['pepino'], fr: ['concombre'] } },
  { id: 'corn', name: 'Corn', cat: 'produce', unit: 'piece', price: 0.89, restock: 7, seasons: [6, 7, 8, 9],
    subs: ['peas'],
    alias: { en: ['sweetcorn'], hi: ['मक्का', 'bhutta'], es: ['maíz'], fr: ['maïs'] } },
  { id: 'peas', name: 'Peas', cat: 'produce', unit: 'kg', price: 3.19, restock: 10, seasons: [12, 1, 2],
    subs: ['frozen-peas'],
    alias: { en: ['pea'], hi: ['मटर', 'matar'], es: ['guisantes'], fr: ['petits pois'] } },

  // --------------------------------------------------------------- bakery --
  { id: 'bread', name: 'Bread', cat: 'bakery', unit: 'loaf', price: 2.99, restock: 4,
    subs: ['whole-wheat-bread', 'bagels', 'tortillas'],
    alias: { en: ['white bread', 'loaf'], hi: ['ब्रेड', 'डबल रोटी'], es: ['pan'], fr: ['pain'] } },
  { id: 'whole-wheat-bread', name: 'Whole Wheat Bread', cat: 'bakery', unit: 'loaf', price: 3.79, restock: 4,
    subs: ['bread'], tags: ['whole-grain'],
    alias: { en: ['brown bread', 'wheat bread'], hi: ['ब्राउन ब्रेड'], es: ['pan integral'], fr: ['pain complet'] } },
  { id: 'bagels', name: 'Bagels', cat: 'bakery', unit: 'pack', price: 3.99, restock: 7,
    subs: ['bread'],
    alias: { en: ['bagel'], hi: [], es: ['bagels'], fr: ['bagels'] } },
  { id: 'croissants', name: 'Croissants', cat: 'bakery', unit: 'pack', price: 4.49, restock: 7,
    subs: ['bagels'],
    alias: { en: ['croissant'], hi: [], es: ['cruasanes'], fr: ['croissants'] } },
  { id: 'tortillas', name: 'Tortillas', cat: 'bakery', unit: 'pack', price: 2.89, restock: 10,
    subs: ['bread'],
    alias: { en: ['wraps', 'roti'], hi: ['रोटी'], es: ['tortillas'], fr: ['tortillas'] } },

  // ------------------------------------------------------ meat & seafood --
  { id: 'chicken', name: 'Chicken', cat: 'meat', unit: 'kg', price: 8.99, restock: 7,
    subs: ['tofu', 'fish'],
    alias: { en: ['chicken breast'], hi: ['चिकन', 'मुर्गी', 'murgi'], es: ['pollo'], fr: ['poulet'] } },
  { id: 'mutton', name: 'Mutton', cat: 'meat', unit: 'kg', price: 13.99, restock: 14,
    subs: ['chicken'],
    alias: { en: ['lamb', 'goat meat'], hi: ['मटन'], es: ['cordero'], fr: ['agneau'] } },
  { id: 'fish', name: 'Fish', cat: 'meat', unit: 'kg', price: 11.49, restock: 7,
    subs: ['chicken', 'shrimp'],
    alias: { en: ['salmon', 'tilapia'], hi: ['मछली', 'machhli'], es: ['pescado'], fr: ['poisson'] } },
  { id: 'shrimp', name: 'Shrimp', cat: 'meat', unit: 'kg', price: 15.99, restock: 14,
    subs: ['fish'],
    alias: { en: ['prawns'], hi: ['झींगा'], es: ['gambas'], fr: ['crevettes'] } },
  { id: 'tofu', name: 'Tofu', cat: 'meat', unit: 'pack', price: 3.29, restock: 10,
    subs: ['paneer', 'chicken'], tags: ['vegan', 'high-protein'],
    alias: { en: [], hi: ['टोफू'], es: ['tofu'], fr: ['tofu'] } },

  // --------------------------------------------------------------- pantry --
  { id: 'rice', name: 'Rice', cat: 'pantry', unit: 'kg', price: 6.49, restock: 30,
    subs: ['pasta', 'quinoa'],
    alias: { en: ['basmati rice'], hi: ['चावल', 'chawal'], es: ['arroz'], fr: ['riz'] } },
  { id: 'quinoa', name: 'Quinoa', cat: 'pantry', unit: 'kg', price: 9.99, restock: 45,
    subs: ['rice'], tags: ['gluten-free', 'high-protein'],
    alias: { en: [], hi: [], es: ['quinua'], fr: ['quinoa'] } },
  { id: 'flour', name: 'Flour', cat: 'pantry', unit: 'kg', price: 3.29, restock: 30,
    subs: [],
    alias: { en: ['atta', 'wheat flour'], hi: ['आटा'], es: ['harina'], fr: ['farine'] } },
  { id: 'sugar', name: 'Sugar', cat: 'pantry', unit: 'kg', price: 2.79, restock: 30,
    subs: ['honey', 'jaggery'],
    alias: { en: [], hi: ['चीनी', 'cheeni', 'shakkar'], es: ['azúcar', 'azucar'], fr: ['sucre'] } },
  { id: 'honey', name: 'Honey', cat: 'pantry', unit: 'jar', price: 6.99, restock: 60,
    subs: ['sugar', 'jaggery'],
    alias: { en: [], hi: ['शहद', 'shahad'], es: ['miel'], fr: ['miel'] } },
  { id: 'jaggery', name: 'Jaggery', cat: 'pantry', unit: 'kg', price: 4.49, restock: 45,
    subs: ['sugar'],
    alias: { en: [], hi: ['गुड़', 'gud'], es: [], fr: [] } },
  { id: 'salt', name: 'Salt', cat: 'pantry', unit: 'pack', price: 1.29, restock: 90,
    subs: [],
    alias: { en: [], hi: ['नमक', 'namak'], es: ['sal'], fr: ['sel'] } },
  { id: 'olive-oil', name: 'Olive Oil', cat: 'pantry', unit: 'bottle', price: 9.49, restock: 45,
    subs: ['sunflower-oil'],
    alias: { en: [], hi: ['जैतून का तेल'], es: ['aceite de oliva'], fr: ["huile d'olive"] } },
  { id: 'sunflower-oil', name: 'Sunflower Oil', cat: 'pantry', unit: 'bottle', price: 5.99, restock: 45,
    subs: ['olive-oil'],
    alias: { en: ['cooking oil', 'oil'], hi: ['तेल'], es: ['aceite'], fr: ['huile'] } },
  { id: 'pasta', name: 'Pasta', cat: 'pantry', unit: 'pack', price: 2.49, restock: 21,
    subs: ['noodles', 'rice'],
    alias: { en: ['spaghetti', 'macaroni'], hi: ['पास्ता'], es: ['pasta'], fr: ['pâtes'] } },
  { id: 'noodles', name: 'Noodles', cat: 'pantry', unit: 'pack', price: 2.19, restock: 21,
    subs: ['pasta'],
    alias: { en: ['ramen'], hi: ['नूडल्स'], es: ['fideos'], fr: ['nouilles'] } },
  { id: 'lentils', name: 'Lentils', cat: 'pantry', unit: 'kg', price: 4.29, restock: 30,
    subs: ['chickpeas'], tags: ['vegan', 'high-protein'],
    alias: { en: ['dal', 'daal'], hi: ['दाल'], es: ['lentejas'], fr: ['lentilles'] } },
  { id: 'chickpeas', name: 'Chickpeas', cat: 'pantry', unit: 'kg', price: 3.89, restock: 30,
    subs: ['lentils'], tags: ['vegan', 'high-protein'],
    alias: { en: ['chana', 'garbanzo'], hi: ['चना'], es: ['garbanzos'], fr: ['pois chiches'] } },
  { id: 'cereal', name: 'Cereal', cat: 'pantry', unit: 'box', price: 4.99, restock: 14,
    subs: ['oats'],
    alias: { en: ['cornflakes'], hi: ['सीरियल'], es: ['cereales'], fr: ['céréales'] } },
  { id: 'oats', name: 'Oats', cat: 'pantry', unit: 'pack', price: 3.99, restock: 21,
    subs: ['cereal'], tags: ['whole-grain'],
    alias: { en: ['oatmeal'], hi: ['ओट्स'], es: ['avena'], fr: ['avoine'] } },
  { id: 'peanut-butter', name: 'Peanut Butter', cat: 'pantry', unit: 'jar', price: 5.29, restock: 30,
    subs: ['jam', 'honey'],
    alias: { en: [], hi: ['पीनट बटर'], es: ['mantequilla de maní'], fr: ['beurre de cacahuète'] } },
  { id: 'jam', name: 'Jam', cat: 'pantry', unit: 'jar', price: 3.49, restock: 30,
    subs: ['peanut-butter', 'honey'],
    alias: { en: ['jelly', 'preserve'], hi: ['जैम'], es: ['mermelada'], fr: ['confiture'] } },
  { id: 'coffee', name: 'Coffee', cat: 'pantry', unit: 'pack', price: 8.99, restock: 21,
    subs: ['tea'],
    alias: { en: ['ground coffee'], hi: ['कॉफ़ी'], es: ['café', 'cafe'], fr: ['café'] } },
  { id: 'tea', name: 'Tea', cat: 'pantry', unit: 'box', price: 4.79, restock: 30,
    subs: ['coffee'],
    alias: { en: ['tea bags', 'green tea'], hi: ['चाय', 'chai'], es: ['té'], fr: ['thé'] } },
  { id: 'ketchup', name: 'Ketchup', cat: 'pantry', unit: 'bottle', price: 2.99, restock: 45,
    subs: [],
    alias: { en: ['tomato sauce'], hi: ['केचप'], es: ['kétchup'], fr: ['ketchup'] } },

  // ------------------------------------------------------------ beverages --
  { id: 'water', name: 'Bottled Water', cat: 'beverages', unit: 'bottle', price: 0.99, restock: 3,
    subs: ['sparkling-water'],
    alias: { en: ['water', 'mineral water', 'drinking water'], hi: ['पानी', 'pani'], es: ['agua'], fr: ['eau'] } },
  { id: 'sparkling-water', name: 'Sparkling Water', cat: 'beverages', unit: 'bottle', price: 1.49, restock: 7,
    subs: ['water', 'soda'],
    alias: { en: ['soda water', 'seltzer'], hi: ['सोडा वाटर'], es: ['agua con gas'], fr: ['eau gazeuse'] } },
  { id: 'orange-juice', name: 'Orange Juice', cat: 'beverages', unit: 'carton', price: 4.19, restock: 7,
    subs: ['apple-juice'],
    alias: { en: ['oj', 'juice'], hi: ['संतरे का रस'], es: ['zumo de naranja'], fr: ["jus d'orange"] } },
  { id: 'apple-juice', name: 'Apple Juice', cat: 'beverages', unit: 'carton', price: 3.89, restock: 7,
    subs: ['orange-juice'],
    alias: { en: [], hi: ['सेब का रस'], es: ['zumo de manzana'], fr: ['jus de pomme'] } },
  { id: 'soda', name: 'Soda', cat: 'beverages', unit: 'bottle', price: 1.99, restock: 7,
    subs: ['sparkling-water'],
    alias: { en: ['cola', 'soft drink', 'fizzy drink'], hi: ['कोल्ड ड्रिंक'], es: ['refresco'], fr: ['soda'] } },

  // --------------------------------------------------------------- snacks --
  { id: 'chips', name: 'Chips', cat: 'snacks', unit: 'pack', price: 2.49, restock: 10,
    subs: ['popcorn', 'nuts'],
    alias: { en: ['crisps', 'potato chips'], hi: ['चिप्स'], es: ['patatas fritas'], fr: ['chips'] } },
  { id: 'popcorn', name: 'Popcorn', cat: 'snacks', unit: 'pack', price: 2.99, restock: 14,
    subs: ['chips'],
    alias: { en: [], hi: ['पॉपकॉर्न'], es: ['palomitas'], fr: ['pop-corn'] } },
  { id: 'chocolate', name: 'Chocolate', cat: 'snacks', unit: 'bar', price: 2.29, restock: 10,
    subs: ['cookies'],
    alias: { en: ['chocolate bar'], hi: ['चॉकलेट'], es: ['chocolate'], fr: ['chocolat'] } },
  { id: 'cookies', name: 'Cookies', cat: 'snacks', unit: 'pack', price: 3.29, restock: 10,
    subs: ['chocolate', 'granola-bars'],
    alias: { en: ['biscuits', 'biscuit'], hi: ['बिस्किट'], es: ['galletas'], fr: ['biscuits'] } },
  { id: 'nuts', name: 'Mixed Nuts', cat: 'snacks', unit: 'pack', price: 7.49, restock: 21,
    subs: ['almonds'], tags: ['high-protein'],
    alias: { en: ['peanuts', 'cashews'], hi: ['मेवा', 'काजू'], es: ['frutos secos'], fr: ['fruits secs'] } },
  { id: 'almonds', name: 'Almonds', cat: 'snacks', unit: 'pack', price: 8.99, restock: 30,
    subs: ['nuts'], tags: ['high-protein'],
    alias: { en: [], hi: ['बादाम', 'badam'], es: ['almendras'], fr: ['amandes'] } },
  { id: 'granola-bars', name: 'Granola Bars', cat: 'snacks', unit: 'box', price: 4.49, restock: 14,
    subs: ['cookies'], tags: ['whole-grain'],
    alias: { en: ['energy bars', 'protein bars'], hi: ['ग्रेनोला बार'], es: ['barritas'], fr: ['barres de céréales'] } },

  // --------------------------------------------------------------- frozen --
  { id: 'frozen-pizza', name: 'Frozen Pizza', cat: 'frozen', unit: 'piece', price: 5.99, restock: 14,
    subs: [],
    alias: { en: ['pizza'], hi: ['पिज़्ज़ा'], es: ['pizza congelada'], fr: ['pizza surgelée'] } },
  { id: 'ice-cream', name: 'Ice Cream', cat: 'frozen', unit: 'tub', price: 5.49, restock: 14, seasons: [4, 5, 6, 7, 8],
    subs: ['frozen-berries'],
    alias: { en: [], hi: ['आइसक्रीम'], es: ['helado'], fr: ['glace'] } },
  { id: 'frozen-peas', name: 'Frozen Peas', cat: 'frozen', unit: 'pack', price: 2.29, restock: 21,
    subs: ['peas'],
    alias: { en: [], hi: ['फ्रोजन मटर'], es: ['guisantes congelados'], fr: ['petits pois surgelés'] } },
  { id: 'frozen-berries', name: 'Frozen Berries', cat: 'frozen', unit: 'pack', price: 4.99, restock: 21,
    subs: ['strawberries'],
    alias: { en: [], hi: [], es: ['bayas congeladas'], fr: ['fruits rouges surgelés'] } },

  // ------------------------------------------------------------ household --
  { id: 'dish-soap', name: 'Dish Soap', cat: 'household', unit: 'bottle', price: 3.49, restock: 30,
    subs: [],
    alias: { en: ['dishwashing liquid', 'dish washing soap'], hi: ['बर्तन धोने का साबुन'], es: ['lavavajillas'], fr: ['liquide vaisselle'] } },
  { id: 'laundry-detergent', name: 'Laundry Detergent', cat: 'household', unit: 'pack', price: 11.99, restock: 45,
    subs: [],
    alias: { en: ['washing powder', 'detergent'], hi: ['डिटर्जेंट'], es: ['detergente'], fr: ['lessive'] } },
  { id: 'paper-towels', name: 'Paper Towels', cat: 'household', unit: 'pack', price: 6.49, restock: 30,
    subs: ['napkins'],
    alias: { en: ['kitchen roll'], hi: ['पेपर टॉवल'], es: ['papel de cocina'], fr: ['essuie-tout'] } },
  { id: 'napkins', name: 'Napkins', cat: 'household', unit: 'pack', price: 2.99, restock: 30,
    subs: ['paper-towels'],
    alias: { en: ['tissues', 'tissue paper'], hi: ['टिशू'], es: ['servilletas'], fr: ['serviettes'] } },
  { id: 'toilet-paper', name: 'Toilet Paper', cat: 'household', unit: 'pack', price: 8.99, restock: 21,
    subs: [],
    alias: { en: ['toilet roll'], hi: ['टॉयलेट पेपर'], es: ['papel higiénico'], fr: ['papier toilette'] } },
  { id: 'trash-bags', name: 'Trash Bags', cat: 'household', unit: 'pack', price: 5.49, restock: 45,
    subs: [],
    alias: { en: ['bin bags', 'garbage bags'], hi: ['कचरा बैग'], es: ['bolsas de basura'], fr: ['sacs poubelle'] } },
  { id: 'aluminum-foil', name: 'Aluminium Foil', cat: 'household', unit: 'roll', price: 4.29, restock: 60,
    subs: [],
    alias: { en: ['aluminum foil', 'tin foil'], hi: ['एल्युमिनियम फॉयल'], es: ['papel aluminio'], fr: ['papier aluminium'] } },
  { id: 'sponges', name: 'Sponges', cat: 'household', unit: 'pack', price: 3.19, restock: 45,
    subs: [],
    alias: { en: ['scrubber'], hi: ['स्पंज'], es: ['esponjas'], fr: ['éponges'] } },

  // -------------------------------------------------------- personal care --
  { id: 'toothpaste', name: 'Toothpaste', cat: 'personal-care', unit: 'tube', price: 4.49, restock: 45,
    subs: [],
    alias: { en: [], hi: ['टूथपेस्ट', 'मंजन'], es: ['pasta de dientes'], fr: ['dentifrice'] } },
  { id: 'toothbrush', name: 'Toothbrush', cat: 'personal-care', unit: 'piece', price: 3.29, restock: 90,
    subs: [],
    alias: { en: [], hi: ['टूथब्रश'], es: ['cepillo de dientes'], fr: ['brosse à dents'] } },
  { id: 'shampoo', name: 'Shampoo', cat: 'personal-care', unit: 'bottle', price: 7.49, restock: 45,
    subs: ['conditioner'],
    alias: { en: [], hi: ['शैम्पू'], es: ['champú'], fr: ['shampooing'] } },
  { id: 'conditioner', name: 'Conditioner', cat: 'personal-care', unit: 'bottle', price: 7.99, restock: 45,
    subs: ['shampoo'],
    alias: { en: [], hi: ['कंडीशनर'], es: ['acondicionador'], fr: ['après-shampooing'] } },
  { id: 'soap', name: 'Soap', cat: 'personal-care', unit: 'bar', price: 2.49, restock: 30,
    subs: ['body-wash'],
    alias: { en: ['bath soap'], hi: ['साबुन'], es: ['jabón'], fr: ['savon'] } },
  { id: 'body-wash', name: 'Body Wash', cat: 'personal-care', unit: 'bottle', price: 6.29, restock: 45,
    subs: ['soap'],
    alias: { en: ['shower gel'], hi: ['बॉडी वॉश'], es: ['gel de ducha'], fr: ['gel douche'] } },
  { id: 'deodorant', name: 'Deodorant', cat: 'personal-care', unit: 'piece', price: 5.79, restock: 60,
    subs: [],
    alias: { en: ['deo'], hi: ['डियोड्रेंट'], es: ['desodorante'], fr: ['déodorant'] } },
  { id: 'razors', name: 'Razors', cat: 'personal-care', unit: 'pack', price: 9.49, restock: 60,
    subs: [],
    alias: { en: ['razor', 'shaving blades'], hi: ['रेज़र'], es: ['cuchillas'], fr: ['rasoirs'] } },
  { id: 'hand-sanitizer', name: 'Hand Sanitizer', cat: 'personal-care', unit: 'bottle', price: 3.99, restock: 45,
    subs: ['soap'],
    alias: { en: ['sanitizer'], hi: ['सैनिटाइज़र'], es: ['gel hidroalcohólico'], fr: ['gel hydroalcoolique'] } },
  { id: 'sunscreen', name: 'Sunscreen', cat: 'personal-care', unit: 'bottle', price: 12.49, restock: 90, seasons: [4, 5, 6, 7, 8],
    subs: [],
    alias: { en: ['sunblock', 'spf'], hi: ['सनस्क्रीन'], es: ['protector solar'], fr: ['crème solaire'] } }
];

/** Display metadata per category, ordered the way a shopper walks a store. */
export const CATEGORIES = {
  produce: { label: 'Produce', icon: '🥬', order: 1 },
  dairy: { label: 'Dairy & Eggs', icon: '🥛', order: 2 },
  bakery: { label: 'Bakery', icon: '🍞', order: 3 },
  meat: { label: 'Meat & Seafood', icon: '🍗', order: 4 },
  frozen: { label: 'Frozen', icon: '🧊', order: 5 },
  pantry: { label: 'Pantry', icon: '🥫', order: 6 },
  snacks: { label: 'Snacks', icon: '🍫', order: 7 },
  beverages: { label: 'Beverages', icon: '🧃', order: 8 },
  household: { label: 'Household', icon: '🧹', order: 9 },
  'personal-care': { label: 'Personal Care', icon: '🧴', order: 10 },
  other: { label: 'Other', icon: '🛒', order: 99 }
};

/** Brand ladder applied to every product so voice search can filter by brand. */
const BRAND_TIERS = [
  { brand: 'Value Pick', factor: 0.78, tags: [] },
  { brand: 'Fresh Fields', factor: 1.0, tags: [] },
  { brand: 'Pure Harvest', factor: 1.34, tags: ['organic'] }
];

const round2 = (n) => Math.round(n * 100) / 100;

export const PRODUCTS = RAW.map((p) => ({
  id: p.id,
  name: p.name,
  category: p.cat,
  unit: p.unit,
  price: p.price,
  restockDays: p.restock,
  seasons: p.seasons || [],
  substitutes: p.subs || [],
  tags: p.tags || [],
  aliases: p.alias || {},
  variants: BRAND_TIERS.map((tier) => ({
    brand: tier.brand,
    price: round2(p.price * tier.factor),
    tags: [...(p.tags || []), ...tier.tags]
  }))
}));

const BY_ID = new Map(PRODUCTS.map((p) => [p.id, p]));

/** @returns {object|undefined} the catalogue entry for an id. */
export function getProduct(id) {
  return BY_ID.get(id);
}

/**
 * Every spelling we know for every product, sorted longest-phrase-first so
 * that "almond milk" is matched before the shorter "milk" during parsing.
 */
export const ALIAS_INDEX = (() => {
  const rows = [];
  for (const p of PRODUCTS) {
    const seen = new Set();
    const push = (text) => {
      const key = String(text).toLowerCase().trim();
      if (key && !seen.has(key)) {
        seen.add(key);
        rows.push({ phrase: key, id: p.id });
      }
    };
    push(p.name);
    for (const list of Object.values(p.aliases)) list.forEach(push);
  }
  return rows.sort((a, b) => b.phrase.length - a.phrase.length);
})();

/** Products whose peak season includes the given 1-indexed month. */
export function seasonalProducts(month) {
  return PRODUCTS.filter((p) => p.seasons.includes(month));
}

/**
 * Deterministic weekly "on sale" flag. A seeded hash rather than Math.random
 * keeps offers stable for the whole week and identical across reloads, which
 * is what a shopper expects from a real promotion.
 */
export function isOnSale(productId, date = new Date()) {
  const week = Math.floor(
    (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(2024, 0, 1)) / 6048e5
  );
  let hash = (week * 2654435761) >>> 0;
  for (let i = 0; i < productId.length; i++) hash = (hash * 31 + productId.charCodeAt(i)) >>> 0;
  return hash % 100 < 18; // ~18% of the catalogue is on promotion each week
}

/** Discounted price for an item currently on sale (20% off). */
export function salePrice(product) {
  return round2(product.price * 0.8);
}
