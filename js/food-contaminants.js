// @ts-check

// food-contaminants.js — Keyword-based food contaminant warnings from public databases
// Sources: EWG Dirty Dozen/Clean Fifteen (2025 data), PlasticList (2024)
// Update annually when EWG publishes new rankings at ewg.org/foodnews

// ── EWG Dirty Dozen (ranked by pesticide contamination) ──
// Each entry: [displayName, ...matchVariants]
const EWG_DIRTY_DOZEN = [
  ['Spinach', 'spinach'],
  ['Strawberries', 'strawberry', 'strawberries'],
  ['Kale', 'kale'],
  ['Collard greens', 'collard greens', 'collard'],
  ['Mustard greens', 'mustard greens'],
  ['Grapes', 'grape', 'grapes'],
  ['Peaches', 'peach', 'peaches'],
  ['Cherries', 'cherry', 'cherries'],
  ['Nectarines', 'nectarine', 'nectarines'],
  ['Pears', 'pear', 'pears'],
  ['Apples', 'apple', 'apples'],
  ['Blackberries', 'blackberry', 'blackberries'],
  ['Blueberries', 'blueberry', 'blueberries'],
  ['Potatoes', 'potato', 'potatoes'],
];

// ── EWG 2025 Clean Fifteen (lowest pesticide residues) ──
const EWG_CLEAN_FIFTEEN = [
  ['Pineapples', 'pineapple', 'pineapples'],
  ['Sweet corn', 'sweet corn', 'corn'],
  ['Avocados', 'avocado', 'avocados'],
  ['Papaya', 'papaya'],
  ['Onion', 'onion', 'onions'],
  ['Sweet peas', 'sweet peas', 'peas'],
  ['Asparagus', 'asparagus'],
  ['Cabbage', 'cabbage'],
  ['Watermelon', 'watermelon'],
  ['Cauliflower', 'cauliflower'],
  ['Bananas', 'banana', 'bananas'],
  ['Mangoes', 'mango', 'mangoes', 'mangos'],
  ['Carrots', 'carrot', 'carrots'],
  ['Mushrooms', 'mushroom', 'mushrooms'],
  ['Kiwi', 'kiwi', 'kiwis', 'kiwifruit'],
];

// ── PlasticList category warnings (aggregated from 296 products, 705 samples) ──
// Source: plasticlist.org, CC BY 4.0
const PLASTIC_WARNINGS = [
  {
    keywords: ['canned', 'can of', 'tinned', 'spam', 'canned tuna', 'canned fish', 'canned meat', 'canned beans', 'canned soup', 'canned tomato', 'canned food'],
    warning: 'BPA detected in canned foods at up to 12,171% of EFSA safety limit',
    source: 'PlasticList',
    url: 'https://www.plasticlist.org/report',
  },
  {
    keywords: ['takeout', 'take-out', 'takeaway', 'delivery food', 'fast food', 'mcdonalds', "mcdonald's", 'burger king', 'chipotle', 'food delivery', 'uber eats', 'doordash', 'grubhub', 'just eat', 'deliveroo', 'wolt'],
    warning: 'Takeout containers increase plastic chemical levels by 34% vs fresh food',
    source: 'PlasticList',
    url: 'https://www.plasticlist.org/report',
  },
  {
    keywords: ['bottled water', 'plastic bottle', 'fiji water', 'mineral water', 'water bottle'],
    warning: 'DEHP detected in bottled water — some brands exceed FDA limits by 283%',
    source: 'PlasticList',
    url: 'https://www.plasticlist.org/report',
  },
  {
    keywords: ['boba', 'bubble tea'],
    warning: 'BPA in boba tea at up to 32,571% of EFSA safety limit',
    source: 'PlasticList',
    url: 'https://www.plasticlist.org/report',
  },
  {
    keywords: ['yogurt', 'yoghurt', 'yoghourt'],
    warning: 'Plastic chemicals detected in 100% of yogurt products tested',
    source: 'PlasticList',
    url: 'https://www.plasticlist.org/report',
  },
  {
    keywords: ['ice cream', 'icecream', 'gelato'],
    warning: 'Plastic chemicals detected in 100% of ice cream products tested',
    source: 'PlasticList',
    url: 'https://www.plasticlist.org/report',
  },
  {
    keywords: ['baby food', 'infant formula', 'formula milk', 'gerber', 'prenatal'],
    warning: 'Plastic chemicals detected in 100% of baby foods and prenatal supplements tested',
    source: 'PlasticList',
    url: 'https://www.plasticlist.org/report',
  },
  {
    keywords: ['starbucks', 'coffee to go', 'coffee cup', 'to-go coffee', 'to go coffee'],
    warning: 'BPA in Starbucks products at 4,740% of EFSA safety limit',
    source: 'PlasticList',
    url: 'https://www.plasticlist.org/report',
  },
];

/**
 * Scan diet text fields for food contaminant matches.
 * Returns array of { type, warning, source, url, match }
 */
export function scanDietForContaminants(diet) {
  if (!diet) return [];
  const warnings = [];
  const seen = new Set();

  // Collect food-relevant text fields only.
  // Exclude: note (freeform, "I avoid X" causes false positives),
  //          restrictions (negation by definition — "corn-free" ≠ eating corn),
  //          type (e.g., "omnivore" — not food names)
  const texts = [
    diet.breakfast, diet.lunch, diet.dinner, diet.snacks,
  ].filter(Boolean).map(t => t.toLowerCase()).join(' | ');

  if (!texts.trim()) return [];

  // Word-boundary match helper — avoids "apple" matching "apple cider vinegar"
  function wordMatch(text, keyword) {
    return new RegExp('\\b' + keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(text);
  }

  // 1. EWG Dirty Dozen scan
  for (let rank = 0; rank < EWG_DIRTY_DOZEN.length; rank++) {
    const [displayName, ...variants] = EWG_DIRTY_DOZEN[rank];
    for (const v of variants) {
      if (wordMatch(texts, v) && !seen.has('ewg:' + displayName)) {
        seen.add('ewg:' + displayName);
        warnings.push({
          type: 'pesticide',
          warning: `${displayName}: #${rank + 1} on EWG Dirty Dozen — high pesticide residues, consider organic`,
          source: 'EWG',
          url: 'https://www.ewg.org/foodnews/dirty-dozen.php',
          match: v,
        });
        break;
      }
    }
  }

  // 2. EWG Clean Fifteen (positive signal)
  for (const [displayName, ...variants] of EWG_CLEAN_FIFTEEN) {
    for (const v of variants) {
      if (wordMatch(texts, v) && !seen.has('ewg:' + displayName)) {
        seen.add('ewg:' + displayName);
        warnings.push({
          type: 'clean',
          warning: `${displayName}: on EWG Clean Fifteen — lowest pesticide residues`,
          source: 'EWG',
          url: 'https://www.ewg.org/foodnews/clean-fifteen.php',
          match: v,
        });
        break;
      }
    }
  }

  // 3. PlasticList category scan
  for (const entry of PLASTIC_WARNINGS) {
    for (const kw of entry.keywords) {
      if (wordMatch(texts, kw) && !seen.has('plastic:' + entry.warning)) {
        seen.add('plastic:' + entry.warning);
        warnings.push({
          type: 'plastic',
          warning: entry.warning,
          source: entry.source,
          url: entry.url,
          match: kw,
        });
        break;
      }
    }
  }

  return warnings;
}
