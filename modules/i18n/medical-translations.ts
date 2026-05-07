/**
 * medical-translations.ts — Pre-translated medical phrases for all 6 languages.
 * Used to translate guideline-based output and TTS narration into the user's language.
 * Covers: keySigns, actionSteps, referral, followUp, and TTS narration phrases.
 */

type LangMap = Record<string, string>;

// ─── TTS Narration Phrases ──────────────────────────────────────────────────

export const NARRATION: Record<string, LangMap> = {
  screeningComplete: {
    en: 'Screening complete.',
    hi: 'जांच पूरी हुई।',
    te: 'స్క్రీనింగ్ పూర్తయింది.',
    ta: 'பரிசோதனை முடிந்தது.',
    kn: 'ಸ್ಕ್ರೀನಿಂಗ್ ಪೂರ್ಣಗೊಂಡಿದೆ.',
    mr: 'तपासणी पूर्ण झाली.',
  },
  likelyCondition: {
    en: 'The likely condition is',
    hi: 'संभावित स्थिति है',
    te: 'సంభావ్య పరిస్థితి',
    ta: 'சாத்தியமான நிலை',
    kn: 'ಸಂಭಾವ್ಯ ಸ್ಥಿತಿ',
    mr: 'संभाव्य स्थिती आहे',
  },
  mildCondition: {
    en: 'This appears to be a mild condition.',
    hi: 'यह एक हल्की स्थिति है।',
    te: 'ఇది తేలికపాటి పరిస్థితి.',
    ta: 'இது ஒரு லேசான நிலை.',
    kn: 'ಇದು ಸೌಮ್ಯ ಸ್ಥಿತಿ.',
    mr: 'ही एक सौम्य स्थिती आहे.',
  },
  moderateCondition: {
    en: 'This is a moderate condition that needs attention.',
    hi: 'यह एक मध्यम स्थिति है जिस पर ध्यान देने की जरूरत है।',
    te: 'ఇది శ్రద్ధ అవసరమైన మధ్యస్థ పరిస్థితి.',
    ta: 'இது கவனிக்க வேண்டிய மிதமான நிலை.',
    kn: 'ಇದು ಗಮನ ಬೇಕಾದ ಮಧ್ಯಮ ಸ್ಥಿತಿ.',
    mr: 'ही एक मध्यम स्थिती आहे ज्याकडे लक्ष देणे आवश्यक आहे.',
  },
  severeCondition: {
    en: 'This is a severe condition requiring urgent care.',
    hi: 'यह एक गंभीर स्थिति है जिसे तुरंत इलाज की जरूरत है।',
    te: 'ఇది తక్షణ చికిత్స అవసరమైన తీవ్ర పరిస్థితి.',
    ta: 'இது அவசர சிகிச்சை தேவைப்படும் தீவிர நிலை.',
    kn: 'ಇದು ತುರ್ತು ಚಿಕಿತ್ಸೆ ಬೇಕಾದ ತೀವ್ರ ಸ್ಥಿತಿ.',
    mr: 'ही एक गंभीर स्थिती आहे ज्यासाठी तातडीने उपचार आवश्यक आहेत.',
  },
  patientMayShow: {
    en: 'The patient may show the following signs.',
    hi: 'रोगी में ये लक्षण दिख सकते हैं।',
    te: 'రోగి ఈ క్రింది లక్షణాలు చూపవచ్చు.',
    ta: 'நோயாளி பின்வரும் அறிகுறிகளைக் காட்டலாம்.',
    kn: 'ರೋಗಿ ಈ ಕೆಳಗಿನ ಲಕ್ಷಣಗಳನ್ನು ತೋರಿಸಬಹುದು.',
    mr: 'रुग्णामध्ये खालील लक्षणे दिसू शकतात.',
  },
  whatYouShouldDo: {
    en: 'Here is what you should do.',
    hi: 'यहाँ बताया गया है कि आपको क्या करना चाहिए।',
    te: 'మీరు ఏమి చేయాలో ఇక్కడ ఉంది.',
    ta: 'நீங்கள் என்ன செய்ய வேண்டும் என்பது இங்கே.',
    kn: 'ನೀವು ಏನು ಮಾಡಬೇಕು ಎಂಬುದು ಇಲ್ಲಿದೆ.',
    mr: 'तुम्ही काय करावे ते येथे सांगितले आहे.',
  },
  step: {
    en: 'Step',
    hi: 'चरण',
    te: 'దశ',
    ta: 'படி',
    kn: 'ಹಂತ',
    mr: 'पायरी',
  },
  medicationSuggestion: {
    en: 'Medication suggestion.',
    hi: 'दवा का सुझाव।',
    te: 'మందు సూచన.',
    ta: 'மருந்து பரிந்துரை.',
    kn: 'ಔಷಧಿ ಸಲಹೆ.',
    mr: 'औषधाचा सल्ला.',
  },
  regardingDoctor: {
    en: 'Regarding doctor visit.',
    hi: 'डॉक्टर से मिलने के बारे में।',
    te: 'డాక్టర్ సందర్శన గురించి.',
    ta: 'மருத்துவர் வருகை குறித்து.',
    kn: 'ವೈದ್ಯರ ಭೇಟಿ ಬಗ್ಗೆ.',
    mr: 'डॉक्टरांच्या भेटीबद्दल.',
  },
  followUpPlan: {
    en: 'Follow up plan.',
    hi: 'फॉलो-अप योजना।',
    te: 'ఫాలో-అప్ ప్రణాళిక.',
    ta: 'பின்தொடர் திட்டம்.',
    kn: 'ಅನುಸರಣೆ ಯೋಜನೆ.',
    mr: 'फॉलो-अप योजना.',
  },
};

// ─── Common Action Step Translations ─────────────────────────────────────────

export const ACTION_STEPS: Record<string, LangMap> = {
  'Apply fragrance-free moisturizing cream twice daily': {
    hi: 'दिन में दो बार बिना खुशबू वाली मॉइस्चराइज़र क्रीम लगाएं',
    te: 'రోజుకు రెండుసార్లు సుగంధ రహిత మాయిశ్చరైజర్ క్రీమ్ రాయండి',
    ta: 'நாளுக்கு இருமுறை வாசனையற்ற ஈரப்பதமூட்டி கிரீம் தடவவும்',
    kn: 'ದಿನಕ್ಕೆ ಎರಡು ಬಾರಿ ಸುಗಂಧ ರಹಿತ ಮಾಯ್ಶ್ಚರೈಸರ್ ಕ್ರೀಮ್ ಹಚ್ಚಿ',
    mr: 'दिवसातून दोनदा सुगंध-मुक्त मॉइश्चरायझर क्रीम लावा',
  },
  'Avoid harsh soaps — use mild soap only': {
    hi: 'कठोर साबुन से बचें — केवल हल्का साबुन इस्तेमाल करें',
    te: 'కఠినమైన సబ్బులు వాడకండి — మృదువైన సబ్బు మాత్రమే వాడండి',
    ta: 'கடினமான சோப்பு பயன்படுத்த வேண்டாம் — மிருதுவான சோப்பு மட்டும் பயன்படுத்தவும்',
    kn: 'கடுமையான साबन वापरू नका — फक्त सौम्य साबण वापरा',
    mr: 'कठोर साबण वापरू नका — फक्त सौम्य साबण वापरा',
  },
  'Drink adequate water': {
    hi: 'पर्याप्त पानी पिएं',
    te: 'తగినంత నీరు తాగండి',
    ta: 'போதுமான தண்ணீர் குடிக்கவும்',
    kn: 'ಸಾಕಷ್ಟು ನೀರು ಕುಡಿಯಿರಿ',
    mr: 'पुरेसे पाणी प्या',
  },
  'Wear cotton clothing': {
    hi: 'सूती कपड़े पहनें',
    te: 'కాటన్ దుస్తులు ధరించండి',
    ta: 'பருத்தி ஆடைகளை அணியுங்கள்',
    kn: 'ಹತ್ತಿ ಬಟ್ಟೆಗಳನ್ನು ಧರಿಸಿ',
    mr: 'सुती कपडे घाला',
  },
  'Apply fragrance-free moisturizer regularly': {
    hi: 'नियमित रूप से बिना खुशबू वाला मॉइस्चराइज़र लगाएं',
    te: 'క్రమం తప్పకుండా సుగంధ రహిత మాయిశ్చరైజర్ రాయండి',
    ta: 'தொடர்ந்து வாசனையற்ற ஈரப்பதமூட்டி தடவவும்',
    kn: 'ನಿಯಮಿತವಾಗಿ ಸುಗಂಧ ರಹಿತ ಮಾಯ್ಶ್ಚರೈಸರ್ ಹಚ್ಚಿ',
    mr: 'नियमितपणे सुगंध-मुक्त मॉइश्चरायझर लावा',
  },
  'Avoid triggers: harsh soap, wool, excessive sweat': {
    hi: 'ट्रिगर से बचें: कठोर साबुन, ऊन, अधिक पसीना',
    te: 'ట్రిగ్గర్లను నివారించండి: కఠినమైన సబ్బు, ఉన్ని, అధిక చెమట',
    ta: 'தூண்டிகளை தவிர்க்கவும்: கடினமான சோப்பு, கம்பளி, அதிக வியர்வை',
    kn: 'ಪ್ರಚೋದಕಗಳನ್ನು ತಪ್ಪಿಸಿ: ಕಠಿಣ ಸಾಬೂನು, ಉಣ್ಣೆ, ಅಧಿಕ ಬೆವರು',
    mr: 'ट्रिगर टाळा: कठोर साबण, लोकर, जास्त घाम',
  },
  'Keep nails short to prevent scratching': {
    hi: 'खरोंचने से बचने के लिए नाखून छोटे रखें',
    te: 'గోకడం నివారించడానికి గోళ్ళు చిన్నగా ఉంచండి',
    ta: 'கீறலைத் தடுக்க நகங்களை சிறியதாக வைக்கவும்',
    kn: 'ಕೆರೆಯುವುದನ್ನು ತಡೆಯಲು ಉಗುರುಗಳನ್ನು ಚಿಕ್ಕದಾಗಿ ಇಡಿ',
    mr: 'खरचटणे टाळण्यासाठी नखे लहान ठेवा',
  },
  'Keep area clean and dry': {
    hi: 'प्रभावित क्षेत्र को साफ और सूखा रखें',
    te: 'ప్రభావిత ప్రాంతాన్ని శుభ్రంగా మరియు పొడిగా ఉంచండి',
    ta: 'பாதிக்கப்பட்ட பகுதியை சுத்தமாகவும் உலர்வாகவும் வைக்கவும்',
    kn: 'ಪೀಡಿತ ಪ್ರದೇಶವನ್ನು ಶುಚಿಯಾಗಿ ಮತ್ತು ಒಣಗಿಸಿ ಇಡಿ',
    mr: 'प्रभावित भाग स्वच्छ आणि कोरडा ठेवा',
  },
  'Move to cool environment': {
    hi: 'ठंडी जगह पर जाएं',
    te: 'చల్లని వాతావరణానికి వెళ్ళండి',
    ta: 'குளிர்ந்த சூழலுக்கு செல்லவும்',
    kn: 'ತಂಪಾದ ವಾತಾವರಣಕ್ಕೆ ಹೋಗಿ',
    mr: 'थंड वातावरणात जा',
  },
  'Wear loose cotton clothing': {
    hi: 'ढीले सूती कपड़े पहनें',
    te: 'వదులు కాటన్ దుస్తులు ధరించండి',
    ta: 'தளர்வான பருத்தி ஆடைகளை அணியுங்கள்',
    kn: 'ಸಡಿಲ ಹತ್ತಿ ಬಟ್ಟೆಗಳನ್ನು ಧರಿಸಿ',
    mr: 'सैल सुती कपडे घाला',
  },
  'Start ORS immediately': {
    hi: 'तुरंत ORS शुरू करें',
    te: 'వెంటనే ORS ప్రారంభించండి',
    ta: 'உடனடியாக ORS தொடங்குங்கள்',
    kn: 'ತಕ್ಷಣ ORS ಪ್ರಾರಂಭಿಸಿ',
    mr: 'लगेच ORS सुरू करा',
  },
  'Continue breastfeeding': {
    hi: 'स्तनपान जारी रखें',
    te: 'తల్లిపాలు కొనసాగించండి',
    ta: 'தாய்ப்பால் தொடரவும்',
    kn: 'ಎದೆಹಾಲು ಮುಂದುವರಿಸಿ',
    mr: 'स्तनपान सुरू ठेवा',
  },
  'Refer IMMEDIATELY to hospital': {
    hi: 'तुरंत अस्पताल भेजें',
    te: 'వెంటనే ఆసుపత్రికి పంపండి',
    ta: 'உடனடியாக மருத்துவமனைக்கு அனுப்புங்கள்',
    kn: 'ತಕ್ಷಣ ಆಸ್ಪತ್ರೆಗೆ ಕಳುಹಿಸಿ',
    mr: 'तातडीने रुग्णालयात पाठवा',
  },
  'DO NOT attempt treatment': {
    hi: 'इलाज करने का प्रयास न करें',
    te: 'చికిత్స చేయడానికి ప్రయత్నించకండి',
    ta: 'சிகிச்சை முயற்சிக்க வேண்டாம்',
    kn: 'ಚಿಕಿತ್ಸೆ ನೀಡಲು ಪ್ರಯತ್ನಿಸಬೇಡಿ',
    mr: 'उपचार करण्याचा प्रयत्न करू नका',
  },
};

// ─── Key Signs Translations ──────────────────────────────────────────────────

export const KEY_SIGNS: Record<string, LangMap> = {
  'Dry, rough texture': {
    hi: 'सूखी, रूखी बनावट', te: 'పొడి,거친 తన్మయం', ta: 'வறண்ட, கரடுமுரடான தோற்றம்',
    kn: 'ಶುಷ್ಕ, ಒರಟು ವಿನ್ಯಾಸ', mr: 'कोरडी, खडबडीत रचना',
  },
  'Fine scaling or flaking': {
    hi: 'हल्की पपड़ी या छिलका', te: 'సన్నని పొరలు', ta: 'மெல்லிய செதில்கள்',
    kn: 'ಸೂಕ್ಷ್ಮ ಪೊರೆ', mr: 'बारीक खपली',
  },
  'Mild itching': {
    hi: 'हल्की खुजली', te: 'తేలికపాటి దురద', ta: 'லேசான அரிப்பு',
    kn: 'ಸೌಮ್ಯ ತುರಿಕೆ', mr: 'सौम्य खाज',
  },
  'Intense itching worse at night': {
    hi: 'रात में बढ़ने वाली तेज खुजली', te: 'రాత్రి మరింత తీవ్రమయ్యే దురద',
    ta: 'இரவில் அதிகரிக்கும் கடுமையான அரிப்பு', kn: 'ರಾತ್ರಿ ಹೆಚ್ಚಾಗುವ ತೀವ್ರ ತುರಿಕೆ',
    mr: 'रात्री वाढणारी तीव्र खाज',
  },
  'Dry itchy inflamed skin': {
    hi: 'सूखी खुजलीदार सूजी हुई त्वचा', te: 'పొడి దురద మంటతో కూడిన చర్మం',
    ta: 'வறண்ட அரிப்பு வீக்கமான தோல்', kn: 'ಶುಷ್ಕ ತುರಿಕೆ ಉರಿಯೂತದ ಚರ್ಮ',
    mr: 'कोरडी खाज सुजलेली त्वचा',
  },
  'Fast breathing for age': {
    hi: 'उम्र के अनुसार तेज सांस', te: 'వయసుకు వేగవంతమైన శ్వాస',
    ta: 'வயதுக்கேற்ற வேகமான சுவாசம்', kn: 'ವయಸ್ಸಿಗೆ ವೇಗದ ಉಸಿರಾಟ',
    mr: 'वयानुसार जलद श्वसन',
  },
  'Multiple loose stools': {
    hi: 'बार-बार पतले दस्त', te: 'తరచుగా వదులు మలం',
    ta: 'அடிக்கடி தளர்வான மலம்', kn: 'ಹೆಚ್ಚು ಸಡಿಲ ಮಲ',
    mr: 'वारंवार पातळ शौच',
  },
  'Sunken eyes': {
    hi: 'धंसी हुई आंखें', te: 'లోతుకు పోయిన కళ్ళు',
    ta: 'குழிந்த கண்கள்', kn: 'ಕುಸಿದ ಕಣ್ಣುಗಳು',
    mr: 'खोल गेलेले डोळे',
  },
};

/**
 * Translate a text string to the target language using the lookup tables.
 * Falls back to the original English text if no translation exists.
 */
export function translateText(
  text: string,
  langCode: string,
  table: Record<string, LangMap>
): string {
  const base = langCode.split('-')[0].toLowerCase();
  if (base === 'en') return text;
  return table[text]?.[base] ?? text;
}

/**
 * Translate an array of strings (like actionSteps or keySigns).
 */
export function translateArray(
  items: string[],
  langCode: string,
  table: Record<string, LangMap>
): string[] {
  const base = langCode.split('-')[0].toLowerCase();
  if (base === 'en') return items;
  return items.map(item => table[item]?.[base] ?? item);
}

/**
 * Get a narration phrase in the target language.
 */
export function getNarration(key: string, langCode: string): string {
  const base = langCode.split('-')[0].toLowerCase();
  return NARRATION[key]?.[base] ?? NARRATION[key]?.en ?? key;
}
