# Approach

I treated this as a latency problem first. Voice interaction lives or dies on
the gap between speaking and seeing a result, so the whole pipeline runs
on-device: the Web Speech API for recognition, and a rule-based parser instead
of a cloud NLU call. Parsing takes under a millisecond, works offline, costs
nothing, and has no key to leak.

The parser has five stages: normalise, detect intent, strip price filters, match
products longest-alias-first, then attach quantities by scanning backwards.
Matched spans are blanked from the string as they are consumed, which is what
keeps multi-item commands like *"2 bottles of water and 5 oranges"*
unambiguous. Language is data, not code — a new one is a lexicon entry.

Suggestions come from four scored strategies — restock, pairing, seasonal,
habit — with per-strategy quotas, because unquota'd ranking let seasonal
produce bury the personal signals. Each suggestion states its reason;
unexplained recommendations get ignored.

Dependencies are zero, per the submission guidelines. Logic modules never touch
the DOM, so 85 Node assertions cover them without a browser or mocking
framework, alongside 31 browser checks driving the real UI. Both caught real
bugs.
