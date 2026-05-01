// Structured knowledge base for DermaSeva — WHO, NHM, IMNCI guidelines
// Used to find candidate conditions from symptoms before feeding to Gemma 4 E2B

import type { Category } from '@/store/app-store';

export interface ConditionEntry {
  id: string;
  name: string;
  category: Category;
  symptoms: string[];
  keySigns: string[];
  severity: 'mild' | 'moderate' | 'severe';
  actionSteps: string[];
  otc: string | null;
  referral: string;
  source: string;
  followUp: string;
}

// ── SKIN CONDITIONS ──────────────────────────────────────────────────────────

const SKIN: ConditionEntry[] = [
  {
    id: 'dry-skin', name: 'Dry Skin (Xerosis)', category: 'skin',
    symptoms: ['dry', 'dryness', 'rough', 'flaky', 'cracked', 'moisturize', 'parched', 'scaling', 'peeling', 'tight skin', 'ashy'],
    keySigns: ['Dry, rough texture', 'Fine scaling or flaking', 'Mild itching', 'No redness or infection'],
    severity: 'mild',
    actionSteps: ['Apply fragrance-free moisturizing cream twice daily', 'Avoid harsh soaps — use mild soap only', 'Drink adequate water', 'Wear cotton clothing'],
    otc: 'Fragrance-free moisturizing cream (petroleum jelly or coconut oil)',
    referral: 'Visit PHC if cracking, bleeding, or signs of infection appear',
    source: 'NHM ASHA Guidelines', followUp: '2 weeks',
  },
  {
    id: 'ringworm', name: 'Ringworm (Tinea corporis)', category: 'skin',
    symptoms: ['ring', 'circular', 'round', 'fungal', 'fungus', 'tinea', 'patch', 'scaly ring', 'itchy patch', 'spreading circle'],
    keySigns: ['Circular scaly plaque with central clearing', 'Itching', 'Red raised border', 'Single or multiple lesions'],
    severity: 'mild',
    actionSteps: ['Apply Clotrimazole 1% cream twice daily for 2-4 weeks', 'Keep area clean and dry', 'Do not share towels or clothing'],
    otc: 'Clotrimazole 1% cream',
    referral: 'Refer to PHC if no improvement after 4 weeks or if spreading',
    source: 'NHM ASHA Guidelines + WHO Skin', followUp: '2 weeks',
  },
  {
    id: 'scabies', name: 'Scabies', category: 'skin',
    symptoms: ['scabies', 'itch', 'itching', 'night itch', 'burrow', 'family itch', 'fingers itch', 'wrist itch', 'mite', 'scratching'],
    keySigns: ['Intense itching worse at night', 'Burrow tracks in finger web spaces', 'Family members also affected', 'Secondary excoriation'],
    severity: 'moderate',
    actionSteps: ['Apply Permethrin 5% cream neck to toes overnight', 'Treat ALL household contacts', 'Wash clothing and bedding at 60°C', 'Repeat after 1 week'],
    otc: null,
    referral: 'Refer if secondary bacterial infection suspected',
    source: 'WHO Skin Guidelines', followUp: '1 week',
  },
  {
    id: 'eczema', name: 'Eczema (Atopic Dermatitis)', category: 'skin',
    symptoms: ['eczema', 'atopic', 'dry itchy', 'inflamed', 'red patches', 'chronic itch', 'flexural', 'elbow crease', 'knee crease'],
    keySigns: ['Dry itchy inflamed skin', 'Lichenification', 'Flexural involvement', 'Chronic relapsing course'],
    severity: 'mild',
    actionSteps: ['Apply fragrance-free moisturizer regularly', 'Avoid triggers: harsh soap, wool, excessive sweat', 'Keep nails short to prevent scratching'],
    otc: 'Fragrance-free moisturizing cream',
    referral: 'Refer to PHC if moderate-severe or steroids needed',
    source: 'WHO Skin Guidelines', followUp: '2 weeks',
  },
  {
    id: 'contact-dermatitis', name: 'Contact Dermatitis', category: 'skin',
    symptoms: ['contact', 'irritant', 'allergic', 'rash after touching', 'detergent', 'soap rash', 'chemical', 'blister', 'red skin', 'reaction'],
    keySigns: ['Red itchy skin at contact site', 'Vesicles or blisters', 'Clear boundary matching contact area'],
    severity: 'mild',
    actionSteps: ['Identify and remove the irritant/allergen', 'Apply Calamine lotion for relief', 'Avoid re-exposure'],
    otc: 'Calamine lotion',
    referral: 'Refer if severe, widespread, or no improvement in 7 days',
    source: 'NHM ASHA Guidelines', followUp: '1 week',
  },
  {
    id: 'heat-rash', name: 'Heat Rash (Miliaria)', category: 'skin',
    symptoms: ['heat rash', 'prickly', 'sweat', 'bumps', 'hot weather', 'rash summer', 'small red bumps', 'prickly heat'],
    keySigns: ['Small red papules/vesicles', 'Prickling sensation', 'Occurs in hot humid weather', 'On covered areas'],
    severity: 'mild',
    actionSteps: ['Move to cool environment', 'Wear loose cotton clothing', 'Apply talc-free powder', 'Keep area dry'],
    otc: 'Talc-free powder',
    referral: 'Refer if infected',
    source: 'WHO Skin Guidelines', followUp: '1 week',
  },
  {
    id: 'tinea-versicolor', name: 'Tinea Versicolor', category: 'skin',
    symptoms: ['light patches', 'dark patches', 'discolored', 'white spots', 'chest patches', 'back patches', 'color change skin', 'pityriasis'],
    keySigns: ['Hypo or hyperpigmented macules on trunk', 'Fine scaling', 'Common on chest and back'],
    severity: 'mild',
    actionSteps: ['Apply Ketoconazole 2% shampoo topically for 10 min', 'Continue for 2 weeks', 'May recur in tropical climate'],
    otc: 'Ketoconazole 2% shampoo (topical)',
    referral: 'Refer if extensive or recurring',
    source: 'NHM ASHA Guidelines', followUp: '2 weeks',
  },
  {
    id: 'impetigo', name: 'Impetigo', category: 'skin',
    symptoms: ['honey crust', 'crusted', 'sore', 'weeping', 'yellow crust', 'child sore', 'contagious rash'],
    keySigns: ['Honey-colored crusted lesions', 'Common in children', 'Superficial bacterial infection'],
    severity: 'moderate',
    actionSteps: ['Apply topical mupirocin for localized disease', 'Oral antibiotics if extensive', 'Keep lesions clean', 'Prevent spread — separate towels'],
    otc: null,
    referral: 'Refer if extensive or in neonates',
    source: 'WHO Skin Guidelines', followUp: '5 days',
  },
  {
    id: 'cellulitis', name: 'Cellulitis', category: 'skin',
    symptoms: ['swollen', 'red warm', 'spreading red', 'fever skin', 'infected wound', 'hot swollen', 'painful red'],
    keySigns: ['Spreading erythema', 'Warmth and swelling', 'Fever', 'Tenderness'],
    severity: 'severe',
    actionSteps: ['Refer IMMEDIATELY to hospital', 'Patient may need IV antibiotics', 'Do NOT attempt treatment'],
    otc: null,
    referral: 'Immediate referral — needs systemic antibiotics',
    source: 'WHO Skin Guidelines', followUp: 'Hospital follow-up',
  },
  {
    id: 'leprosy', name: 'Leprosy (Hansen\'s disease)', category: 'skin',
    symptoms: ['numb patch', 'no feeling', 'sensation loss', 'pale patch numb', 'thickened nerve', 'weakness hand'],
    keySigns: ['Hypopigmented patch with loss of sensation', 'Thickened peripheral nerves', 'Weakness in hands/feet'],
    severity: 'severe',
    actionSteps: ['DO NOT attempt treatment', 'Refer immediately to district hospital', 'This is a notifiable disease'],
    otc: null,
    referral: 'Immediate referral to district hospital',
    source: 'NHM ASHA + WHO', followUp: 'Under specialist care',
  },
  {
    id: 'acne', name: 'Acne Vulgaris', category: 'skin',
    symptoms: ['pimple', 'acne', 'zit', 'blackhead', 'whitehead', 'oily skin', 'face bumps', 'breakout', 'spots face'],
    keySigns: ['Comedones (blackheads/whiteheads)', 'Papules and pustules', 'Common on face, chest, back', 'Oily skin'],
    severity: 'mild',
    actionSteps: ['Wash face twice daily with mild cleanser', 'Do not squeeze or pop pimples', 'Avoid oily cosmetics', 'Keep hair clean and off face'],
    otc: 'Benzoyl peroxide 2.5% gel (if available)',
    referral: 'Refer if severe cystic acne or scarring',
    source: 'WHO Skin Guidelines', followUp: '4 weeks',
  },
  {
    id: 'urticaria', name: 'Urticaria (Hives)', category: 'skin',
    symptoms: ['hives', 'welts', 'raised red', 'allergic rash', 'swelling skin', 'itchy welts', 'allergy', 'food reaction'],
    keySigns: ['Raised itchy wheals', 'Come and go within hours', 'May follow food/drug/insect exposure'],
    severity: 'moderate',
    actionSteps: ['Identify and avoid trigger', 'Antihistamine if available', 'Monitor for breathing difficulty'],
    otc: null,
    referral: 'Refer immediately if breathing difficulty, tongue/lip swelling (anaphylaxis)',
    source: 'WHO Skin Guidelines', followUp: '48 hours',
  },
  {
    id: 'wound', name: 'Minor Wound / Cut', category: 'skin',
    symptoms: ['wound', 'cut', 'bleeding', 'scratch', 'injury', 'torn skin', 'laceration', 'gash'],
    keySigns: ['Break in skin', 'Bleeding', 'Possible debris in wound'],
    severity: 'mild',
    actionSteps: ['Clean wound with clean water', 'Apply antiseptic (povidone-iodine)', 'Cover with clean bandage', 'Check tetanus vaccination status'],
    otc: 'Povidone-iodine antiseptic + clean bandage',
    referral: 'Refer if deep, won\'t stop bleeding, or signs of infection',
    source: 'NHM First Aid Protocol', followUp: '3 days',
  },
  {
    id: 'burn', name: 'Minor Burn', category: 'skin',
    symptoms: ['burn', 'burnt', 'scald', 'hot water', 'fire', 'blister burn', 'cooking burn'],
    keySigns: ['Redness and pain', 'Possible blisters', 'Limited area affected'],
    severity: 'moderate',
    actionSteps: ['Cool under running water for 10-20 minutes', 'Do NOT apply ice, butter, or toothpaste', 'Cover with clean cloth', 'Give paracetamol for pain'],
    otc: null,
    referral: 'Refer if blisters, face/hands/genitals involved, or large area',
    source: 'WHO First Aid', followUp: '24 hours',
  },
  {
    id: 'fungal-general', name: 'Fungal Skin Infection', category: 'skin',
    symptoms: ['fungal', 'fungus', 'white patch', 'red patch itchy', 'between toes', 'groin itch', 'jock itch', 'athlete foot'],
    keySigns: ['Itchy red or discolored patches', 'Scaling at edges', 'Common in warm moist areas'],
    severity: 'mild',
    actionSteps: ['Apply topical antifungal cream twice daily', 'Keep area clean and dry', 'Wear loose breathable clothing', 'Continue treatment for 2-4 weeks'],
    otc: 'Clotrimazole 1% or Miconazole 2% cream',
    referral: 'Refer if extensive, on scalp, or not improving after 4 weeks',
    source: 'WHO Skin Guidelines', followUp: '2 weeks',
  },
  {
    id: 'dandruff', name: 'Dandruff (Seborrheic Dermatitis)', category: 'skin',
    symptoms: ['dandruff', 'flaky scalp', 'itchy scalp', 'white flakes', 'scalp itch', 'head scratch'],
    keySigns: ['White or yellow flakes on scalp', 'Mild itching', 'Greasy scaling'],
    severity: 'mild',
    actionSteps: ['Use anti-dandruff shampoo 2-3 times per week', 'Gently massage scalp while washing', 'Avoid scratching'],
    otc: 'Ketoconazole 2% or Zinc pyrithione shampoo',
    referral: 'Refer if severe, spreading to face, or not improving',
    source: 'WHO Skin Guidelines', followUp: '4 weeks',
  },
];

// ── CHILD HEALTH CONDITIONS ──────────────────────────────────────────────────

const CHILD: ConditionEntry[] = [
  {
    id: 'pneumonia', name: 'Pneumonia (ARI)', category: 'child_health',
    symptoms: ['cough', 'breathing', 'fast breath', 'chest', 'wheeze', 'pneumonia', 'cold', 'ari', 'difficult breathing'],
    keySigns: ['Fast breathing for age', 'Cough >3 days', 'Possible chest indrawing'],
    severity: 'moderate',
    actionSteps: ['Count respiratory rate for 1 full minute', 'Give first dose of Amoxicillin', 'Refer to PHC within 24 hours', 'Advise mother on danger signs'],
    otc: null,
    referral: 'Refer to PHC. If chest indrawing or unable to drink — refer URGENTLY',
    source: 'IMNCI Protocol', followUp: 'Day 3 after antibiotic',
  },
  {
    id: 'diarrhea', name: 'Diarrhea with Dehydration', category: 'child_health',
    symptoms: ['loose stool', 'diarrhea', 'diarrhoea', 'watery', 'vomit', 'dehydration', 'loose motion', 'potty', 'runny stomach'],
    keySigns: ['Multiple loose stools', 'Sunken eyes', 'Drinks eagerly', 'Restless or irritable', 'Skin pinch goes back slowly'],
    severity: 'moderate',
    actionSteps: ['Start ORS immediately', 'Under 2 years: 50-100ml after each stool', 'Give Zinc 20mg daily for 14 days', 'Continue breastfeeding', 'Refer if vomiting everything or lethargic'],
    otc: 'ORS packets + Zinc 20mg tablets',
    referral: 'Refer if severe dehydration, blood in stool, or persistent >14 days',
    source: 'IMNCI Protocol', followUp: 'Day 3',
  },
  {
    id: 'fever', name: 'Fever — Evaluate for Malaria', category: 'child_health',
    symptoms: ['fever', 'hot', 'temperature', 'malaria', 'chills', 'shiver', 'warm body', 'burning'],
    keySigns: ['High temperature', 'Possible chills/rigors', 'Check for stiff neck', 'Check for rash'],
    severity: 'moderate',
    actionSteps: ['Perform RDT for malaria if in endemic area', 'Give paracetamol for fever', 'Check for stiff neck and danger signs', 'Refer if fever >3 days or danger signs'],
    otc: 'Paracetamol as per weight',
    referral: 'Refer if RDT positive, stiff neck, or fever >3 days',
    source: 'IMNCI Protocol', followUp: '48 hours',
  },
  {
    id: 'measles', name: 'Measles', category: 'child_health',
    symptoms: ['measles', 'rash fever', 'red spots', 'runny nose fever', 'cough fever rash', 'red eyes fever'],
    keySigns: ['Fever with rash', 'Cough and runny nose', 'Red eyes (conjunctivitis)', 'Koplik spots in mouth'],
    severity: 'moderate',
    actionSteps: ['Give Vitamin A as per age', 'Treat eye and mouth complications', 'Monitor for pneumonia', 'Refer if severe'],
    otc: null,
    referral: 'Refer if complications (pneumonia, mouth ulcers, eye problems)',
    source: 'IMNCI Protocol', followUp: 'Day 3',
  },
  {
    id: 'newborn-danger', name: 'Newborn Danger Signs', category: 'child_health',
    symptoms: ['newborn', 'baby not feeding', 'baby convulsion', 'baby cold', 'baby hot', 'umbilical red', 'baby yellow', 'jaundice baby'],
    keySigns: ['Not feeding', 'Convulsions', 'Fast breathing (60+/min)', 'Temperature abnormal', 'Jaundice <24hrs', 'Lethargy'],
    severity: 'severe',
    actionSteps: ['DO NOT attempt treatment', 'Arrange IMMEDIATE referral to hospital', 'Keep baby warm during transport', 'Continue breastfeeding if possible'],
    otc: null,
    referral: 'IMMEDIATE referral to hospital',
    source: 'IMNCI Protocol', followUp: 'Hospital care',
  },
  {
    id: 'ear-infection', name: 'Ear Infection (Otitis Media)', category: 'child_health',
    symptoms: ['ear pain', 'ear discharge', 'ear pus', 'pulling ear', 'hearing problem', 'ear ache'],
    keySigns: ['Ear pain or discharge', 'Child pulling at ear', 'Possible fever', 'Discharge duration matters'],
    severity: 'moderate',
    actionSteps: ['Dry ear wicking with clean cloth', 'Give paracetamol for pain', 'Do NOT put oil or drops unless prescribed', 'Refer if discharge >14 days or fever'],
    otc: 'Paracetamol for pain',
    referral: 'Refer if chronic discharge, fever, or swelling behind ear',
    source: 'IMNCI Protocol', followUp: '5 days',
  },
];

// ── MALNUTRITION CONDITIONS ──────────────────────────────────────────────────

const NUTRITION: ConditionEntry[] = [
  {
    id: 'sam', name: 'Severe Acute Malnutrition (SAM)', category: 'malnutrition',
    symptoms: ['thin', 'wasting', 'muac red', 'not eating', 'underweight', 'malnourish', 'bones visible', 'very thin', 'swollen feet'],
    keySigns: ['MUAC <11.5cm', 'Visible severe wasting', 'Possible bilateral edema', 'Weight-for-Height <-3 SD'],
    severity: 'severe',
    actionSteps: ['Measure MUAC — confirm <11.5cm', 'Check for medical complications', 'If complications: refer to NRC immediately', 'If no complications: start CMAM with RUTF', 'Weekly follow-up at Anganwadi'],
    otc: null,
    referral: 'Refer to NRC/Hospital if complications present',
    source: 'NHM SAM Management Protocol', followUp: 'Weekly until MUAC >12.5cm',
  },
  {
    id: 'mam', name: 'Moderate Acute Malnutrition (MAM)', category: 'malnutrition',
    symptoms: ['thin child', 'not gaining weight', 'muac yellow', 'small for age', 'poor appetite', 'not growing', 'weight loss'],
    keySigns: ['MUAC 11.5-12.4cm', 'Weight-for-Height between -2 and -3 SD', 'No edema'],
    severity: 'moderate',
    actionSteps: ['Supplementary feeding through ICDS', 'Energy-dense foods: add oil/ghee to meals', 'Protein: dal, eggs, milk, groundnuts', 'Feed 5-6 times daily', 'Continue breastfeeding if under 2'],
    otc: 'Iron + Folic Acid supplementation',
    referral: 'Refer to PHC if not improving after 2 months',
    source: 'NHM/ICDS Guidelines', followUp: 'Biweekly at Anganwadi',
  },
  {
    id: 'anemia', name: 'Iron Deficiency Anemia', category: 'malnutrition',
    symptoms: ['pale', 'anemia', 'anaemia', 'iron', 'weak', 'tired', 'nails pale', 'fatigue', 'low energy'],
    keySigns: ['Pallor of palms, nails, conjunctivae', 'Fatigue and weakness', 'Poor appetite'],
    severity: 'moderate',
    actionSteps: ['Check pallor in palms, nails, tongue', 'If severe pallor: refer for Hb check', 'Start iron syrup 3mg/kg/day for 3 months', 'Give folic acid', 'Counsel on iron-rich foods (jaggery, green leafy vegetables)', 'Deworming with Albendazole if >1 year'],
    otc: 'Iron syrup + folic acid',
    referral: 'Refer immediately if Hb <7 (severe anemia)',
    source: 'NHM WIFS Guidelines', followUp: '1 month for Hb recheck',
  },
  {
    id: 'vitamin-a', name: 'Vitamin A Deficiency', category: 'malnutrition',
    symptoms: ['night blind', 'eye dry', 'cannot see dark', 'bitot spots', 'eye problem vitamin'],
    keySigns: ['Night blindness', 'Bitot spots on conjunctiva', 'Corneal xerosis'],
    severity: 'moderate',
    actionSteps: ['Give Vitamin A as per age dose', 'Refer immediately if corneal ulceration', 'Counsel on Vitamin A rich foods (papaya, mango, carrots, green leafy vegetables)'],
    otc: 'Vitamin A supplementation',
    referral: 'Refer if corneal involvement',
    source: 'NHM/WHO Guidelines', followUp: 'Day 2 and Day 15',
  },
  {
    id: 'stunting', name: 'Stunting (Chronic Malnutrition)', category: 'malnutrition',
    symptoms: ['short', 'not growing tall', 'small height', 'stunted', 'short for age'],
    keySigns: ['Height-for-Age below -2 SD', 'Long-term inadequate nutrition', 'Cannot be reversed quickly'],
    severity: 'moderate',
    actionSteps: ['Ensure diverse balanced diet', 'Continue growth monitoring monthly', 'Ensure complete immunization', 'Address any underlying illness', 'Counsel on IYCF practices'],
    otc: null,
    referral: 'Refer if severely stunted (<-3 SD) or other concerns',
    source: 'NHM/WHO Growth Standards', followUp: 'Monthly growth monitoring',
  },
  {
    id: 'recovery', name: 'Recovery / Follow-up', category: 'malnutrition',
    symptoms: ['better', 'improve', 'fine', 'recover', 'well', 'good', 'plan', 'next steps', 'doing well'],
    keySigns: ['Improvement from previous condition', 'Child gaining weight'],
    severity: 'mild',
    actionSteps: ['Continue current treatment', 'Ensure balanced nutrition', 'Monthly growth monitoring', 'Complete pending vaccinations', 'Watch for returning danger signs'],
    otc: null,
    referral: 'Continue routine care',
    source: 'NHM Follow-up Protocol', followUp: 'Next monthly growth monitoring',
  },
];

// ── ALL CONDITIONS ───────────────────────────────────────────────────────────

export const ALL_CONDITIONS: ConditionEntry[] = [...SKIN, ...CHILD, ...NUTRITION];

// ── CANDIDATE FINDER ─────────────────────────────────────────────────────────

export interface CandidateMatch {
  condition: ConditionEntry;
  score: number;
  matchedKeywords: string[];
}

export function findCandidateConditions(
  symptomText: string,
  category?: Category,
  topK = 3
): CandidateMatch[] {
  const lower = symptomText.toLowerCase();
  const words = lower.split(/\s+/);

  let pool = ALL_CONDITIONS;
  if (category) {
    pool = pool.filter(c => c.category === category);
  }

  const scored: CandidateMatch[] = [];

  for (const condition of pool) {
    let score = 0;
    const matched: string[] = [];

    for (const keyword of condition.symptoms) {
      // Exact substring match in the full text
      if (lower.includes(keyword)) {
        score += keyword.length > 4 ? 3 : 2; // longer keywords score higher
        matched.push(keyword);
      }
      // Individual word match
      for (const word of words) {
        if (word.length > 2 && keyword.includes(word) && !matched.includes(keyword)) {
          score += 1;
          matched.push(keyword);
        }
      }
    }

    if (score > 0) {
      scored.push({ condition, score, matchedKeywords: matched });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

// ── FORMAT FOR PROMPT ────────────────────────────────────────────────────────

export function formatCandidatesForPrompt(candidates: CandidateMatch[]): string {
  if (candidates.length === 0) return '';

  const parts = candidates.map((c, i) => {
    const e = c.condition;
    return `Candidate ${i + 1}: ${e.name}
Key signs: ${e.keySigns.join('; ')}
Default severity: ${e.severity}
Action steps: ${e.actionSteps.join('; ')}
OTC: ${e.otc ?? 'None — refer to doctor'}
Referral: ${e.referral}
Source: ${e.source}
Follow-up: ${e.followUp}`;
  });

  return `CANDIDATE CONDITIONS (from WHO/NHM/IMNCI guidelines — judge which fits best):\n\n${parts.join('\n\n')}`;
}
