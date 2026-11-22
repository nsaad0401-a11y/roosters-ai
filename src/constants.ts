export const ROOSTERS_LOGO_SRC = '/assets/aistudio/image_786e4f86_9bf3030e.jpg';

export const WORLD_LANGUAGES: Array<{ code: string; label: string; native: string; bcp47: string }> = [
  { code: 'Auto-Detect', label: 'Auto-Detect', native: 'All Languages', bcp47: 'en-US' },
  { code: 'English', label: 'English', native: 'English', bcp47: 'en-US' },
  { code: 'Roman Urdu', label: 'Roman Urdu', native: 'Roman Urdu', bcp47: 'ur-PK' },
  { code: 'Urdu', label: 'Urdu', native: 'اردو', bcp47: 'ur-PK' },
  { code: 'Arabic', label: 'Arabic', native: 'العربية', bcp47: 'ar-SA' },
  { code: 'Hindi', label: 'Hindi', native: 'हिन्दी', bcp47: 'hi-IN' },
  { code: 'Punjabi', label: 'Punjabi', native: 'پنجابی', bcp47: 'pa-IN' },
  { code: 'Pashto', label: 'Pashto', native: 'پښتو', bcp47: 'ps-AF' },
  { code: 'Sindhi', label: 'Sindhi', native: 'سنڌي', bcp47: 'sd-PK' },
  { code: 'Persian', label: 'Persian', native: 'فارسی', bcp47: 'fa-IR' },
  { code: 'Spanish', label: 'Spanish', native: 'Español', bcp47: 'es-ES' },
  { code: 'French', label: 'French', native: 'Français', bcp47: 'fr-FR' },
  { code: 'German', label: 'German', native: 'Deutsch', bcp47: 'de-DE' },
  { code: 'Turkish', label: 'Turkish', native: 'Türkçe', bcp47: 'tr-TR' },
  { code: 'Portuguese', label: 'Portuguese', native: 'Português', bcp47: 'pt-BR' },
  { code: 'Chinese', label: 'Chinese', native: '中文', bcp47: 'zh-CN' },
  { code: 'Japanese', label: 'Japanese', native: '日本語', bcp47: 'ja-JP' },
  { code: 'Korean', label: 'Korean', native: '한국어', bcp47: 'ko-KR' },
  { code: 'Russian', label: 'Russian', native: 'Русский', bcp47: 'ru-RU' },
];

export function getBcp47ForLanguage(languageCode: string): string {
  const found = WORLD_LANGUAGES.find((l) => l.code === languageCode);
  return found?.bcp47 ?? 'en-US';
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
