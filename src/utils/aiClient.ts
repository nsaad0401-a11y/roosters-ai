import { loadCustomApiKey, loadOwnerConfig, loadUserSettings } from './storage';
import { GeneratedVideo, ResponseStyleMode, VideoScene } from '../types';

export interface OutgoingAttachment {
  kind?: 'image' | 'file';
  name?: string;
  base64?: string;
  mimeType?: string;
  textContent?: string;
}

export interface OutgoingMessage {
  role: 'user' | 'assistant';
  content: string;
  attachment?: OutgoingAttachment;
}

export class MissingApiKeyError extends Error {
  constructor() {
    super(
      'Roosters AI is momentarily connecting to its AI engine. Please try again in a few moments.'
    );
    this.name = 'MissingApiKeyError';
  }
}

export interface ResolvedProvider {
  provider: 'groq' | 'gemini' | 'none';
  apiKey: string;
  source: 'local' | 'env' | 'server' | 'none';
  label: string;
}

export function getEnvGroqKey(): string {
  try {
    return (import.meta.env.VITE_GROQ_API_KEY || '').trim();
  } catch {
    return '';
  }
}

export function getEnvGeminiKey(): string {
  try {
    return (import.meta.env.VITE_GEMINI_API_KEY || '').trim();
  } catch {
    return '';
  }
}

export function resolveActiveProvider(hasServerGeminiKey: boolean): ResolvedProvider {
  const localKey = loadCustomApiKey().trim();
  if (localKey) {
    if (localKey.startsWith('gsk_')) {
      return {
        provider: 'groq',
        apiKey: localKey,
        source: 'local',
        label: 'Groq (Auto Active Model)',
      };
    }
    if (localKey.startsWith('AIza')) {
      return {
        provider: 'gemini',
        apiKey: localKey,
        source: 'local',
        label: 'Gemini (Owner Override)',
      };
    }
  }

  const envGroqKey = getEnvGroqKey();
  if (envGroqKey && envGroqKey.startsWith('gsk_')) {
    return {
      provider: 'groq',
      apiKey: envGroqKey,
      source: 'env',
      label: 'Groq (Built-In)',
    };
  }

  const envGeminiKey = getEnvGeminiKey();
  if (envGeminiKey) {
    return {
      provider: 'gemini',
      apiKey: envGeminiKey,
      source: 'env',
      label: 'Gemini (Built-In)',
    };
  }

  if (hasServerGeminiKey) {
    return {
      provider: 'gemini',
      apiKey: '',
      source: 'server',
      label: 'Gemini (Built-In)',
    };
  }

  return {
    provider: 'none',
    apiKey: '',
    source: 'none',
    label: 'Unavailable',
  };
}

export function buildClientStudyTutorInstruction(options: {
  language?: string;
  userName?: string;
  isLiveVoice?: boolean;
  responseStyle?: ResponseStyleMode;
  customInstructions?: string;
  globalSystemPrompt?: string;
}): string {
  const userPrefs = loadUserSettings();
  const ownerCfg = loadOwnerConfig();

  const {
    language,
    userName,
    isLiveVoice,
    responseStyle = userPrefs.responseStyle || 'simple',
    customInstructions = userPrefs.customInstructions,
    globalSystemPrompt = ownerCfg.globalSystemPrompt,
  } = options;

  const langRule =
    !language || language === 'Auto-Detect'
      ? "CRITICAL UNIVERSAL LANGUAGE & SCRIPT RULE: Automatically detect the user's exact language and script across all world languages (100+ languages including English, Urdu, Roman Urdu, Hindi, Roman Hindi, Arabic, Punjabi, Pashto, Sindhi, Persian, Bengali, Spanish, French, German, Turkish, Chinese, Japanese, Korean, Russian, etc.). ALWAYS reply fluently in that exact same language and script. If the user writes in Roman Urdu ('kya haal hai', 'mujhe samjhao', 'aik insan moon pr') or Roman Hindi, reply in natural Romanized script with English letters — NEVER switch to Arabic/Urdu/Devanagari script unless asked."
      : language === 'Roman Urdu'
        ? 'CRITICAL LANGUAGE & SCRIPT RULE: Reply fluently in natural Roman Urdu using English/Latin letters only (do NOT use Arabic/Urdu script).'
        : language === 'Roman Hindi'
          ? 'CRITICAL LANGUAGE & SCRIPT RULE: Reply fluently in natural Roman Hindi (Hinglish) using English/Latin letters only.'
          : `CRITICAL LANGUAGE RULE: Reply fluently, politely, and naturally in ${language}.`;

  const styleRule =
    responseStyle === 'study'
      ? 'Use Study & Exam Mode: explain clearly with structured headings, concise study notes, real-world examples, and 2–3 helpful practice questions at the end when teaching a concept.'
      : responseStyle === 'detailed'
        ? 'Use Detailed Mode: provide thorough, comprehensive, well-structured explanations with clear step-by-step examples.'
        : "By default, always give clear, simple, direct, and concise answers in plain conversational language. Do NOT add long headings, bulleted study notes, or practice questions unless the user explicitly asks for 'study notes', 'notes', 'questions', or a detailed explanation.";

  const baseInstruction = [
    'You are Roosters AI, a helpful, polite educational, technical, and creative AI assistant created by SandSoft.',
    'Always answer normal questions, coding queries, educational topics, creative prompts, and Roman Urdu messages directly and helpfully without unnecessary refusals.',
    styleRule,
  ].join(' ');

  const multimodalCore =
    'You have full permission and ability to view, read, and analyze any photo, screenshot, live camera frame, or document uploaded by the user, including handwritten notes and images.';

  const globalExtra = globalSystemPrompt?.trim()
    ? `Global Owner Guidance: ${globalSystemPrompt.trim()}`
    : '';
  const userExtra = customInstructions?.trim()
    ? `User Custom Preferences: ${customInstructions.trim()}`
    : '';

  if (isLiveVoice) {
    return [
      baseInstruction,
      userName ? `You are warmly assisting ${userName}.` : '',
      multimodalCore,
      'Speak naturally in 2–4 concise, clear sentences without markdown symbols or code fences unless asked.',
      langRule,
      globalExtra,
      userExtra,
    ]
      .filter(Boolean)
      .join(' ');
  }

  return [
    baseInstruction,
    userName ? `You are assisting ${userName}.` : '',
    multimodalCore,
    'Roosters AI has full built-in HD image and video creation capabilities. NEVER say "I cannot create images", "I cannot generate pictures", or refuse to create images in English, Urdu, or Roman Urdu. If the user asks for an image, picture, photo, portrait, logo, or floor plan/design (e.g., "pic bna do", "tasveer banao", "naksha banao"), reply ONLY with [CREATE_IMAGE: <detailed, photorealistic English prompt>].',
    'Format code in fenced markdown blocks with language tags only when code is requested or relevant.',
    'NEVER output ASCII art, text-character drawings, or box-art diagrams when asked for a picture, image, photo, or video.',
    langRule,
    globalExtra,
    userExtra,
  ]
    .filter(Boolean)
    .join(' ');
}

function extractSubjectRemainder(rawText: string): string {
  return rawText
    .replace(
      /\b(please|kindly|can you|could you|create|generate|make|draw|paint|sketch|render|show|give|me|mujy|mujhe|mjhe|ek|aik|a|an|the|ki|ka|ke|k|ko|do|dy|de|kar|kr|pic|pics|picture|tasveer|tasweer|tasvir|taswir|photo|foto|image|img|banao|bnao|banado|bnado|bna|bana|dikhao|chahiye|khincho)\b/gi,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim();
}

const IMAGE_CONTEXT_CUE_RX =
  /\b(pic|pics|picture|photo|foto|image|img|tasveer|tasweer|tasvir|taswir|naksha|naqsha|draw|paint|sketch|design|logo|poster|banner|portrait|wallpaper|bna|bnao|bnado|bana|banado|تصویر|نقشہ|فوٹو)\b/i;

const ATTACHED_PHOTO_EDIT_RX =
  /\b(edit|retouch|restore|enhance|upscale|colorize|colourize|figurine|3d\s*figurine|collectible|miniature|toy\s*figure|change\s+(the\s+|this\s+|its\s+|my\s+)?(background|bg|outfit|clothes|clothing|dress|shirt|suit|jacket|hair|color|colour|sky|lighting|weather|mood|style)|replace\s+(the\s+)?(background|bg|sky|clothes|outfit)|remove\s+(the\s+)?(background|bg|object|person|people|text|watermark)|make\s+(this|it|me|him|her)\s+(look\s+like|into|a\s+|an\s+)?|turn\s+(this|it|me|him|her)\s+into|convert\s+(this|it)\s+(to|into)|put\s+(me|him|her|this|it)\s+(on|in|at)|add\s+(sunglasses|glasses|hat|cap|beard|crown|snow|rain|lights|fireworks|smile)|swap\s+|anime\s+style|cartoon\s+style|ghibli|cyberpunk|oil\s+painting|pencil\s+sketch|background\s*(badal|change|hatta|hata|remove)|kapre\s*(badal|change)|photo\s*(restore|saaf|edit|bna|bana)|tasveer\s*(badal|edit)|figurine\s*(bna|bana)|purani\s*photo|saaf\s*(kar|kr)|badal\s*(do|de|dy))\b|(بیک\s*گراؤنڈ|ایڈٹ|تبدیل|بحال|کپڑے)/i;

const FOLLOWUP_EDIT_RX =
  /\b(now\s+make|make\s+it|make\s+the|make\s+him|make\s+her|turn\s+it|change\s+(it|the|his|her|its)|replace\s+the|remove\s+the|add\s+(a\s+|an\s+|some\s+)?|put\s+(a\s+|an\s+|some\s+)?|night\s*time|day\s*time|sunset|sunrise|rain|raining|snow|snowing|brighter|darker|more\s+realistic|cartoon|anime|3d\s*figurine|ab\s+(is|isko|is\s*ko|iske|is\s*ke|iska|is\s*ka)|raat\s+ka|subah\s+ka|rang\s+badal|background\s+change|background\s+badal|kapre\s+change|kapre\s+badal|glasses\s+pehna|hat\s+pehna|sunglasses)\b/i;

export function detectChatMediaIntent(
  rawText: string,
  hasAttachment: boolean,
  hasPreviousGeneratedImage = false
): 'video' | 'image_edit' | 'image' | 'chat' {
  const text = rawText.trim();
  if (!text || text.length > 500) return 'chat';
  const lower = text.toLowerCase();

  // When a photo is attached/captured, route photo-editing commands to Nano Banana Image-to-Image editing
  if (hasAttachment) {
    if (ATTACHED_PHOTO_EDIT_RX.test(text)) {
      return 'image_edit';
    }
    return 'chat';
  }

  // Multi-turn conversational refinement on a previously generated/edited image in chat
  if (
    hasPreviousGeneratedImage &&
    FOLLOWUP_EDIT_RX.test(text) &&
    !/\b(what is|who is|why |how do|explain|translate|code for|script for)\b/i.test(lower)
  ) {
    return 'image_edit';
  }

  // Exclude coding/explanatory/tutorial questions unless explicitly asking to render an image/video directly
  const isTutorialOrCodeQuestion =
    /\b(how to|how do i|explain|what is|html|css|python|javascript|typescript|react|code for|script for|algorithm|tag|tutorial|difference between)\b/i.test(
      lower
    ) &&
    !/\b(pic\s*bna|pic\s*bana|tasveer\s*bna|tasveer\s*bana|tasweer\s*bna|tasweer\s*bana|naksha\s*bna|naksha\s*bana|naqsha\s*bna|naqsha\s*bana|video\s*bna|video\s*bana|generate image|create image|create video)\b/i.test(
      lower
    );

  if (isTutorialOrCodeQuestion) return 'chat';

  // 1. Video intent (check first so "video banao" / "video bna do" always triggers Video Generator)
  const videoPatterns: RegExp[] = [
    /\b(create|generate|make|render|produce|animate|build|show)\s+(me\s+)?(a\s+|an\s+|the\s+|some\s+)?(short\s+|cinematic\s+|ai\s+|hd\s+|animated\s+)?(video|clip|animation|movie|reel|short\s*film)\b/i,
    /\b(video|clip|reel|animation)\s+(of|about|for|on)\b/i,
    /\b(video|veedio|vedio|clip|reel|animation)\s*(banao|bnao|bna\s*do|bna\s*dy|bna\s*de|bana\s*do|bana\s*dy|bana\s*de|bana\s*kar\s*do|bana\s*kr\s*do|banado|bnado|taiyar\s*karo|dikhao|chahiye)\b/i,
    /\b(banao|bnao|bna\s*do|bana\s*do|banado|bnado)\s*(ek\s+|aik\s+)?(video|clip|reel|animation)\b/i,
    /(ویڈیو\s*(بنائیں|بناؤ|بنا\s*دو|بنا\s*دیں|دکھائیں)|فيديو|إنشاء\s+فيديو|वीडियो\s*(बनाओ|बनाएं|बना\s*दो)|créer\s+une\s+vidéo|generar\s+(un\s+)?vídeo|crear\s+(un\s+)?video|video\s+erstellen|buat\s+video)/i,
  ];
  if (videoPatterns.some((rx) => rx.test(text))) {
    return 'video';
  }

  // 2. Image / Photo / Drawing / Design / Naksha intent in ANY language (English, Urdu, Roman Urdu, etc.)
  const imagePatterns: RegExp[] = [
    /\b(create|generate|make|draw|paint|sketch|render|design|illustrate|show)\s+(me\s+)?(a\s+|an\s+|some\s+|the\s+)?(hd\s+|ultra[\s-]*hd\s+|4k\s+|2k\s+|real\s+|realistic\s+|photorealistic\s+|cute\s+|cool\s+|beautiful\s+|modern\s+|3d\s+)?(picture|pic|pics|image|img|photo|photograph|portrait|wallpaper|illustration|artwork|drawing|poster|avatar|painting|sketch|logo|banner|icon|blueprint|floor\s*plan|house\s*design|interior\s*design)\b/i,
    /^(draw|paint|sketch|illustrate|design)\s+(a|an|the|me|some)?\s*\S+/i,
    /\b(picture|pic|image|photo|portrait|drawing|sketch|illustration|logo|design)\s+of\b/i,
    /\b(pic|pics|picture|tasveer|tasweer|tasvir|taswir|photo|foto|image|img|drawing|sketch|chitra|portrait|wallpaper|naksha|naqsha|logo|design|poster)\s*(banao|bnao|bna\s*do|bna\s*dy|bna\s*de|bna\s*kar\s*do|bna\s*kr\s*do|bna\s*k\s*do|bana\s*do|bana\s*dy|bana\s*de|bana\s*kar\s*do|bana\s*kr\s*do|bana\s*k\s*do|banado|bnado|dikhao|dikha\s*do|nikalo|chahiye|khincho|bna|bana)\b/i,
    /\b(banao|bnao|bna\s*do|bna\s*dy|bna\s*de|bna\s*k\s*do|bana\s*do|bana\s*dy|bana\s*k\s*do|banado|bnado|draw\s*karo|design\s*karo|design\s*kr\s*do)\s*(ek\s+|aik\s+|mujy\s+|mujhe\s+)?(pyari\s+si\s+|khoobsurat\s+|khubsurat\s+|sundar\s+|acha\s+sa\s+|achha\s+sa\s+)?(pic|picture|tasveer|tasweer|tasvir|taswir|photo|image|sketch|drawing|naksha|naqsha|logo|design|poster)\b/i,
    /(تصویر|فوٹو|نقشہ|اسکیچ|ڈیزائن|لوگو)\s*(بنائیں|بناؤ|بنا\s*دو|بنا\s*دیں|بنا\s*کر\s*دیں|دکھائیں|چاہیے)|(بنائیں|بناؤ|بنا\s*دو|بنا\s*دیں)\s*(ایک\s+)?(خوبصورت\s+)?(تصویر|فوٹو|نقشہ|اسکیچ|ڈیزائن|لوگو)|(صورة|ارسم|تصوير|चित्र\s*(बनाओ|बनाएं)|तस्वीर\s*(बनाओ|बनाएं)|फोटो\s*(बनाओ|बनाएं)|dessine|créer\s+une\s+image|generar\s+(una\s+)?imagen|dibujar|criar\s+imagem|bild\s+erstellen|buat\s+gambar|resim\s+(çiz|yap))/i,
  ];
  if (imagePatterns.some((rx) => rx.test(text))) {
    // If the user sent only a bare opener like "Mujhe aik pic bna k do" with NO subject noun,
    // allow chat to ask what subject they want — the next reply (e.g. "Aik insan ki moon pr") combines both!
    const subjectRemainder = extractSubjectRemainder(text);
    if (!subjectRemainder || subjectRemainder.length < 2) {
      return 'chat';
    }
    return 'image';
  }

  return 'chat';
}

function hasPendingImageContext(recentMessages?: Array<{ role: string; content: string }>): boolean {
  if (!recentMessages || recentMessages.length === 0) return false;
  return recentMessages.slice(-3).some((m) => {
    const content = (m.content || '').trim();
    if (!content) return false;
    return IMAGE_CONTEXT_CUE_RX.test(content);
  });
}

function shouldInvokeGeminiIntentCheck(
  rawText: string,
  hasAttachment: boolean,
  hasPreviousGeneratedImage: boolean,
  recentMessages?: Array<{ role: string; content: string }>
): boolean {
  const text = rawText.trim();
  if (!text || text.length > 500) return false;
  const lower = text.toLowerCase();

  if (hasAttachment) {
    if (ATTACHED_PHOTO_EDIT_RX.test(text)) return true;
    // Check Roman Urdu/English edit hints when a photo is attached, skipping pure questions
    if (
      /^(what|who|why|when|where|how|read|solve|explain|translate|kya\s+hai|ye\s+kya|kya\s+likha)\b/i.test(
        lower
      )
    ) {
      return false;
    }
    return /\b(background|bg|outfit|clothes|dress|shirt|suit|figurine|3d|restore|edit|change|replace|remove|add|make|turn|convert|style|hair|glasses|badal|bna|bana|saaf|karo|kr\s*do)\b/i.test(
      lower
    ) || /[\u0600-\u06FF\u0900-\u097F]/.test(text);
  }

  if (detectChatMediaIntent(text, false, hasPreviousGeneratedImage) !== 'chat') return true;

  if (
    hasPreviousGeneratedImage &&
    !/^(hi|hello|hey|thanks|thank you|ok|good|nice|wah|shukriya|what is|explain|how)\b/i.test(lower) &&
    text.length <= 160
  ) {
    return true;
  }

  // Check if previous 1-3 turns asked for a picture/photo (e.g., "Mujhe aik pic bna k do" -> next turn: "Aik insan ki moon pr")
  if (hasPendingImageContext(recentMessages)) {
    return true;
  }

  // Skip obvious pure greetings/math/code/translation questions unless visual cues exist
  if (
    /^(hi|hello|hey|salam|assalam|how are you|what is|who is|why |when |where |explain |translate |write code|write a function)/i.test(
      lower
    ) &&
    !IMAGE_CONTEXT_CUE_RX.test(lower)
  ) {
    return false;
  }

  // Invoke Gemini Step-1 classifier for any message with Urdu/Arabic/Hindi script, Roman Urdu creation verbs, or visual/design keywords
  const hasNonAsciiScript = /[\u0600-\u06FF\u0900-\u097F]/.test(text);
  const hasVisualOrCreationCue =
    /\b(pic|pics|picture|photo|foto|image|img|tasveer|tasweer|tasvir|taswir|naksha|naqsha|draw|paint|sketch|design|logo|poster|banner|portrait|wallpaper|illustration|artwork|render|scene|house|ghar|makan|villa|masjid|mosque|bna|bnao|bnado|bana|banado|dikhao|dikha|chahiye|make me|create|generate|show me|give me)\b/i.test(
      lower
    );

  return hasNonAsciiScript || hasVisualOrCreationCue;
}

export async function detectAndEnhanceChatMediaIntent(params: {
  text: string;
  recentMessages?: Array<{ role: string; content: string }>;
  hasAttachment: boolean;
  hasPreviousGeneratedImage?: boolean;
  hasBackendApi: boolean;
  hasServerGeminiKey: boolean;
}): Promise<{
  intent: 'video' | 'image_edit' | 'image' | 'chat';
  preEnhanced?: { detailedPrompt: string; shortTitle: string };
}> {
  const cleaned = params.text.trim();
  if (!cleaned || cleaned.length > 500) return { intent: 'chat' };

  const hasPrevImg = Boolean(params.hasPreviousGeneratedImage);
  const recentSlice = (params.recentMessages ?? []).slice(-4).map((m) => ({
    role: m.role,
    content: m.content.slice(0, 260),
  }));

  const fastIntent = detectChatMediaIntent(cleaned, params.hasAttachment, hasPrevImg);
  const pendingContext = hasPendingImageContext(recentSlice);

  if (!shouldInvokeGeminiIntentCheck(cleaned, params.hasAttachment, hasPrevImg, recentSlice)) {
    return { intent: fastIntent };
  }

  const localKey = loadCustomApiKey().trim();
  const envGeminiKey = getEnvGeminiKey();
  const clientGeminiKey = localKey.startsWith('AIza') ? localKey : envGeminiKey;

  // Step 1A: Server-side Gemini intent & prompt enhancer (preferred)
  if (params.hasBackendApi || params.hasServerGeminiKey) {
    try {
      const resp = await fetch('/api/detect-image-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: cleaned,
          recentMessages: recentSlice,
          forceImage: fastIntent === 'image',
          hasAttachment: params.hasAttachment,
          hasPreviousGeneratedImage: hasPrevImg,
          apiKey: clientGeminiKey || undefined,
        }),
      });
      if (resp.ok) {
        const data = (await resp.json()) as {
          intent?: string;
          shortTitle?: string;
          enhancedPrompt?: string;
        };
        const resolvedIntent: 'video' | 'image_edit' | 'image' | 'chat' =
          fastIntent === 'image_edit' || data.intent === 'image_edit'
            ? 'image_edit'
            : fastIntent === 'video' || data.intent === 'video'
              ? 'video'
              : fastIntent === 'image' || data.intent === 'image'
                ? 'image'
                : 'chat';

        if ((resolvedIntent === 'image' || resolvedIntent === 'image_edit') && data.enhancedPrompt?.trim()) {
          return {
            intent: resolvedIntent,
            preEnhanced: {
              shortTitle: (data.shortTitle || cleaned).slice(0, 56),
              detailedPrompt: sanitizeShortSafePrompt(data.enhancedPrompt.trim(), 24),
            },
          };
        }
        return { intent: resolvedIntent };
      }
    } catch {
      // Fall through to direct Gemini REST or deterministic fallback
    }
  }

  const contextBlock = [
    `Session State: USER_ATTACHED_PHOTO=${params.hasAttachment} | PREVIOUS_GENERATED_IMAGE_EXISTS_IN_CHAT=${hasPrevImg}`,
    recentSlice.length > 0
      ? `Recent Conversation Context:\n${recentSlice
          .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.content}`)
          .join('\n')}`
      : '',
    `Latest User Message:\n${cleaned}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  // Step 1B: Direct Gemini REST fallback (for static deployments with client Gemini key)
  if (clientGeminiKey) {
    try {
      const sysText = [
        'Classify the Latest User Message with Session State and Recent Conversation Context in ANY world language (100+ languages) as intent "image_edit", "image", "video", or "chat".',
        '- Choose "image_edit" when USER_ATTACHED_PHOTO=true and user wants to edit/transform/restore/make 3D figurine/change background/outfit, OR when PREVIOUS_GENERATED_IMAGE_EXISTS_IN_CHAT=true and user asks a follow-up visual refinement ("now make it night time").',
        '- Choose "image" when user asks to create a new picture/photo/naksha (including follow-ups after "Mujhe aik pic bna k do").',
        '- Choose "chat" for questions, vision Q&A on an attached photo, or coding help.',
        'If "image" or "image_edit", return a clean, safe, family-friendly English enhancedPrompt STRICTLY under 25 words including sharp photography descriptors ("ultra-sharp focus, crisp details, 8k resolution, DSLR 85mm lens, natural lighting") + 3-6 word shortTitle.',
        'Return ONLY JSON: {"intent":"image_edit|image|video|chat","shortTitle":"...","enhancedPrompt":"..."}',
      ].join(' ');
      const resp = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': clientGeminiKey,
          },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: sysText }] },
            contents: [{ role: 'user', parts: [{ text: contextBlock }] }],
            safetySettings: GEMINI_SAFETY_SETTINGS,
            generationConfig: {
              thinkingConfig: { thinkingBudget: 0 },
              responseMimeType: 'application/json',
            },
          }),
        }
      );
      if (resp.ok) {
        const json = (await resp.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const rawOut = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
        const start = rawOut.indexOf('{');
        const end = rawOut.lastIndexOf('}');
        if (start >= 0 && end > start) {
          const parsed = JSON.parse(rawOut.slice(start, end + 1)) as {
            intent?: string;
            shortTitle?: string;
            enhancedPrompt?: string;
          };
          const resolvedIntent: 'video' | 'image_edit' | 'image' | 'chat' =
            fastIntent === 'image_edit' || parsed.intent === 'image_edit'
              ? 'image_edit'
              : fastIntent === 'video' || parsed.intent === 'video'
                ? 'video'
                : fastIntent === 'image' || parsed.intent === 'image'
                  ? 'image'
                  : 'chat';
          if ((resolvedIntent === 'image' || resolvedIntent === 'image_edit') && parsed.enhancedPrompt?.trim()) {
            return {
              intent: resolvedIntent,
              preEnhanced: {
                shortTitle: (parsed.shortTitle || cleaned).slice(0, 56),
                detailedPrompt:
                  resolvedIntent === 'image_edit'
                    ? parsed.enhancedPrompt.trim()
                    : buildSafeArtisticPrompt(parsed.enhancedPrompt.trim()),
              },
            };
          }
          return { intent: resolvedIntent };
        }
      }
    } catch {
      // Fall back cleanly
    }
  }

  // Deterministic fallback when Gemini classifier isn't reachable:
  if (
    !params.hasAttachment &&
    pendingContext &&
    fastIntent === 'chat' &&
    !/^(hi|hello|hey|thanks|thank you|ok|cancel|stop|no|nahi|explain|what is)\b/i.test(cleaned) &&
    extractSubjectRemainder(cleaned).length >= 3
  ) {
    const prevUserImgReq = [...recentSlice]
      .reverse()
      .find((m) => m.role === 'user' && IMAGE_CONTEXT_CUE_RX.test(m.content));
    const combinedRaw = prevUserImgReq ? `${prevUserImgReq.content} ${cleaned}` : cleaned;
    return {
      intent: 'image',
      preEnhanced: {
        shortTitle: cleaned.slice(0, 48),
        detailedPrompt: buildSafeArtisticPrompt(combinedRaw),
      },
    };
  }

  return { intent: fastIntent };
}

function formatMessageTextWithFile(msg: OutgoingMessage): string {
  let text = msg.content?.trim() || '';
  if (msg.attachment?.kind === 'file' && msg.attachment.textContent) {
    const label = msg.attachment.name || 'study-file.txt';
    const section = `[Uploaded File: ${label}]\n\`\`\`\n${msg.attachment.textContent.slice(0, 60000)}\n\`\`\``;
    text = text
      ? `${text}\n\n${section}`
      : `Please kindly review, summarize, or debug this uploaded file:\n\n${section}`;
  } else if (msg.attachment && !text) {
    text = 'Please analyze this attachment kindly.';
  } else if (msg.attachment && msg.attachment.kind !== 'file' && msg.attachment.name) {
    text = `${text}\n\n[Note: User attached image "${msg.attachment.name}".]`;
  }
  return text || 'Hello!';
}

function extractReadableApiError(rawBody: string, status: number): string {
  const trimmed = rawBody.trim();
  if (trimmed) {
    try {
      const parsed = JSON.parse(trimmed) as { error?: { message?: string } | string; message?: string };
      if (typeof parsed.error === 'string' && parsed.error) return parsed.error;
      if (typeof parsed.error === 'object' && parsed.error?.message) return parsed.error.message;
      if (parsed.message) return parsed.message;
    } catch {
      // ignore non-JSON
    }
  }
  if (status === 401 || status === 403) {
    return 'Unable to authenticate with the AI service right now. Please try again shortly.';
  }
  if (status === 429) {
    return 'AI traffic is busy right now. Please wait a few seconds and try again.';
  }
  if (status === 503) {
    return 'The AI service is momentarily busy. Please try sending your message again.';
  }
  return 'I apologize, our AI service had a momentary connection issue. Please try again.';
}

const GROQ_PREFERRED_MODELS = [
  'llama-3.1-8b-instant',
  'llama-3.3-70b-versatile',
  'openai/gpt-oss-120b',
] as const;

const GROQ_MODEL_CACHE_TTL_MS = 5 * 60 * 1000;
const groqModelCache = new Map<string, { models: string[]; fetchedAt: number }>();

const NON_CHAT_GROQ_MODEL_PATTERN =
  /whisper|audio|guard|tts|playai|orpheus|embed|rerank|speech|moderation|safeguard/i;

function rankGroqChatModels(ids: string[]): string[] {
  const uniqueActive = Array.from(
    new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0 && !NON_CHAT_GROQ_MODEL_PATTERN.test(id)))
  );

  if (uniqueActive.length === 0) {
    return [...GROQ_PREFERRED_MODELS];
  }

  const preferredSet = new Set<string>(GROQ_PREFERRED_MODELS);
  const prioritized = GROQ_PREFERRED_MODELS.filter((m) => uniqueActive.includes(m));
  const others = uniqueActive.filter((id) => !preferredSet.has(id));

  return [...prioritized, ...others];
}

async function getActiveGroqChatModels(
  apiKey: string,
  options?: { forceRefresh?: boolean; signal?: AbortSignal }
): Promise<{ models: string[]; fromCache: boolean }> {
  const now = Date.now();
  const cached = groqModelCache.get(apiKey);
  if (!options?.forceRefresh && cached && now - cached.fetchedAt < GROQ_MODEL_CACHE_TTL_MS) {
    return { models: cached.models, fromCache: true };
  }

  try {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 5000);
    const onParentAbort = () => controller.abort();
    options?.signal?.addEventListener('abort', onParentAbort, { once: true });

    try {
      const resp = await fetch('https://api.groq.com/openai/v1/models', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
      });

      if (resp.status === 401 || resp.status === 403) {
        const errText = await resp.text().catch(() => '');
        throw new Error(extractReadableApiError(errText, resp.status));
      }

      if (resp.ok) {
        const json = (await resp.json()) as {
          data?: Array<{ id?: string; active?: boolean }>;
        };
        const activeIds = (json.data || [])
          .filter((item) => item && typeof item.id === 'string' && item.active !== false)
          .map((item) => item.id as string);

        const ranked = rankGroqChatModels(activeIds);
        groqModelCache.set(apiKey, { models: ranked, fetchedAt: Date.now() });
        return { models: ranked, fromCache: false };
      }
    } finally {
      window.clearTimeout(timeoutId);
      options?.signal?.removeEventListener('abort', onParentAbort);
    }
  } catch (err) {
    if (options?.signal?.aborted) {
      throw err;
    }
    if (err instanceof Error && err.message.includes('Unable to authenticate')) {
      throw err;
    }
  }

  return { models: [...GROQ_PREFERRED_MODELS], fromCache: false };
}

async function streamFromGroq(params: {
  apiKey: string;
  messages: OutgoingMessage[];
  language?: string;
  userName?: string;
  isLiveVoice?: boolean;
  responseStyle?: ResponseStyleMode;
  customInstructions?: string;
  globalSystemPrompt?: string;
  chatModel?: string;
  signal?: AbortSignal;
  onChunk: (text: string) => void;
}): Promise<string> {
  const systemPrompt = buildClientStudyTutorInstruction({
    language: params.language,
    userName: params.userName,
    isLiveVoice: params.isLiveVoice,
    responseStyle: params.responseStyle,
    customInstructions: params.customInstructions,
    globalSystemPrompt: params.globalSystemPrompt,
  });

  const groqMessages = [
    { role: 'system' as const, content: systemPrompt },
    ...params.messages.slice(-10).map((m) => ({
      role: m.role,
      content: formatMessageTextWithFile(m),
    })),
  ];

  let lastErrorMsg = 'I apologize, our AI service had a momentary connection issue. Please try again.';
  let { models: candidateModels, fromCache } = await getActiveGroqChatModels(params.apiKey, {
    signal: params.signal,
  });
  const preferredGroq = params.chatModel?.trim();
  if (
    preferredGroq &&
    preferredGroq !== 'auto' &&
    !preferredGroq.startsWith('gemini-') &&
    candidateModels.includes(preferredGroq)
  ) {
    candidateModels = [preferredGroq, ...candidateModels.filter((m) => m !== preferredGroq)];
  }
  let refreshedAfterFailure = !fromCache;

  for (let i = 0; i < candidateModels.length; i++) {
    const modelName = candidateModels[i];
    let emittedAnyChunk = false;

    try {
      const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${params.apiKey}`,
        },
        body: JSON.stringify({
          model: modelName,
          messages: groqMessages,
          stream: true,
          temperature: 0.65,
          max_tokens: params.isLiveVoice ? 450 : 4096,
        }),
        signal: params.signal,
      });

      if (!resp.ok || !resp.body) {
        const errText = await resp.text().catch(() => '');
        lastErrorMsg = extractReadableApiError(errText, resp.status);
        // Stop retrying if authentication itself is rejected (401/403)
        if (resp.status === 401 || resp.status === 403) {
          throw new Error(lastErrorMsg);
        }
        // If cached list hit a decommissioned/missing model, force-refresh active models once
        if (!refreshedAfterFailure) {
          refreshedAfterFailure = true;
          groqModelCache.delete(params.apiKey);
          const fresh = await getActiveGroqChatModels(params.apiKey, {
            forceRefresh: true,
            signal: params.signal,
          });
          candidateModels = fresh.models;
          i = -1;
          continue;
        }
        if (i === candidateModels.length - 1) {
          throw new Error(lastErrorMsg);
        }
        continue;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const parsed = JSON.parse(payload) as {
              choices?: Array<{ delta?: { content?: string } }>;
              error?: { message?: string };
            };
            if (parsed.error?.message) {
              throw new Error(parsed.error.message);
            }
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              emittedAnyChunk = true;
              accumulated += delta;
              params.onChunk(delta);
            }
          } catch (e) {
            if (e instanceof Error && e.message && !e.message.includes('JSON')) {
              throw e;
            }
          }
        }
      }

      return accumulated;
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw err;
      }
      lastErrorMsg = err instanceof Error ? err.message : lastErrorMsg;
      if (!emittedAnyChunk && i < candidateModels.length - 1) {
        continue;
      }
      throw new Error(lastErrorMsg);
    }
  }

  throw new Error(lastErrorMsg);
}

const GEMINI_SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
];

async function streamFromGeminiDirect(params: {
  apiKey: string;
  messages: OutgoingMessage[];
  language?: string;
  userName?: string;
  isLiveVoice?: boolean;
  responseStyle?: ResponseStyleMode;
  customInstructions?: string;
  globalSystemPrompt?: string;
  chatModel?: string;
  signal?: AbortSignal;
  onChunk: (text: string) => void;
}): Promise<string> {
  const systemText = buildClientStudyTutorInstruction({
    language: params.language,
    userName: params.userName,
    isLiveVoice: params.isLiveVoice,
    responseStyle: params.responseStyle,
    customInstructions: params.customInstructions,
    globalSystemPrompt: params.globalSystemPrompt,
  });

  const contents = params.messages.slice(-10).map((msg) => {
    const parts: Array<{ text: string } | { inline_data: { mime_type: string; data: string } }> = [];
    if (msg.attachment?.base64 && msg.attachment.kind !== 'file') {
      const raw = msg.attachment.base64;
      const cleanBase64 = (raw.includes(',') ? raw.split(',')[1] : raw).trim();
      if (cleanBase64) {
        parts.push({
          inline_data: {
            mime_type: msg.attachment.mimeType || 'image/jpeg',
            data: cleanBase64,
          },
        });
      }
    }
    let text = msg.content?.trim() || '';
    if (msg.attachment?.kind === 'file' && msg.attachment.textContent) {
      const label = msg.attachment.name || 'study-file.txt';
      const section = `[Uploaded File: ${label}]\n\`\`\`\n${msg.attachment.textContent.slice(0, 60000)}\n\`\`\``;
      text = text
        ? `${text}\n\n${section}`
        : `Please kindly review, summarize, or debug this uploaded file:\n\n${section}`;
    } else if (!text && msg.attachment) {
      text = 'Describe and analyze this image in detail.';
    }
    parts.push({ text: text || 'Hello!' });
    return {
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts,
    };
  });

  const baseCandidates = [
    { model: 'gemini-2.5-flash', thinkingConfig: { thinkingBudget: 0 } },
    { model: 'gemini-3.1-flash-lite', thinkingConfig: { thinkingLevel: 'MINIMAL' } },
    { model: 'gemini-4-hydrogen', thinkingConfig: { thinkingLevel: 'LOW' } },
  ];
  const preferredGemini = params.chatModel?.trim();
  const candidates =
    preferredGemini && baseCandidates.some((c) => c.model === preferredGemini)
      ? [
          baseCandidates.find((c) => c.model === preferredGemini)!,
          ...baseCandidates.filter((c) => c.model !== preferredGemini),
        ]
      : baseCandidates;

  let lastErrorMsg = 'Unable to connect to Gemini right now.';

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${candidate.model}:streamGenerateContent?alt=sse`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': params.apiKey,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemText }] },
        contents,
        safetySettings: GEMINI_SAFETY_SETTINGS,
        generationConfig: {
          thinkingConfig: candidate.thinkingConfig,
        },
      }),
      signal: params.signal,
    });

    if (!resp.ok || !resp.body) {
      const rawErr = await resp.text().catch(() => '');
      lastErrorMsg = extractReadableApiError(rawErr, resp.status);
      if ((resp.status === 503 || resp.status === 429 || resp.status === 404) && i < candidates.length - 1) {
        continue;
      }
      throw new Error(lastErrorMsg);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let accumulated = '';

    const processEvents = (events: string[]) => {
      for (const rawEvent of events) {
        const lines = rawEvent.split(/\r?\n/);
        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const parsed = JSON.parse(payload) as {
              candidates?: Array<{
                finishReason?: string;
                content?: { parts?: Array<{ text?: string }> };
              }>;
              promptFeedback?: { blockReason?: string };
              error?: { message?: string };
            };
            if (parsed.error?.message) {
              throw new Error(parsed.error.message);
            }
            if (parsed.promptFeedback?.blockReason) {
              throw new Error(`Gemini blocked the request (${parsed.promptFeedback.blockReason}).`);
            }
            const chunkText = parsed.candidates?.[0]?.content?.parts
              ?.map((p) => p.text ?? '')
              .join('');
            if (chunkText) {
              accumulated += chunkText;
              params.onChunk(chunkText);
            }
          } catch (e) {
            if (e instanceof Error && e.message && !e.message.includes('JSON')) {
              throw e;
            }
          }
        }
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() ?? '';
      processEvents(events);
    }

    buffer += decoder.decode();
    if (buffer.trim()) {
      processEvents(buffer.split(/\r?\n\r?\n/));
    }

    if (!accumulated.trim()) {
      throw new Error('Gemini stream completed without returning any text.');
    }

    return accumulated;
  }

  throw new Error(lastErrorMsg);
}

async function streamFromBackendEndpoint(params: {
  endpoint: '/api/chat' | '/api/chat-live-stream';
  apiKey?: string;
  messages: OutgoingMessage[];
  language?: string;
  userName?: string;
  responseStyle?: ResponseStyleMode;
  customInstructions?: string;
  globalSystemPrompt?: string;
  chatModel?: string;
  signal?: AbortSignal;
  onChunk: (text: string) => void;
}): Promise<{ ok: true; text: string } | { ok: false; shouldFallbackDirect: boolean; error: Error }> {
  try {
    const resp = await fetch(params.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: params.messages,
        language: params.language,
        userName: params.userName,
        apiKey: params.apiKey || undefined,
        responseStyle: params.responseStyle,
        customInstructions: params.customInstructions,
        globalSystemPrompt: params.globalSystemPrompt,
        chatModel: params.chatModel,
      }),
      signal: params.signal,
    });

    const contentType = resp.headers.get('content-type') || '';

    if (!resp.ok) {
      // If deployed statically (Vercel / Netlify), /api/* often returns 404/405 HTML
      if (resp.status === 404 || resp.status === 405 || !contentType.includes('application/json')) {
        return {
          ok: false,
          shouldFallbackDirect: true,
          error: new Error('Static deployment detected without backend route.'),
        };
      }
      const errData = (await resp.json().catch(() => ({}))) as { error?: string; code?: string };
      if (errData.code === 'MISSING_API_KEY') {
        return { ok: false, shouldFallbackDirect: false, error: new MissingApiKeyError() };
      }
      return {
        ok: false,
        shouldFallbackDirect: Boolean(params.apiKey),
        error: new Error(errData.error || extractReadableApiError('', resp.status)),
      };
    }

    if (!contentType.includes('text/event-stream') || !resp.body) {
      return {
        ok: false,
        shouldFallbackDirect: true,
        error: new Error('Streaming endpoint unavailable on this host.'),
      };
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let accumulated = '';
    let streamError: Error | null = null;

    const processBackendEvents = (events: string[]) => {
      for (const rawEvent of events) {
        const lines = rawEvent.split(/\r?\n/);
        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line.startsWith('data:')) continue;
          const jsonStr = line.slice(5).trim();
          if (!jsonStr) continue;
          const parsed = JSON.parse(jsonStr) as {
            type: string;
            text?: string;
            error?: string;
            code?: string;
          };
          if (parsed.type === 'chunk' && parsed.text) {
            accumulated += parsed.text;
            params.onChunk(parsed.text);
          } else if (parsed.type === 'error') {
            if (parsed.code === 'MISSING_API_KEY') {
              streamError = new MissingApiKeyError();
              return;
            }
            streamError = new Error(parsed.error || 'AI streaming failed without details.');
            return;
          }
        }
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() ?? '';
      processBackendEvents(events);
      if (streamError) {
        return { ok: false, shouldFallbackDirect: false, error: streamError };
      }
    }

    buffer += decoder.decode();
    if (buffer.trim()) {
      processBackendEvents(buffer.split(/\r?\n\r?\n/));
      if (streamError) {
        return { ok: false, shouldFallbackDirect: false, error: streamError };
      }
    }

    if (!accumulated.trim()) {
      return {
        ok: false,
        shouldFallbackDirect: Boolean(params.apiKey),
        error: new Error('Server stream finished without returning any content.'),
      };
    }

    return { ok: true, text: accumulated };
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw err;
    }
    return {
      ok: false,
      shouldFallbackDirect: true,
      error: err instanceof Error ? err : new Error('Connection failed.'),
    };
  }
}

async function analyzeImageViaGeminiRest(params: {
  apiKey: string;
  prompt: string;
  base64Data: string;
  mimeType: string;
  language?: string;
  userName?: string;
  isLiveVoice?: boolean;
  responseStyle?: ResponseStyleMode;
  customInstructions?: string;
  globalSystemPrompt?: string;
  signal?: AbortSignal;
}): Promise<string> {
  const cleanBase64 = (
    params.base64Data.includes(',') ? params.base64Data.split(',')[1] : params.base64Data
  ).trim();

  if (!cleanBase64) {
    throw new Error('Image attachment has empty Base64 data.');
  }

  const systemText = buildClientStudyTutorInstruction({
    language: params.language,
    userName: params.userName,
    isLiveVoice: Boolean(params.isLiveVoice),
    responseStyle: params.responseStyle,
    customInstructions: params.customInstructions,
    globalSystemPrompt: params.globalSystemPrompt,
  });

  const visionCandidates: Array<{
    model: string;
    thinkingConfig?: Record<string, unknown>;
  }> = [
    { model: 'gemini-2.5-flash', thinkingConfig: { thinkingBudget: 0 } },
    { model: 'gemini-3.1-flash-lite', thinkingConfig: { thinkingLevel: 'MINIMAL' } },
    { model: 'gemini-4-hydrogen', thinkingConfig: { thinkingLevel: 'LOW' } },
  ];

  let lastError = 'Gemini Vision API request failed.';

  for (let i = 0; i < visionCandidates.length; i++) {
    const candidate = visionCandidates[i];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${candidate.model}:generateContent?key=${encodeURIComponent(
      params.apiKey
    )}`;

    const requestBody: Record<string, unknown> = {
      system_instruction: { parts: [{ text: systemText }] },
      contents: [
        {
          parts: [
            { text: params.prompt || 'Describe and analyze this image in detail.' },
            {
              inline_data: {
                mime_type: params.mimeType || 'image/jpeg',
                data: cleanBase64,
              },
            },
          ],
        },
      ],
      safetySettings: GEMINI_SAFETY_SETTINGS,
    };

    if (candidate.thinkingConfig) {
      requestBody.generationConfig = { thinkingConfig: candidate.thinkingConfig };
    }

    const reqCtrl = new AbortController();
    const timeoutId = window.setTimeout(() => reqCtrl.abort(), 12000);
    const onAbort = () => reqCtrl.abort();
    params.signal?.addEventListener('abort', onAbort, { once: true });

    let resp: Response;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: reqCtrl.signal,
      });
    } finally {
      window.clearTimeout(timeoutId);
      params.signal?.removeEventListener('abort', onAbort);
    }

    const rawText = await resp.text();
    if (!resp.ok) {
      lastError = `Gemini Vision API (${resp.status}): ${extractReadableApiError(rawText, resp.status)}`;
      if ((resp.status === 404 || resp.status === 503 || resp.status === 429) && i < visionCandidates.length - 1) {
        continue;
      }
      throw new Error(lastError);
    }

    const data = JSON.parse(rawText) as {
      candidates?: Array<{
        finishReason?: string;
        content?: { parts?: Array<{ text?: string }> };
      }>;
      promptFeedback?: { blockReason?: string };
      error?: { message?: string };
    };

    if (data.error?.message) {
      lastError = `Gemini Vision API error: ${data.error.message}`;
      if (i < visionCandidates.length - 1) continue;
      throw new Error(lastError);
    }
    if (data.promptFeedback?.blockReason) {
      throw new Error(`Gemini blocked this image request (${data.promptFeedback.blockReason}).`);
    }

    const replyText = (
      data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') || ''
    ).trim();

    if (!replyText) {
      const finishReason = data.candidates?.[0]?.finishReason || 'UNKNOWN';
      throw new Error(`Gemini Vision returned empty text (finishReason: ${finishReason}).`);
    }

    return replyText;
  }

  throw new Error(lastError);
}

export async function streamChatCompletion(params: {
  messages: OutgoingMessage[];
  language?: string;
  userName?: string;
  isLiveVoice?: boolean;
  responseStyle?: ResponseStyleMode;
  customInstructions?: string;
  globalSystemPrompt?: string;
  chatModel?: string;
  hasBackendApi: boolean;
  hasServerGeminiKey: boolean;
  signal?: AbortSignal;
  onChunk: (text: string) => void;
}): Promise<string> {
  const userPrefs = loadUserSettings();
  const ownerCfg = loadOwnerConfig();
  const responseStyle = params.responseStyle ?? userPrefs.responseStyle;
  const customInstructions = params.customInstructions ?? userPrefs.customInstructions;
  const globalSystemPrompt = params.globalSystemPrompt ?? ownerCfg.globalSystemPrompt;
  const chatModel = params.chatModel ?? ownerCfg.chatModel;

  const recentMessages = params.messages.slice(-10);
  const resolved = resolveActiveProvider(params.hasServerGeminiKey);
  const lastMsg = recentMessages[recentMessages.length - 1];
  const currentHasImage = Boolean(lastMsg?.attachment?.base64) && lastMsg?.attachment?.kind !== 'file';
  const hasAnyImageInHistory = recentMessages.some(
    (m) => Boolean(m.attachment?.base64) && m.attachment?.kind !== 'file'
  );

  // When the current message has an uploaded photo/screenshot or live camera frame, bypass Groq completely
  // and call Gemini Vision REST directly with clean inline_data JSON
  if (currentHasImage && lastMsg?.attachment?.base64) {
    const localKey = loadCustomApiKey().trim();
    const geminiDirectKey = localKey.startsWith('AIza') ? localKey : getEnvGeminiKey();
    const promptText =
      lastMsg.content?.trim() || 'Describe and analyze this image in detail.';
    const rawB64 = lastMsg.attachment.base64;
    const base64Data = (rawB64.includes(',') ? rawB64.split(',')[1] : rawB64).trim();
    const mimeType = lastMsg.attachment.mimeType || 'image/jpeg';

    if (geminiDirectKey) {
      const visionText = await analyzeImageViaGeminiRest({
        apiKey: geminiDirectKey,
        prompt: promptText,
        base64Data,
        mimeType,
        language: params.language,
        userName: params.userName,
        isLiveVoice: params.isLiveVoice,
        responseStyle,
        customInstructions,
        globalSystemPrompt,
        signal: params.signal,
      });
      params.onChunk(visionText);
      return visionText;
    }

    // Server-side Gemini key path: call /api/vision (clean direct Gemini Vision REST call)
    const visionResp = await fetch('/api/vision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: promptText,
        base64Data,
        mimeType,
        language: params.language,
        userName: params.userName,
        isLiveVoice: params.isLiveVoice,
        responseStyle,
        customInstructions,
        globalSystemPrompt,
      }),
      signal: params.signal,
    });

    const contentType = visionResp.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error(
        `Photo analysis endpoint unavailable (HTTP ${visionResp.status}). Ensure a Gemini API key is configured.`
      );
    }

    const visionJson = (await visionResp.json()) as { text?: string; error?: string };
    if (!visionResp.ok) {
      throw new Error(
        visionJson.error || `Photo analysis failed with HTTP ${visionResp.status}.`
      );
    }

    const resultText = (visionJson.text || '').trim();
    if (!resultText) {
      throw new Error('Gemini Vision returned an empty response.');
    }

    params.onChunk(resultText);
    return resultText;
  }

  // Follow-up question in a conversation that contains an earlier image: route to multimodal Gemini
  if (hasAnyImageInHistory) {
    const localKey = loadCustomApiKey().trim();
    const geminiDirectKey = localKey.startsWith('AIza') ? localKey : getEnvGeminiKey();
    if (params.hasBackendApi || params.hasServerGeminiKey || !geminiDirectKey) {
      const backendRes = await streamFromBackendEndpoint({
        endpoint: params.isLiveVoice ? '/api/chat-live-stream' : '/api/chat',
        apiKey: geminiDirectKey || undefined,
        messages: recentMessages,
        language: params.language,
        userName: params.userName,
        responseStyle,
        customInstructions,
        globalSystemPrompt,
        chatModel,
        signal: params.signal,
        onChunk: params.onChunk,
      });
      if (backendRes.ok) return backendRes.text;
      if (backendRes.shouldFallbackDirect && geminiDirectKey) {
        return streamFromGeminiDirect({
          apiKey: geminiDirectKey,
          messages: recentMessages,
          language: params.language,
          userName: params.userName,
          isLiveVoice: params.isLiveVoice,
          responseStyle,
          customInstructions,
          globalSystemPrompt,
          chatModel,
          signal: params.signal,
          onChunk: params.onChunk,
        });
      }
      throw backendRes.error;
    }
    return streamFromGeminiDirect({
      apiKey: geminiDirectKey,
      messages: recentMessages,
      language: params.language,
      userName: params.userName,
      isLiveVoice: params.isLiveVoice,
      responseStyle,
      customInstructions,
      globalSystemPrompt,
      chatModel,
      signal: params.signal,
      onChunk: params.onChunk,
    });
  }

  if (resolved.provider === 'none') {
    throw new MissingApiKeyError();
  }

  // Text-only chat: Route Groq (gsk_...) directly to Groq's fast streaming API
  if (resolved.provider === 'groq') {
    return streamFromGroq({
      apiKey: resolved.apiKey,
      messages: params.messages,
      language: params.language,
      userName: params.userName,
      isLiveVoice: params.isLiveVoice,
      responseStyle,
      customInstructions,
      globalSystemPrompt,
      chatModel,
      signal: params.signal,
      onChunk: params.onChunk,
    });
  }

  // Gemini: Try backend /api/* if Express server is active, otherwise call Gemini REST directly (Vercel/static friendly)
  if (params.hasBackendApi || resolved.source === 'server') {
    const backendRes = await streamFromBackendEndpoint({
      endpoint: params.isLiveVoice ? '/api/chat-live-stream' : '/api/chat',
      apiKey: resolved.apiKey || undefined,
      messages: params.messages,
      language: params.language,
      userName: params.userName,
      responseStyle,
      customInstructions,
      globalSystemPrompt,
      chatModel,
      signal: params.signal,
      onChunk: params.onChunk,
    });

    if (backendRes.ok) {
      return backendRes.text;
    }

    if (backendRes.shouldFallbackDirect && resolved.apiKey) {
      return streamFromGeminiDirect({
        apiKey: resolved.apiKey,
        messages: params.messages,
        language: params.language,
        userName: params.userName,
        isLiveVoice: params.isLiveVoice,
        responseStyle,
        customInstructions,
        globalSystemPrompt,
        chatModel,
        signal: params.signal,
        onChunk: params.onChunk,
      });
    }

    throw backendRes.error;
  }

  // Static deployment (e.g. Vercel) with Gemini AIza... key
  if (resolved.apiKey) {
    return streamFromGeminiDirect({
      apiKey: resolved.apiKey,
      messages: params.messages,
      language: params.language,
      userName: params.userName,
      isLiveVoice: params.isLiveVoice,
      responseStyle,
      customInstructions,
      globalSystemPrompt,
      chatModel,
      signal: params.signal,
      onChunk: params.onChunk,
    });
  }

  throw new MissingApiKeyError();
}

async function runQuickTextCompletion(params: {
  systemPrompt: string;
  userPrompt: string;
  hasBackendApi: boolean;
  hasServerGeminiKey: boolean;
  maxTokens?: number;
}): Promise<string | null> {
  const resolved = resolveActiveProvider(params.hasServerGeminiKey);
  if (resolved.provider === 'none') return null;

  try {
    if (resolved.provider === 'groq') {
      const { models } = await getActiveGroqChatModels(resolved.apiKey);
      for (let i = 0; i < Math.min(2, models.length); i++) {
        const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${resolved.apiKey}`,
          },
          body: JSON.stringify({
            model: models[i],
            messages: [
              { role: 'system', content: params.systemPrompt },
              { role: 'user', content: params.userPrompt },
            ],
            temperature: 0.5,
            max_tokens: params.maxTokens ?? 400,
          }),
        });
        if (resp.ok) {
          const json = (await resp.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
          };
          const out = json.choices?.[0]?.message?.content?.trim();
          if (out) return out;
        }
      }
      return null;
    }

    if (resolved.apiKey) {
      const resp = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': resolved.apiKey,
          },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: params.systemPrompt }] },
            contents: [{ role: 'user', parts: [{ text: params.userPrompt }] }],
            safetySettings: GEMINI_SAFETY_SETTINGS,
            generationConfig: { thinkingConfig: { thinkingBudget: 0 } },
          }),
        }
      );
      if (resp.ok) {
        const data = (await resp.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
      }
    }

    if (params.hasBackendApi || resolved.source === 'server') {
      let collected = '';
      await streamChatCompletion({
        messages: [
          {
            role: 'user',
            content: `${params.systemPrompt}\n\nRequest: ${params.userPrompt}`,
          },
        ],
        hasBackendApi: params.hasBackendApi,
        hasServerGeminiKey: params.hasServerGeminiKey,
        onChunk: (c) => {
          collected += c;
        },
      });
      return collected.trim() || null;
    }
  } catch {
    // Graceful fallback if quick helper fails
  }
  return null;
}

// Zero frontend quota/cooldown locks: image generation is always unlimited!
export function getPollinationsCooldownRemainingSec(): number {
  return 0;
}

const RISKY_WORD_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\b(nude|naked|nsfw|sexy|bikini|lingerie|underwear|erotic|explicit|porn)\b/gi, 'modest stylish modern attire'],
  [/\b(blood|gore|kill|murder|dead body|corpse|violent|weapon|gun|knife|swordfight)\b/gi, 'dramatic artistic adventure'],
  [/\b(drug|weed|cocaine|cigarette|alcohol|beer|wine)\b/gi, 'refreshing herbal tea cup'],
];

const BARE_HUMAN_SUBJECT_RX =
  /^(a\s+|an\s+|the\s+)?(human|person|people|man|men|woman|women|boy|girl|kid|child|portrait|face|human being|insaan|aadmi|larka|larki)$/i;

export function sanitizeShortSafePrompt(rawInput: string, maxWords = 24): string {
  let text = (rawInput || '')
    .replace(/["'`\n\r]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  for (const [rx, safeReplacement] of RISKY_WORD_REPLACEMENTS) {
    text = text.replace(rx, safeReplacement);
  }

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length > maxWords) {
    text = words.slice(0, maxWords).join(' ').replace(/[,.;:-]+$/, '').trim();
  }
  return text || 'photorealistic serene scenery, golden hour lighting, sharp HD detail';
}

export function buildSafeArtisticPrompt(rawInput: string): string {
  let text = rawInput
    .replace(
      /\b(create|generate|make|draw|paint|sketch|render|show|please|kindly|me|mujy|mujhe|a|an|ek|aik|pic|pics|picture|tasveer|tasweer|tasvir|taswir|photo|foto|image|img|banao|bnao|bna\s*do|bna\s*dy|bna\s*de|bana\s*do|bana\s*dy|bana\s*de|banado|bnado|dikhao|chahiye|khincho|kar\s*do|kr\s*do)\b/gi,
      ' '
    )
    .replace(/\b(naksha|naqsha)\b/gi, 'modern architectural floor plan design')
    .replace(/\bof\b/gi, ' ')
    .replace(/[^\p{L}\p{N}\s,.-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  for (const [rx, safeReplacement] of RISKY_WORD_REPLACEMENTS) {
    text = text.replace(rx, safeReplacement);
  }

  if (!text || BARE_HUMAN_SUBJECT_RX.test(text)) {
    const noun = text.toLowerCase();
    if (noun.includes('woman') || noun.includes('girl') || noun.includes('larki')) {
      return 'Photorealistic portrait of a friendly smiling woman in modern studio, warm natural lighting, sharp HD focus';
    }
    if (noun.includes('man') || noun.includes('boy') || noun.includes('larka')) {
      return 'Photorealistic portrait of a friendly smiling young man in modern studio, warm natural lighting, sharp HD focus';
    }
    return 'Photorealistic portrait of a friendly smiling person in sunlit contemporary studio, warm golden hour lighting, sharp HD';
  }

  const wordCount = text.split(/\s+/).length;
  if (wordCount >= 12) {
    return sanitizeShortSafePrompt(text, 24);
  }

  const hasHumanNoun = /\b(human|person|people|man|woman|boy|girl|child|student|teacher|doctor|astronaut|face|portrait)\b/i.test(
    text
  );
  if (hasHumanNoun && wordCount <= 6) {
    return sanitizeShortSafePrompt(
      `Photorealistic studio portrait of a friendly ${text}, warm natural sunlight, sharp HD focus`,
      24
    );
  }

  return sanitizeShortSafePrompt(
    `${text}, photorealistic natural lighting, crisp HD focus`,
    24
  );
}


// Preserve 100% original crisp HD image resolution without blurry lossy recompression
async function blobToSharpDataUrl(blob: Blob): Promise<string | null> {
  try {
    if (blob.size <= 6 * 1024 * 1024) {
      const rawDataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
        reader.onerror = () => resolve('');
        reader.readAsDataURL(blob);
      });
      if (rawDataUrl) return rawDataUrl;
    }

    const objUrl = URL.createObjectURL(blob);
    try {
      const img = await new Promise<HTMLImageElement | null>((resolve) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => resolve(null);
        el.src = objUrl;
      });
      if (!img || img.naturalWidth < 64 || img.naturalHeight < 64) {
        return null;
      }

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/png');
    } finally {
      URL.revokeObjectURL(objUrl);
    }
  } catch {
    return null;
  }
}

export async function translatePromptToDetailedEnglish(params: {
  rawPrompt: string;
  hasBackendApi: boolean;
  hasServerGeminiKey: boolean;
}): Promise<{ detailedPrompt: string; shortTitle: string }> {
  const cleaned = params.rawPrompt.trim();

  // 1. Prefer Gemini API Step-1 Prompt Enhancer via backend endpoint
  if (params.hasBackendApi || params.hasServerGeminiKey) {
    try {
      const localKey = loadCustomApiKey().trim();
      const clientGeminiKey = localKey.startsWith('AIza') ? localKey : getEnvGeminiKey();
      const resp = await fetch('/api/detect-image-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: cleaned,
          forceImage: true,
          apiKey: clientGeminiKey || undefined,
        }),
      });
      if (resp.ok) {
        const data = (await resp.json()) as {
          shortTitle?: string;
          enhancedPrompt?: string;
        };
        if (data.enhancedPrompt && data.enhancedPrompt.trim().length > 4) {
          return {
            shortTitle: (data.shortTitle || cleaned).slice(0, 56),
            detailedPrompt: sanitizeShortSafePrompt(data.enhancedPrompt.trim(), 24),
          };
        }
      }
    } catch {
      // Fall through to generic text enhancer below
    }
  }

  const translated = await runQuickTextCompletion({
    systemPrompt: [
      'You are an expert, family-friendly AI visual prompt engineer.',
      'Convert ANY user request from ANY world language (100+ languages including English, Urdu, Roman Urdu, Hindi, Arabic, Punjabi, Pashto, Sindhi, Spanish, French, German, Turkish, Chinese, Japanese, Korean, Russian, etc.) into a clean, safe, family-friendly English prompt STRICTLY under 25 words including sharp photography descriptors such as "ultra-sharp focus, crisp details, 8k resolution, DSLR 85mm lens, natural lighting".',
      'Strip command words like "pic bna do", "tasveer banao", "naksha banao", "generate image", "draw me". Never include unsafe, explicit, or violent terms.',
      'Return ONLY JSON: {"title":"short 3-6 word title","detailedPrompt":"clean English prompt under 25 words"}',
    ].join(' '),
    userPrompt: cleaned,
    hasBackendApi: params.hasBackendApi,
    hasServerGeminiKey: params.hasServerGeminiKey,
    maxTokens: 200,
  });

  if (translated) {
    try {
      const start = translated.indexOf('{');
      const end = translated.lastIndexOf('}');
      if (start >= 0 && end > start) {
        const parsed = JSON.parse(translated.slice(start, end + 1)) as {
          title?: string;
          detailedPrompt?: string;
        };
        if (parsed.detailedPrompt && parsed.detailedPrompt.trim().length > 4) {
          return {
            shortTitle: (parsed.title || cleaned).slice(0, 56),
            detailedPrompt: sanitizeShortSafePrompt(parsed.detailedPrompt.trim(), 24),
          };
        }
      }
    } catch {
      // Fall back to deterministic safe prompt enhancer below
    }
  }

  const safePrompt = buildSafeArtisticPrompt(cleaned);
  const titleCandidate = cleaned
    .replace(
      /\b(create|generate|make|draw|paint|sketch|render|show|please|kindly|me|mujy|mujhe|a|an|ek|aik|pic|picture|tasveer|tasweer|photo|image|banao|bnao|bna\s*do|bana\s*do|banado|dikhao|chahiye)\b/gi,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim();

  return {
    shortTitle: (titleCandidate || 'Ultra-HD AI Artwork').slice(0, 52),
    detailedPrompt: safePrompt,
  };
}

function resolveOfficialNanoModelId(preferred?: string): 'gemini-2.5-flash-image' | 'gemini-3.1-flash-image-preview' {
  if (preferred === 'gemini-3.1-flash-image-preview') {
    return 'gemini-3.1-flash-image-preview';
  }
  return 'gemini-2.5-flash-image';
}

async function extractBase64AndMimeFromUrl(
  imageUrlOrDataUrl: string,
  fallbackMime = 'image/png'
): Promise<{ base64: string; mimeType: string }> {
  const trimmed = imageUrlOrDataUrl.trim();
  if (trimmed.startsWith('data:')) {
    const commaIdx = trimmed.indexOf(',');
    const meta = commaIdx > 5 ? trimmed.slice(5, commaIdx) : '';
    const mimeType = meta.split(';')[0] || fallbackMime;
    const rawPayload = commaIdx >= 0 ? trimmed.slice(commaIdx + 1) : '';
    if (mimeType.includes('svg')) {
      // Convert SVG data URL to lossless PNG data URL via canvas for Gemini Vision/Editing
      const img = await new Promise<HTMLImageElement | null>((resolve) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => resolve(null);
        el.src = trimmed;
      });
      if (img && img.naturalWidth > 0) {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || 1024;
        canvas.height = img.naturalHeight || 1024;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const pngUrl = canvas.toDataURL('image/png');
          return {
            base64: pngUrl.split(',')[1] || '',
            mimeType: 'image/png',
          };
        }
      }
    }
    return { base64: rawPayload.trim(), mimeType };
  }

  const resp = await fetch(trimmed);
  if (!resp.ok) {
    throw new Error('Could not load the previous image for editing.');
  }
  const blob = await resp.blob();
  const dataUrl = await blobToSharpDataUrl(blob);
  if (!dataUrl) {
    throw new Error('Could not decode the previous image for editing.');
  }
  const commaIdx = dataUrl.indexOf(',');
  const mimeType = dataUrl.slice(5, commaIdx).split(';')[0] || blob.type || fallbackMime;
  return {
    base64: dataUrl.slice(commaIdx + 1).trim(),
    mimeType,
  };
}

async function tryNanoBananaApi(params: {
  prompt: string;
  sourceImageBase64?: string;
  sourceMimeType?: string;
  aspectRatio: '1:1' | '16:9' | '4:3';
  resolution?: '1K' | '2K';
  mode: 'generate' | 'edit';
  preferredModel?: string;
  previousEditContext?: string;
  skipEnhance?: boolean;
  hasBackendApi: boolean;
  hasServerGeminiKey: boolean;
  onStatus?: (msg: string) => void;
}): Promise<
  | {
      ok: true;
      imageUrl: string;
      provider: 'nano-banana' | 'pollinations';
      modelUsed: string;
      title: string;
      detailedPrompt: string;
      assistantText?: string;
      width: number;
      height: number;
    }
  | { ok: false; reason: string }
> {
  const localKey = loadCustomApiKey().trim();
  const envGeminiKey = getEnvGeminiKey();
  const clientGeminiKey = localKey.startsWith('AIza') ? localKey : envGeminiKey;
  const officialModelId = resolveOfficialNanoModelId(
    params.preferredModel || loadOwnerConfig().imageModel
  );

  params.onStatus?.(
    params.mode === 'edit'
      ? `Editing photo with Nano Banana (${officialModelId})...`
      : `Generating ${params.resolution || '1K'} HD image with Nano Banana (${officialModelId})...`
  );

  // 1. Primary: Express Server /api/nano-banana (Dual-Engine: Nano Banana -> Flux HD on 429)
  if (params.hasBackendApi || params.hasServerGeminiKey) {
    try {
      const resp = await fetch('/api/nano-banana', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: params.prompt,
          sourceImageBase64: params.sourceImageBase64,
          sourceMimeType: params.sourceMimeType,
          aspectRatio: params.aspectRatio,
          resolution: params.resolution || '1K',
          mode: params.mode,
          preferredModel: officialModelId,
          previousEditContext: params.previousEditContext,
          skipEnhance: params.skipEnhance,
          apiKey: clientGeminiKey || undefined,
        }),
      });
      const contentType = resp.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = (await resp.json()) as {
          imageUrl?: string;
          provider?: 'nano-banana' | 'pollinations';
          modelUsed?: string;
          title?: string;
          detailedPrompt?: string;
          assistantText?: string;
          width?: number;
          height?: number;
          error?: string;
        };
        if (resp.ok && data.imageUrl) {
          return {
            ok: true,
            imageUrl: data.imageUrl,
            provider: data.provider === 'pollinations' ? 'pollinations' : 'nano-banana',
            modelUsed: data.modelUsed || officialModelId,
            title: data.title || params.prompt.slice(0, 52),
            detailedPrompt: data.detailedPrompt || params.prompt,
            assistantText: data.assistantText,
            width: data.width || 1024,
            height: data.height || 1024,
          };
        }
        return {
          ok: false,
          reason: data.error || `Gemini API (${officialModelId}) returned HTTP ${resp.status}`,
        };
      }
      const rawText = await resp.text().catch(() => '');
      return {
        ok: false,
        reason: rawText.trim() || `Nano Banana endpoint returned HTTP ${resp.status}`,
      };
    } catch (err) {
      return {
        ok: false,
        reason: err instanceof Error ? err.message : 'Nano Banana backend connection failed',
      };
    }
  }

  // 2. Direct Gemini REST API (when running as static bundle without Express backend)
  if (clientGeminiKey) {
    try {
      // Translate Roman Urdu / short prompts into detailed English using gemini-2.5-flash when not pre-enhanced
      let promptToSend = params.prompt.trim();
      let shortTitle = promptToSend.slice(0, 52);

      if (!params.skipEnhance) {
        try {
          const enhResp = await fetch(
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': clientGeminiKey,
              },
              body: JSON.stringify({
                system_instruction: {
                  parts: [
                    {
                      text:
                        params.mode === 'edit'
                          ? 'Translate ANY photo edit request from ANY world language into a clean, safe, family-friendly English editing instruction STRICTLY under 25 words. Keep subject identity consistent. Return ONLY JSON: {"shortTitle":"3-6 words","enhancedPrompt":"clean English edit instruction under 25 words"}'
                          : 'Translate ANY image request from ANY world language into a clean, safe, family-friendly English prompt STRICTLY under 25 words including sharp photography descriptors ("ultra-sharp focus, crisp details, 8k resolution, DSLR 85mm lens, natural lighting"). Return ONLY JSON: {"shortTitle":"3-6 words","enhancedPrompt":"clean English image prompt under 25 words"}',
                    },
                  ],
                },
                contents: [{ role: 'user', parts: [{ text: promptToSend }] }],
                safetySettings: GEMINI_SAFETY_SETTINGS,
                generationConfig: {
                  responseMimeType: 'application/json',
                  thinkingConfig: { thinkingBudget: 0 },
                },
              }),
            }
          );
          if (enhResp.ok) {
            const enhJson = (await enhResp.json()) as {
              candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
            };
            const rawJsonText = enhJson.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (rawJsonText) {
              const parsed = JSON.parse(rawJsonText.trim()) as {
                shortTitle?: string;
                enhancedPrompt?: string;
              };
              if (parsed.enhancedPrompt?.trim()) promptToSend = parsed.enhancedPrompt.trim();
              if (parsed.shortTitle?.trim()) shortTitle = parsed.shortTitle.trim().slice(0, 56);
            }
          }
        } catch {
          // Proceed with original prompt so primary image call still executes cleanly
        }
      }

      promptToSend = sanitizeShortSafePrompt(promptToSend, 24);

      const finalText =
        params.mode === 'edit'
          ? `${promptToSend}. Keep original subject identity consistent, crisp HD clarity.`
          : promptToSend;

      const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [];
      if (params.sourceImageBase64) {
        parts.push({
          inlineData: {
            data: params.sourceImageBase64,
            mimeType: params.sourceMimeType || 'image/png',
          },
        });
      }
      parts.push({ text: finalText });

      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          officialModelId
        )}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': clientGeminiKey,
          },
          body: JSON.stringify({
            contents: [{ role: 'user', parts }],
            safetySettings: GEMINI_SAFETY_SETTINGS,
            generationConfig: {
              responseModalities: ['IMAGE', 'TEXT'],
              imageConfig:
                officialModelId === 'gemini-3.1-flash-image-preview' && params.resolution === '2K'
                  ? { aspectRatio: params.aspectRatio, imageSize: '2K' }
                  : { aspectRatio: params.aspectRatio },
            },
          }),
        }
      );

      if (!resp.ok) {
        const errBody = await resp.text();
        const errLower = errBody.toLowerCase();
        const isQuota429 =
          resp.status === 429 ||
          errLower.includes('resource_exhausted') ||
          errLower.includes('limit: 0') ||
          errLower.includes('free_tier') ||
          errLower.includes('exceeded your current quota');

        if (isQuota429) {
          const cleanShortPrompt = sanitizeShortSafePrompt(promptToSend, 24);
          const w = params.aspectRatio === '16:9' ? 1280 : params.aspectRatio === '4:3' ? 1024 : 1024;
          const h = params.aspectRatio === '16:9' ? 720 : params.aspectRatio === '4:3' ? 768 : 1024;
          const randomSeed = Math.floor(Math.random() * 1000000);
          const fluxUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(
            cleanShortPrompt
          )}?width=${w}&height=${h}&model=flux&nologo=true&safe=true&seed=${randomSeed}`;
          return {
            ok: true,
            imageUrl: fluxUrl,
            provider: 'pollinations',
            modelUsed: 'flux',
            title: shortTitle,
            detailedPrompt: cleanShortPrompt,
            width: w,
            height: h,
          };
        }

        return {
          ok: false,
          reason: `Gemini API (${officialModelId}, HTTP ${resp.status}): ${extractReadableApiError(errBody, resp.status)}`,
        };
      }

      const json = (await resp.json()) as {
        promptFeedback?: { blockReason?: string };
        candidates?: Array<{
          finishReason?: string;
          content?: {
            parts?: Array<{
              text?: string;
              inlineData?: { data?: string; mimeType?: string };
            }>;
          };
        }>;
      };

      if (json.promptFeedback?.blockReason) {
        return {
          ok: false,
          reason: `Gemini API (${officialModelId}) blocked prompt: ${json.promptFeedback.blockReason}`,
        };
      }

      let imgData = '';
      let imgMime = 'image/png';
      let assistantText = '';
      for (const part of json.candidates?.[0]?.content?.parts ?? []) {
        if (part.inlineData?.data && !imgData) {
          imgData = part.inlineData.data;
          imgMime = part.inlineData.mimeType || 'image/png';
        } else if (part.text) {
          assistantText += `${part.text}\n`;
        }
      }

      if (!imgData) {
        const finishReason = json.candidates?.[0]?.finishReason;
        return {
          ok: false,
          reason:
            assistantText.trim() ||
            `Gemini API (${officialModelId}) returned no image data${finishReason ? ` (finishReason: ${finishReason})` : ''}.`,
        };
      }

      const w = params.aspectRatio === '16:9' ? 1376 : params.aspectRatio === '4:3' ? 1200 : 1024;
      const h = params.aspectRatio === '16:9' ? 768 : params.aspectRatio === '4:3' ? 896 : 1024;
      return {
        ok: true,
        imageUrl: `data:${imgMime};base64,${imgData}`,
        provider: 'nano-banana',
        modelUsed: officialModelId,
        title: shortTitle,
        detailedPrompt: finalText,
        assistantText: assistantText.trim(),
        width: w,
        height: h,
      };
    } catch (err) {
      return {
        ok: false,
        reason: err instanceof Error ? err.message : `Gemini API (${officialModelId}) request failed.`,
      };
    }
  }

  return {
    ok: false,
    reason: `Nano Banana (${officialModelId}) requires a configured Gemini API key.`,
  };
}

export async function generateArtworkUnified(params: {
  prompt: string;
  aspectRatio: '1:1' | '16:9' | '4:3';
  resolution?: '1K' | '2K';
  language?: string;
  hasBackendApi: boolean;
  hasServerGeminiKey: boolean;
  preEnhanced?: { detailedPrompt: string; shortTitle: string };
  onStatus?: (msg: string) => void;
}): Promise<{
  title: string;
  description: string;
  detailedPrompt: string;
  svgCode?: string;
  imageUrl: string;
  provider: 'nano-banana' | 'pollinations';
  modelUsed: string;
  aspectRatio: '1:1' | '16:9' | '4:3';
  width: number;
  height: number;
}> {
  const configuredModel = resolveOfficialNanoModelId(loadOwnerConfig().imageModel);

  params.onStatus?.('Translating & enhancing prompt with Gemini 2.5 Flash...');
  const { detailedPrompt, shortTitle } =
    params.preEnhanced?.detailedPrompt
      ? params.preEnhanced
      : await translatePromptToDetailedEnglish({
          rawPrompt: params.prompt,
          hasBackendApi: params.hasBackendApi,
          hasServerGeminiKey: params.hasServerGeminiKey,
        });

  const nanoRes = await tryNanoBananaApi({
    prompt: detailedPrompt,
    aspectRatio: params.aspectRatio,
    resolution: params.resolution || '1K',
    mode: 'generate',
    preferredModel: configuredModel,
    skipEnhance: true,
    hasBackendApi: params.hasBackendApi,
    hasServerGeminiKey: params.hasServerGeminiKey,
    onStatus: params.onStatus,
  });

  if (!nanoRes.ok) {
    throw new Error(nanoRes.reason);
  }

  return {
    title: shortTitle || nanoRes.title || 'Ultra-HD AI Artwork',
    description: detailedPrompt,
    detailedPrompt: nanoRes.detailedPrompt || detailedPrompt,
    imageUrl: nanoRes.imageUrl,
    provider: nanoRes.provider,
    modelUsed: nanoRes.modelUsed,
    aspectRatio: params.aspectRatio,
    width: nanoRes.width,
    height: nanoRes.height,
  };
}

export async function editArtworkUnified(params: {
  prompt: string;
  sourceImageDataUrl: string;
  sourceMimeType?: string;
  aspectRatio?: '1:1' | '16:9' | '4:3';
  resolution?: '1K' | '2K';
  previousEditContext?: string;
  preEnhanced?: { detailedPrompt: string; shortTitle: string };
  hasBackendApi: boolean;
  hasServerGeminiKey: boolean;
  onStatus?: (msg: string) => void;
}): Promise<{
  title: string;
  description: string;
  detailedPrompt: string;
  assistantText?: string;
  imageUrl: string;
  provider: 'nano-banana' | 'pollinations';
  modelUsed: string;
  isEdited: true;
  aspectRatio: '1:1' | '16:9' | '4:3';
  width: number;
  height: number;
}> {
  const aspectRatio = params.aspectRatio || '1:1';
  const configuredModel = resolveOfficialNanoModelId(loadOwnerConfig().imageModel);

  params.onStatus?.('Preparing source image for Nano Banana editing...');
  const extracted = await extractBase64AndMimeFromUrl(
    params.sourceImageDataUrl,
    params.sourceMimeType || 'image/png'
  );

  if (!extracted.base64) {
    throw new Error('Source photo data could not be read for editing. Please re-attach the photo.');
  }

  const editPrompt = params.preEnhanced?.detailedPrompt || params.prompt.trim();
  const nanoRes = await tryNanoBananaApi({
    prompt: editPrompt,
    sourceImageBase64: extracted.base64,
    sourceMimeType: extracted.mimeType,
    aspectRatio,
    resolution: params.resolution || '1K',
    mode: 'edit',
    preferredModel: configuredModel,
    previousEditContext: params.previousEditContext,
    skipEnhance: Boolean(params.preEnhanced?.detailedPrompt),
    hasBackendApi: params.hasBackendApi,
    hasServerGeminiKey: params.hasServerGeminiKey,
    onStatus: params.onStatus,
  });

  if (!nanoRes.ok) {
    throw new Error(nanoRes.reason);
  }

  return {
    title: params.preEnhanced?.shortTitle || nanoRes.title || 'Edited HD Photo',
    description: nanoRes.detailedPrompt,
    detailedPrompt: nanoRes.detailedPrompt,
    assistantText: nanoRes.assistantText,
    imageUrl: nanoRes.imageUrl,
    provider: nanoRes.provider,
    modelUsed: nanoRes.modelUsed,
    isEdited: true,
    aspectRatio,
    width: nanoRes.width,
    height: nanoRes.height,
  };
}

export async function generateVideoUnified(params: {
  prompt: string;
  style?: string;
  language?: string;
  hasBackendApi: boolean;
  hasServerGeminiKey: boolean;
  onStatus?: (msg: string) => void;
}): Promise<GeneratedVideo> {
  const styleLabel = params.style?.trim() || 'Cinematic Realism';
  const cleanUserPrompt = params.prompt.trim();

  params.onStatus?.('Directing your cinematic story...');

  const langHint =
    params.language && params.language !== 'Auto-Detect'
      ? `Write the short narration in ${params.language}.`
      : 'Write the short narration in English (or match the prompt language naturally).';

  const storyboardRaw = await runQuickTextCompletion({
    systemPrompt: [
      'You are an AI Film Director.',
      `Given any topic or video request, create a family-friendly 4-beat visual story in "${styleLabel}" style.`,
      langHint,
      'Provide ONE single unified, safe, vivid English artistic prompt ("heroVisualPrompt", under 38 words) representing the core visual scene, plus 4 short sequential scene captions.',
      'Return ONLY valid JSON: {"title":"...","mood":"cinematic|calm|epic|study","narration":"2-3 warm concise sentences","heroVisualPrompt":"safe vivid English artwork description","captions":["Scene 1 title","Scene 2 title","Scene 3 title","Scene 4 title"]}',
    ].join(' '),
    userPrompt: cleanUserPrompt,
    hasBackendApi: params.hasBackendApi,
    hasServerGeminiKey: params.hasServerGeminiKey,
    maxTokens: 450,
  });

  let title = cleanUserPrompt.slice(0, 52) || 'AI Cinema Story';
  let mood: GeneratedVideo['mood'] = 'cinematic';
  let narration = `Here is a cinematic AI visual story crafted for ${cleanUserPrompt}.`;
  let heroVisualPrompt = '';
  let captions: string[] = [];

  if (storyboardRaw) {
    try {
      const start = storyboardRaw.indexOf('{');
      const end = storyboardRaw.lastIndexOf('}');
      if (start >= 0 && end > start) {
        const parsed = JSON.parse(storyboardRaw.slice(start, end + 1)) as {
          title?: string;
          mood?: string;
          narration?: string;
          heroVisualPrompt?: string;
          captions?: string[];
        };
        if (parsed.title) title = parsed.title.slice(0, 64);
        if (parsed.narration) narration = parsed.narration.trim();
        if (parsed.heroVisualPrompt) heroVisualPrompt = parsed.heroVisualPrompt.trim();
        if (
          parsed.mood === 'calm' ||
          parsed.mood === 'epic' ||
          parsed.mood === 'study' ||
          parsed.mood === 'cinematic'
        ) {
          mood = parsed.mood;
        }
        if (Array.isArray(parsed.captions) && parsed.captions.length >= 2) {
          captions = parsed.captions.slice(0, 4).map((c, idx) => (c || `Scene ${idx + 1}`).trim());
        }
      }
    } catch {
      // Fallback below
    }
  }

  const defaultCaptions = [
    'Opening Horizon',
    'Closer Perspective',
    'Cinematic Motion',
    'Serene Finale',
  ];
  while (captions.length < 4) {
    captions.push(defaultCaptions[captions.length]);
  }

  const safeHeroPrompt = buildSafeArtisticPrompt(
    heroVisualPrompt || `${cleanUserPrompt}, ${styleLabel} cinematic wide atmosphere`
  );

  const configuredModel = resolveOfficialNanoModelId(loadOwnerConfig().imageModel);
  const imageResult = await tryNanoBananaApi({
    prompt: safeHeroPrompt,
    aspectRatio: '16:9',
    resolution: '1K',
    mode: 'generate',
    preferredModel: configuredModel,
    skipEnhance: true,
    hasBackendApi: params.hasBackendApi,
    hasServerGeminiKey: params.hasServerGeminiKey,
    onStatus: params.onStatus,
  });

  if (!imageResult.ok) {
    throw new Error(imageResult.reason);
  }

  const singleHeroUrl = imageResult.imageUrl;

  const scenes: VideoScene[] = captions.slice(0, 4).map((caption) => ({
    caption,
    visualPrompt: safeHeroPrompt,
    imageUrl: singleHeroUrl,
  }));

  return {
    title,
    prompt: cleanUserPrompt,
    narration,
    mood,
    style: styleLabel,
    heroImageUrl: singleHeroUrl,
    provider: imageResult.provider,
    scenes,
    aspectRatio: '16:9',
    createdAt: Date.now(),
  };
}


