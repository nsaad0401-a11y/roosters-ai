export const ROOSTERS_LOGO_SRC = '/assets/aistudio/image_786e4f86_9bf3030e.jpg';

export interface WorldLanguageOption {
  code: string;
  label: string;
  native: string;
  bcp47: string;
  region?: string;
}

export const WORLD_LANGUAGES: WorldLanguageOption[] = [
  { code: 'Auto-Detect', label: 'Auto-Detect', native: 'All 100+ Languages', bcp47: 'en-US', region: 'Global' },
  { code: 'English', label: 'English', native: 'English', bcp47: 'en-US', region: 'Global' },
  { code: 'Roman Urdu', label: 'Roman Urdu', native: 'Roman Urdu', bcp47: 'ur-PK', region: 'South Asia' },
  { code: 'Urdu', label: 'Urdu', native: 'اردو', bcp47: 'ur-PK', region: 'South Asia' },
  { code: 'Hindi', label: 'Hindi', native: 'हिन्दी', bcp47: 'hi-IN', region: 'South Asia' },
  { code: 'Roman Hindi', label: 'Roman Hindi', native: 'Hinglish / Roman Hindi', bcp47: 'hi-IN', region: 'South Asia' },
  { code: 'Arabic', label: 'Arabic', native: 'العربية', bcp47: 'ar-SA', region: 'Middle East' },
  { code: 'Punjabi', label: 'Punjabi', native: 'پنجابی / ਪੰਜਾਬੀ', bcp47: 'pa-IN', region: 'South Asia' },
  { code: 'Pashto', label: 'Pashto', native: 'پښتو', bcp47: 'ps-AF', region: 'South Asia' },
  { code: 'Sindhi', label: 'Sindhi', native: 'سنڌي', bcp47: 'sd-PK', region: 'South Asia' },
  { code: 'Saraiki', label: 'Saraiki', native: 'سرائیکی', bcp47: 'ur-PK', region: 'South Asia' },
  { code: 'Balochi', label: 'Balochi', native: 'بلوچی', bcp47: 'fa-IR', region: 'South Asia' },
  { code: 'Kashmiri', label: 'Kashmiri', native: 'कॉशुर / کٲشُر', bcp47: 'ks-IN', region: 'South Asia' },
  { code: 'Persian', label: 'Persian', native: 'فارسی', bcp47: 'fa-IR', region: 'Middle East' },
  { code: 'Bengali', label: 'Bengali', native: 'বাংলা', bcp47: 'bn-BD', region: 'South Asia' },
  { code: 'Tamil', label: 'Tamil', native: 'தமிழ்', bcp47: 'ta-IN', region: 'South Asia' },
  { code: 'Telugu', label: 'Telugu', native: 'తెలుగు', bcp47: 'te-IN', region: 'South Asia' },
  { code: 'Marathi', label: 'Marathi', native: 'मराठी', bcp47: 'mr-IN', region: 'South Asia' },
  { code: 'Gujarati', label: 'Gujarati', native: 'ગુજરાતી', bcp47: 'gu-IN', region: 'South Asia' },
  { code: 'Kannada', label: 'Kannada', native: 'ಕನ್ನಡ', bcp47: 'kn-IN', region: 'South Asia' },
  { code: 'Malayalam', label: 'Malayalam', native: 'മലയാളം', bcp47: 'ml-IN', region: 'South Asia' },
  { code: 'Odia', label: 'Odia', native: 'ଓଡ଼ିଆ', bcp47: 'or-IN', region: 'South Asia' },
  { code: 'Assamese', label: 'Assamese', native: 'অসমীয়া', bcp47: 'as-IN', region: 'South Asia' },
  { code: 'Nepali', label: 'Nepali', native: 'नेपाली', bcp47: 'ne-NP', region: 'South Asia' },
  { code: 'Sinhala', label: 'Sinhala', native: 'සිංහල', bcp47: 'si-LK', region: 'South Asia' },
  { code: 'Spanish', label: 'Spanish', native: 'Español', bcp47: 'es-ES', region: 'Europe & Americas' },
  { code: 'French', label: 'French', native: 'Français', bcp47: 'fr-FR', region: 'Europe & Americas' },
  { code: 'German', label: 'German', native: 'Deutsch', bcp47: 'de-DE', region: 'Europe' },
  { code: 'Turkish', label: 'Turkish', native: 'Türkçe', bcp47: 'tr-TR', region: 'Middle East & Europe' },
  { code: 'Portuguese', label: 'Portuguese', native: 'Português', bcp47: 'pt-BR', region: 'Europe & Americas' },
  { code: 'Italian', label: 'Italian', native: 'Italiano', bcp47: 'it-IT', region: 'Europe' },
  { code: 'Chinese (Simplified)', label: 'Chinese (Simplified)', native: '简体中文', bcp47: 'zh-CN', region: 'East Asia' },
  { code: 'Chinese (Traditional)', label: 'Chinese (Traditional)', native: '繁體中文', bcp47: 'zh-TW', region: 'East Asia' },
  { code: 'Cantonese', label: 'Cantonese', native: '粵語', bcp47: 'yue-HK', region: 'East Asia' },
  { code: 'Japanese', label: 'Japanese', native: '日本語', bcp47: 'ja-JP', region: 'East Asia' },
  { code: 'Korean', label: 'Korean', native: '한국어', bcp47: 'ko-KR', region: 'East Asia' },
  { code: 'Russian', label: 'Russian', native: 'Русский', bcp47: 'ru-RU', region: 'Europe' },
  { code: 'Dutch', label: 'Dutch', native: 'Nederlands', bcp47: 'nl-NL', region: 'Europe' },
  { code: 'Polish', label: 'Polish', native: 'Polski', bcp47: 'pl-PL', region: 'Europe' },
  { code: 'Ukrainian', label: 'Ukrainian', native: 'Українська', bcp47: 'uk-UA', region: 'Europe' },
  { code: 'Greek', label: 'Greek', native: 'Ελληνικά', bcp47: 'el-GR', region: 'Europe' },
  { code: 'Swedish', label: 'Swedish', native: 'Svenska', bcp47: 'sv-SE', region: 'Europe' },
  { code: 'Norwegian', label: 'Norwegian', native: 'Norsk', bcp47: 'nb-NO', region: 'Europe' },
  { code: 'Danish', label: 'Danish', native: 'Dansk', bcp47: 'da-DK', region: 'Europe' },
  { code: 'Finnish', label: 'Finnish', native: 'Suomi', bcp47: 'fi-FI', region: 'Europe' },
  { code: 'Czech', label: 'Czech', native: 'Čeština', bcp47: 'cs-CZ', region: 'Europe' },
  { code: 'Slovak', label: 'Slovak', native: 'Slovenčina', bcp47: 'sk-SK', region: 'Europe' },
  { code: 'Hungarian', label: 'Hungarian', native: 'Magyar', bcp47: 'hu-HU', region: 'Europe' },
  { code: 'Romanian', label: 'Romanian', native: 'Română', bcp47: 'ro-RO', region: 'Europe' },
  { code: 'Bulgarian', label: 'Bulgarian', native: 'Български', bcp47: 'bg-BG', region: 'Europe' },
  { code: 'Croatian', label: 'Croatian', native: 'Hrvatski', bcp47: 'hr-HR', region: 'Europe' },
  { code: 'Serbian', label: 'Serbian', native: 'Српски', bcp47: 'sr-RS', region: 'Europe' },
  { code: 'Slovenian', label: 'Slovenian', native: 'Slovenščina', bcp47: 'sl-SI', region: 'Europe' },
  { code: 'Bosnian', label: 'Bosnian', native: 'Bosanski', bcp47: 'bs-BA', region: 'Europe' },
  { code: 'Albanian', label: 'Albanian', native: 'Shqip', bcp47: 'sq-AL', region: 'Europe' },
  { code: 'Macedonian', label: 'Macedonian', native: 'Македонски', bcp47: 'mk-MK', region: 'Europe' },
  { code: 'Lithuanian', label: 'Lithuanian', native: 'Lietuvių', bcp47: 'lt-LT', region: 'Europe' },
  { code: 'Latvian', label: 'Latvian', native: 'Latviešu', bcp47: 'lv-LV', region: 'Europe' },
  { code: 'Estonian', label: 'Estonian', native: 'Eesti', bcp47: 'et-EE', region: 'Europe' },
  { code: 'Belarusian', label: 'Belarusian', native: 'Беларуская', bcp47: 'be-BY', region: 'Europe' },
  { code: 'Icelandic', label: 'Icelandic', native: 'Íslenska', bcp47: 'is-IS', region: 'Europe' },
  { code: 'Irish', label: 'Irish', native: 'Gaeilge', bcp47: 'ga-IE', region: 'Europe' },
  { code: 'Welsh', label: 'Welsh', native: 'Cymraeg', bcp47: 'cy-GB', region: 'Europe' },
  { code: 'Scottish Gaelic', label: 'Scottish Gaelic', native: 'Gàidhlig', bcp47: 'gd-GB', region: 'Europe' },
  { code: 'Catalan', label: 'Catalan', native: 'Català', bcp47: 'ca-ES', region: 'Europe' },
  { code: 'Basque', label: 'Basque', native: 'Euskara', bcp47: 'eu-ES', region: 'Europe' },
  { code: 'Galician', label: 'Galician', native: 'Galego', bcp47: 'gl-ES', region: 'Europe' },
  { code: 'Maltese', label: 'Maltese', native: 'Malti', bcp47: 'mt-MT', region: 'Europe' },
  { code: 'Luxembourgish', label: 'Luxembourgish', native: 'Lëtzebuergesch', bcp47: 'lb-LU', region: 'Europe' },
  { code: 'Indonesian', label: 'Indonesian', native: 'Bahasa Indonesia', bcp47: 'id-ID', region: 'SE Asia' },
  { code: 'Malay', label: 'Malay', native: 'Bahasa Melayu', bcp47: 'ms-MY', region: 'SE Asia' },
  { code: 'Vietnamese', label: 'Vietnamese', native: 'Tiếng Việt', bcp47: 'vi-VN', region: 'SE Asia' },
  { code: 'Thai', label: 'Thai', native: 'ไทย', bcp47: 'th-TH', region: 'SE Asia' },
  { code: 'Filipino', label: 'Filipino / Tagalog', native: 'Filipino', bcp47: 'fil-PH', region: 'SE Asia' },
  { code: 'Burmese', label: 'Burmese', native: 'မြန်မာဘာသာ', bcp47: 'my-MM', region: 'SE Asia' },
  { code: 'Khmer', label: 'Khmer', native: 'ភាសាខ្មែរ', bcp47: 'km-KH', region: 'SE Asia' },
  { code: 'Lao', label: 'Lao', native: 'ລາວ', bcp47: 'lo-LA', region: 'SE Asia' },
  { code: 'Javanese', label: 'Javanese', native: 'Basa Jawa', bcp47: 'jv-ID', region: 'SE Asia' },
  { code: 'Sundanese', label: 'Sundanese', native: 'Basa Sunda', bcp47: 'su-ID', region: 'SE Asia' },
  { code: 'Cebuano', label: 'Cebuano', native: 'Sinugboanon', bcp47: 'ceb-PH', region: 'SE Asia' },
  { code: 'Mongolian', label: 'Mongolian', native: 'Монгол', bcp47: 'mn-MN', region: 'Asia' },
  { code: 'Tibetan', label: 'Tibetan', native: 'བོད་ཡིག', bcp47: 'bo-CN', region: 'Asia' },
  { code: 'Kazakh', label: 'Kazakh', native: 'Қазақ тілі', bcp47: 'kk-KZ', region: 'Central Asia' },
  { code: 'Uzbek', label: 'Uzbek', native: 'Oʻzbekcha', bcp47: 'uz-UZ', region: 'Central Asia' },
  { code: 'Azerbaijani', label: 'Azerbaijani', native: 'Azərbaycan', bcp47: 'az-AZ', region: 'Middle East & Asia' },
  { code: 'Kyrgyz', label: 'Kyrgyz', native: 'Кыргызча', bcp47: 'ky-KG', region: 'Central Asia' },
  { code: 'Tajik', label: 'Tajik', native: 'Тоҷикӣ', bcp47: 'tg-TJ', region: 'Central Asia' },
  { code: 'Turkmen', label: 'Turkmen', native: 'Türkmençe', bcp47: 'tk-TM', region: 'Central Asia' },
  { code: 'Tatar', label: 'Tatar', native: 'Татарча', bcp47: 'tt-RU', region: 'Asia & Europe' },
  { code: 'Georgian', label: 'Georgian', native: 'ქართული', bcp47: 'ka-GE', region: 'Caucasus' },
  { code: 'Armenian', label: 'Armenian', native: 'Հայերեն', bcp47: 'hy-AM', region: 'Caucasus' },
  { code: 'Hebrew', label: 'Hebrew', native: 'עברית', bcp47: 'he-IL', region: 'Middle East' },
  { code: 'Kurdish', label: 'Kurdish', native: 'Kurdî / کوردی', bcp47: 'ku-TR', region: 'Middle East' },
  { code: 'Uyghur', label: 'Uyghur', native: 'ئۇيغۇرچە', bcp47: 'ug-CN', region: 'Central Asia' },
  { code: 'Swahili', label: 'Swahili', native: 'Kiswahili', bcp47: 'sw-KE', region: 'Africa' },
  { code: 'Amharic', label: 'Amharic', native: 'አማርኛ', bcp47: 'am-ET', region: 'Africa' },
  { code: 'Hausa', label: 'Hausa', native: 'Hausa', bcp47: 'ha-NG', region: 'Africa' },
  { code: 'Yoruba', label: 'Yoruba', native: 'Yorùbá', bcp47: 'yo-NG', region: 'Africa' },
  { code: 'Igbo', label: 'Igbo', native: 'Igbo', bcp47: 'ig-NG', region: 'Africa' },
  { code: 'Zulu', label: 'Zulu', native: 'isiZulu', bcp47: 'zu-ZA', region: 'Africa' },
  { code: 'Xhosa', label: 'Xhosa', native: 'isiXhosa', bcp47: 'xh-ZA', region: 'Africa' },
  { code: 'Afrikaans', label: 'Afrikaans', native: 'Afrikaans', bcp47: 'af-ZA', region: 'Africa' },
  { code: 'Somali', label: 'Somali', native: 'Soomaali', bcp47: 'so-SO', region: 'Africa' },
  { code: 'Oromo', label: 'Oromo', native: 'Afaan Oromoo', bcp47: 'om-ET', region: 'Africa' },
  { code: 'Malagasy', label: 'Malagasy', native: 'Malagasy', bcp47: 'mg-MG', region: 'Africa' },
  { code: 'Kinyarwanda', label: 'Kinyarwanda', native: 'Ikinyarwanda', bcp47: 'rw-RW', region: 'Africa' },
  { code: 'Shona', label: 'Shona', native: 'chiShona', bcp47: 'sn-ZW', region: 'Africa' },
  { code: 'Chichewa', label: 'Chichewa', native: 'Chichewa', bcp47: 'ny-MW', region: 'Africa' },
  { code: 'Sesotho', label: 'Sesotho', native: 'Sesotho', bcp47: 'st-ZA', region: 'Africa' },
  { code: 'Tigrinya', label: 'Tigrinya', native: 'ትግርኛ', bcp47: 'ti-ET', region: 'Africa' },
  { code: 'Maori', label: 'Māori', native: 'Te Reo Māori', bcp47: 'mi-NZ', region: 'Oceania' },
  { code: 'Samoan', label: 'Samoan', native: 'Gagana Samoa', bcp47: 'sm-WS', region: 'Oceania' },
  { code: 'Hawaiian', label: 'Hawaiian', native: 'ʻŌlelo Hawaiʻi', bcp47: 'haw-US', region: 'Oceania' },
  { code: 'Latin', label: 'Latin', native: 'Latina', bcp47: 'la', region: 'Classical' },
  { code: 'Esperanto', label: 'Esperanto', native: 'Esperanto', bcp47: 'eo', region: 'International' },
];

export function getBcp47ForLanguage(languageCode: string): string {
  const normalized = (languageCode || '').trim().toLowerCase();
  const found = WORLD_LANGUAGES.find(
    (l) => l.code.toLowerCase() === normalized || l.label.toLowerCase() === normalized
  );
  return found?.bcp47 ?? 'en-US';
}

/**
 * Automatically detects the likely world language code from any user/AI text snippet
 * (supporting Arabic/Urdu/Pashto/Sindhi/Persian, Devanagari, CJK, Cyrillic, Latin languages, Roman Urdu, etc.).
 */
export function detectTextLanguageCode(rawText: string): string {
  const text = (rawText || '').trim();
  if (!text) return 'English';

  // Non-Latin Unicode scripts first for high precision
  if (/[\u0600-\u06FF\u0750-\u077F]/.test(text)) {
    if (/[ټډړږښڼځڅ]/.test(text)) return 'Pashto';
    if (/[ٻڀٺٽڄڃڇڌڏڍڎڙڦڳڱڻ]/.test(text)) return 'Sindhi';
    if (/[ٹڈڑںےہھ]/.test(text)) return 'Urdu';
    if (/[پچژگ]/.test(text) && !/[ٹڈڑںے]/.test(text)) return 'Persian';
    return 'Arabic';
  }
  if (/[\u0900-\u097F]/.test(text)) return 'Hindi';
  if (/[\u0980-\u09FF]/.test(text)) return 'Bengali';
  if (/[\u0A00-\u0A7F]/.test(text)) return 'Punjabi';
  if (/[\u0A80-\u0AFF]/.test(text)) return 'Gujarati';
  if (/[\u0B00-\u0B7F]/.test(text)) return 'Odia';
  if (/[\u0B80-\u0BFF]/.test(text)) return 'Tamil';
  if (/[\u0C00-\u0C7F]/.test(text)) return 'Telugu';
  if (/[\u0C80-\u0CFF]/.test(text)) return 'Kannada';
  if (/[\u0D00-\u0D7F]/.test(text)) return 'Malayalam';
  if (/[\u0D80-\u0DFF]/.test(text)) return 'Sinhala';
  if (/[\u0E00-\u0E7F]/.test(text)) return 'Thai';
  if (/[\u0E80-\u0EFF]/.test(text)) return 'Lao';
  if (/[\u1000-\u109F]/.test(text)) return 'Burmese';
  if (/[\u1780-\u17FF]/.test(text)) return 'Khmer';
  if (/[\uAC00-\uD7AF\u1100-\u11FF]/.test(text)) return 'Korean';
  if (/[\u3040-\u30FF\u31F0-\u31FF]/.test(text)) return 'Japanese';
  if (/[\u4E00-\u9FFF]/.test(text)) return 'Chinese (Simplified)';
  if (/[\u0400-\u04FF]/.test(text)) {
    if (/[єіїґЄІЇҐ]/.test(text)) return 'Ukrainian';
    if (/[әғқңөұүһіӘҒҚҢӨҰҮҺІ]/.test(text)) return 'Kazakh';
    return 'Russian';
  }
  if (/[\u0370-\u03FF]/.test(text)) return 'Greek';
  if (/[\u0590-\u05FF]/.test(text)) return 'Hebrew';
  if (/[\u10A0-\u10FF]/.test(text)) return 'Georgian';
  if (/[\u0530-\u058F]/.test(text)) return 'Armenian';
  if (/[\u1200-\u137F]/.test(text)) return 'Amharic';

  const lower = text.toLowerCase();

  // Roman Urdu / Roman Hindi high-confidence markers
  if (
    /\b(kya|hai|hain|hun|hoon|mujhe|mujy|mera|meri|mere|aap|tum|kaise|kaisa|kaisi|bna|bnao|bana|banao|karo|krdo|kardo|chahiye|samjhao|samjho|shukriya|nahi|nhi|acha|achha|theek|thik|bhai|dost|salam|assalam|tasveer|naksha|kitna|kidhar|kyun|kyu|bilkul|zaroor|mashallah)\b/i.test(
      lower
    )
  ) {
    return 'Roman Urdu';
  }

  if (/[¿¡ñ]|(\b(hola|gracias|por favor|buenos días|cómo estás|qué tal|necesito|español)\b)/i.test(lower)) {
    return 'Spanish';
  }
  if (/\b(bonjour|merci|comment allez|s'il vous plaît|je suis|français|très bien)\b/i.test(lower)) {
    return 'French';
  }
  if (/[äöüß]|(\b(hallo|danke|bitte|wie geht|ich bin|deutsch|guten tag)\b)/i.test(lower)) {
    return 'German';
  }
  if (/[ğşçıİ]|(\b(merhaba|teşekkür|nasılsın|günaydın|türkçe|evet|hayır)\b)/i.test(lower)) {
    return 'Turkish';
  }
  if (/[ãõç]|(\b(olá|obrigado|obrigada|você|bom dia|tudo bem|português)\b)/i.test(lower)) {
    return 'Portuguese';
  }
  if (/\b(ciao|grazie|buongiorno|come stai|per favore|italiano)\b/i.test(lower)) {
    return 'Italian';
  }
  if (/\b(apa kabar|terima kasih|selamat pagi|bagaimana|saya ingin|tolong)\b/i.test(lower)) {
    return 'Indonesian';
  }
  if (/\b(xin chào|cảm ơn|tiếng việt|bạn khỏe không)\b/i.test(lower)) {
    return 'Vietnamese';
  }
  if (/\b(habari|asante|jambo|karibu|kiswahili)\b/i.test(lower)) {
    return 'Swahili';
  }

  return 'English';
}

export function detectBcp47FromText(rawText: string, fallbackLanguage?: string): string {
  const detected = detectTextLanguageCode(rawText);
  if (detected === 'English' && fallbackLanguage && fallbackLanguage !== 'Auto-Detect') {
    return getBcp47ForLanguage(fallbackLanguage);
  }
  return getBcp47ForLanguage(detected);
}

export const QUICK_PROMPTS: Array<{ title: string; prompt: string }> = [
  {
    title: 'Step-by-Step Study Tutor',
    prompt: 'Teach me how photosynthesis works step-by-step with a simple analogy, concise study notes, and 2 practice questions.',
  },
  {
    title: 'Full-Stack Code Studio',
    prompt: 'Write a clean TypeScript React hook for debounced search with abort controller support and explain each line politely.',
  },
  {
    title: 'Multilingual Translation',
    prompt: 'Translate "Welcome to Roosters AI by SandSoft, your polite study and creative companion" into Urdu, Arabic, Hindi, and Spanish.',
  },
  {
    title: 'Exam Revision Notes',
    prompt: 'Create structured revision notes for Newton’s Three Laws of Motion with everyday examples and a quick self-quiz.',
  },
];
