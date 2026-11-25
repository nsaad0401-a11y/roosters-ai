import {
  loadAllConfiguredApiKeys,
  loadCustomApiKey,
  loadOwnerConfig,
  loadUserSettings,
  parseApiKeysList,
} from './storage';
import {
  GeneratedVideo,
  GroundingSource,
  ImageAspectRatio,
  ResponseStyleMode,
  VideoAspectRatio,
  VideoScene,
} from '../types';

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

export function getAllGeminiKeys(): string[] {
  const combined = [...loadAllConfiguredApiKeys(), ...parseApiKeysList(getEnvGeminiKey())];
  return Array.from(new Set(combined.filter((k) => k.startsWith('AIza'))));
}

export function getAllGroqKeys(): string[] {
  const combined = [...loadAllConfiguredApiKeys(), ...parseApiKeysList(getEnvGroqKey())];
  return Array.from(new Set(combined.filter((k) => k.startsWith('gsk_'))));
}

export function resolveActiveProvider(hasServerGeminiKey: boolean): ResolvedProvider {
  const configuredKeys = loadAllConfiguredApiKeys();
  const firstLocal = configuredKeys[0] || '';
  if (firstLocal) {
    if (firstLocal.startsWith('gsk_')) {
      return {
        provider: 'groq',
        apiKey: firstLocal,
        source: 'local',
        label: 'Groq (Auto Active Model)',
      };
    }
    if (firstLocal.startsWith('AIza')) {
      return {
        provider: 'gemini',
        apiKey: firstLocal,
        source: 'local',
        label:
          configuredKeys.filter((k) => k.startsWith('AIza')).length > 1
            ? `Gemini (${configuredKeys.filter((k) => k.startsWith('AIza')).length} Keys Rotating)`
            : 'Gemini (Active Key)',
      };
    }
  }

  const envGroqKeys = parseApiKeysList(getEnvGroqKey()).filter((k) => k.startsWith('gsk_'));
  if (envGroqKeys.length > 0) {
    return {
      provider: 'groq',
      apiKey: envGroqKeys[0],
      source: 'env',
      label: 'Groq (Built-In)',
    };
  }

  const envGeminiKeys = parseApiKeysList(getEnvGeminiKey()).filter((k) => k.startsWith('AIza'));
  if (envGeminiKeys.length > 0) {
    return {
      provider: 'gemini',
      apiKey: envGeminiKeys[0],
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
    label: 'Free Cloud Engine',
  };
}

export function buildClientStudyTutorInstruction(options: {
  language?: string;
  userName?: string;
  isLiveVoice?: boolean;
  deepResearch?: boolean;
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
    deepResearch = false,
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
    deepResearch && !isLiveVoice
      ? [
          'DEEP RESEARCH MODE ACTIVE: Conduct thorough, multi-step analytical research grounded in live Google Search findings.',
          'You MUST structure EVERY response cleanly using these exact Markdown headings:',
          '## Executive Summary',
          '(Concise 2-4 sentence overview answering the core question)',
          '## Detailed Findings & Analysis',
          '(Comprehensive breakdown using clear ### subheadings and bullet points comparing perspectives, context, causes, and implications)',
          '## Key Facts & Data',
          '(Bullet list of concrete statistics, dates, benchmarks, specifications, or verified empirical figures)',
          '## Verified Sources & Links',
          '(Markdown bullet list of real verified source links formatted as [Source Title](https://full-url) — only include authentic URLs from search results, never invent links).',
        ].join(' ')
      : responseStyle === 'study'
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

  const googleSearchRule = [
    'LIVE GOOGLE SEARCH & REAL-TIME LINKS RULE: You have LIVE Google Search Grounding (googleSearch) enabled on EVERY chat message (both normal chat and Deep Research).',
    'NEVER say "I cannot fetch real-time internet links", "I cannot access real-time web links", "I cannot browse the internet", "I do not have live web access", or "I cannot provide direct links".',
    'Whenever a user asks for YouTube videos, recent news, tutorials, official websites, live updates, or internet links, ALWAYS actively search Google via your search tool, inspect the grounding search results, and display the real clickable https:// URLs clearly in your reply using Markdown links formatted as [Clear Title](https://full-url).',
    'Only include real https:// URLs grounded by search results; never fabricate or guess broken URLs.',
  ].join(' ');

  if (isLiveVoice) {
    return [
      baseInstruction,
      userName ? `You are warmly assisting ${userName}.` : '',
      multimodalCore,
      'Live Google Search is enabled for current facts and news. NEVER claim you lack real-time information. Speak naturally in 2–4 concise, clear sentences without markdown symbols, URLs, or code fences unless specifically asked for links.',
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
    googleSearchRule,
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

  const geminiKeys = getAllGeminiKeys();
  const clientGeminiKey = geminiKeys[0] || '';

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
          apiKeys: geminiKeys.length > 0 ? geminiKeys : undefined,
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
              detailedPrompt: sanitizeShortSafePrompt(data.enhancedPrompt.trim(), 48),
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

  // Step 1B: Direct Gemini REST fallback with key rotation
  for (const keyCandidate of geminiKeys) {
    try {
      const sysText = [
        'Classify the Latest User Message with Session State and Recent Conversation Context in ANY world language (100+ languages) as intent "image_edit", "image", "video", or "chat".',
        '- Choose "image_edit" when USER_ATTACHED_PHOTO=true and user wants to edit/transform/restore/make 3D figurine/change background/outfit, OR when PREVIOUS_GENERATED_IMAGE_EXISTS_IN_CHAT=true and user asks a follow-up visual refinement ("now make it night time").',
        '- Choose "image" when user asks to create a new picture/photo/naksha (including follow-ups after "Mujhe aik pic bna k do").',
        '- Choose "chat" for questions, vision Q&A on an attached photo, or coding help.',
        'If "image" or "image_edit", return a clean, safe, family-friendly English enhancedPrompt under 42 words preserving any exact quoted text/brand names in "..." verbatim, plus photography descriptors ("cinematic lighting, 8k resolution, sharp details, rich colors, professional composition") and a 3-6 word shortTitle.',
        'Return ONLY JSON: {"intent":"image_edit|image|video|chat","shortTitle":"...","enhancedPrompt":"..."}',
      ].join(' ');
      const resp = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': keyCandidate,
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
                    ? sanitizeShortSafePrompt(parsed.enhancedPrompt.trim(), 48)
                    : buildSafeArtisticPrompt(parsed.enhancedPrompt.trim()),
              },
            };
          }
          return { intent: resolvedIntent };
        }
      }
    } catch {
      // Try next key
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
  deepResearch?: boolean;
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
    deepResearch: params.deepResearch,
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

async function streamFromPollinationsText(params: {
  messages: OutgoingMessage[];
  language?: string;
  userName?: string;
  isLiveVoice?: boolean;
  deepResearch?: boolean;
  responseStyle?: ResponseStyleMode;
  customInstructions?: string;
  globalSystemPrompt?: string;
  signal?: AbortSignal;
  onChunk: (text: string) => void;
}): Promise<string> {
  const systemText = buildClientStudyTutorInstruction({
    language: params.language,
    userName: params.userName,
    isLiveVoice: params.isLiveVoice,
    deepResearch: params.deepResearch,
    responseStyle: params.responseStyle,
    customInstructions: params.customInstructions,
    globalSystemPrompt: params.globalSystemPrompt,
  });

  const openaiMessages = [
    { role: 'system' as const, content: systemText },
    ...params.messages.slice(-10).map((m) => ({
      role: m.role,
      content: formatMessageTextWithFile(m),
    })),
  ];

  const endpoints = [
    'https://text.pollinations.ai/openai',
    'https://gen.pollinations.ai/v1/chat/completions',
  ];

  for (const endpoint of endpoints) {
    try {
      const ctrl = new AbortController();
      const timer = window.setTimeout(() => ctrl.abort(), 32000);
      const onParentAbort = () => ctrl.abort();
      params.signal?.addEventListener('abort', onParentAbort, { once: true });
      try {
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'openai',
            messages: openaiMessages,
            seed: Math.floor(Math.random() * 100000),
          }),
          signal: ctrl.signal,
        });
        if (!resp.ok) continue;
        const json = (await resp.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = (json.choices?.[0]?.message?.content || '').trim();
        if (content) {
          params.onChunk(content);
          return content;
        }
      } finally {
        window.clearTimeout(timer);
        params.signal?.removeEventListener('abort', onParentAbort);
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError' && params.signal?.aborted) {
        throw err;
      }
    }
  }

  const graceful =
    'I am online and ready! Please send your question again so I can respond right away.';
  params.onChunk(graceful);
  return graceful;
}

async function streamFromGeminiDirect(params: {
  apiKey?: string;
  apiKeys?: string[];
  messages: OutgoingMessage[];
  language?: string;
  userName?: string;
  isLiveVoice?: boolean;
  deepResearch?: boolean;
  responseStyle?: ResponseStyleMode;
  customInstructions?: string;
  globalSystemPrompt?: string;
  chatModel?: string;
  signal?: AbortSignal;
  onChunk: (text: string) => void;
  onSources?: (sources: GroundingSource[]) => void;
}): Promise<string> {
  const keyPool = Array.from(
    new Set([...(params.apiKeys || []), ...(params.apiKey ? [params.apiKey] : [])].filter(Boolean))
  );
  if (keyPool.length === 0) {
    throw new Error('No Gemini keys available for direct request.');
  }

  const systemText = buildClientStudyTutorInstruction({
    language: params.language,
    userName: params.userName,
    isLiveVoice: params.isLiveVoice,
    deepResearch: params.deepResearch,
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

  const baseCandidates: Array<{ model: string; thinkingConfig?: Record<string, unknown> }> = [
    { model: 'gemini-2.5-flash', thinkingConfig: { thinkingBudget: 0 } },
    { model: 'gemini-2.0-flash-lite' },
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
  const collectedSources = new Map<string, string>();

  for (const activeKey of keyPool) {
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${candidate.model}:streamGenerateContent?alt=sse`;
      const makeRequest = (includeSearch: boolean) =>
        fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': activeKey,
          },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemText }] },
            contents,
            ...(includeSearch ? { tools: [{ google_search: {} }] } : {}),
            safetySettings: GEMINI_SAFETY_SETTINGS,
            ...(candidate.thinkingConfig
              ? { generationConfig: { thinkingConfig: candidate.thinkingConfig } }
              : {}),
          }),
          signal: params.signal,
        });

      let resp: Response;
      try {
        resp = await makeRequest(true);
        if (!resp.ok && (resp.status === 400 || resp.status === 429)) {
          resp = await makeRequest(false);
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') throw err;
        continue;
      }

      if (!resp.ok || !resp.body) {
        const rawErr = await resp.text().catch(() => '');
        lastErrorMsg = extractReadableApiError(rawErr, resp.status);
        continue;
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
                  groundingMetadata?: {
                    groundingChunks?: Array<{
                      web?: { uri?: string; title?: string };
                      retrievedContext?: { uri?: string; title?: string };
                    }>;
                  };
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
              const gChunks = parsed.candidates?.[0]?.groundingMetadata?.groundingChunks;
              if (Array.isArray(gChunks)) {
                for (const gc of gChunks) {
                  const uri = (gc?.web?.uri || gc?.retrievedContext?.uri || '').trim();
                  if (uri && /^https?:\/\//i.test(uri) && !collectedSources.has(uri)) {
                    const title = (gc?.web?.title || gc?.retrievedContext?.title || uri).trim();
                    collectedSources.set(uri, title);
                  }
                }
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

      try {
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
          continue;
        }

        if (collectedSources.size > 0) {
          const sources = Array.from(collectedSources.entries())
            .slice(0, 12)
            .map(([uri, title]) => ({ uri, title }));

          if (!/https?:\/\//i.test(accumulated) && !params.isLiveVoice) {
            const markdownLinks = sources
              .slice(0, 6)
              .map((s) => {
                const safeTitle = s.title.replace(/[\[\]]/g, '').trim() || s.uri;
                return `- [${safeTitle}](${s.uri})`;
              })
              .join('\n');
            const appendText = `\n\n**Verified Live Links:**\n${markdownLinks}`;
            accumulated += appendText;
            params.onChunk(appendText);
          }

          params.onSources?.(sources);
        }

        return accumulated;
      } catch (err) {
        if ((err as Error).name === 'AbortError') throw err;
        if (accumulated.trim()) return accumulated;
      }
    }
  }

  throw new Error(lastErrorMsg);
}

async function streamFromBackendEndpoint(params: {
  endpoint: '/api/chat' | '/api/chat-live-stream';
  apiKey?: string;
  apiKeys?: string[];
  messages: OutgoingMessage[];
  language?: string;
  userName?: string;
  deepResearch?: boolean;
  responseStyle?: ResponseStyleMode;
  customInstructions?: string;
  globalSystemPrompt?: string;
  chatModel?: string;
  signal?: AbortSignal;
  onChunk: (text: string) => void;
  onSources?: (sources: GroundingSource[]) => void;
}): Promise<{ ok: true; text: string } | { ok: false; shouldFallbackDirect: boolean; error: Error }> {
  try {
    const resp = await fetch(params.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: params.messages,
        language: params.language,
        userName: params.userName,
        apiKey: params.apiKey || params.apiKeys?.[0] || undefined,
        apiKeys: params.apiKeys && params.apiKeys.length > 0 ? params.apiKeys : undefined,
        deepResearch: Boolean(params.deepResearch),
        responseStyle: params.responseStyle,
        customInstructions: params.customInstructions,
        globalSystemPrompt: params.globalSystemPrompt,
        chatModel: params.chatModel,
      }),
      signal: params.signal,
    });

    const contentType = resp.headers.get('content-type') || '';

    if (!resp.ok) {
      if (resp.status === 404 || resp.status === 405 || !contentType.includes('application/json')) {
        return {
          ok: false,
          shouldFallbackDirect: true,
          error: new Error('Static deployment detected without backend route.'),
        };
      }
      const errData = (await resp.json().catch(() => ({}))) as { error?: string; code?: string };
      return {
        ok: false,
        shouldFallbackDirect: true,
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
            sources?: Array<{ uri?: string; title?: string }>;
            error?: string;
            code?: string;
          };
          if (parsed.type === 'chunk' && parsed.text) {
            accumulated += parsed.text;
            params.onChunk(parsed.text);
          } else if (parsed.type === 'sources' && Array.isArray(parsed.sources)) {
            const validSources: GroundingSource[] = parsed.sources
              .filter((s) => s?.uri && /^https?:\/\//i.test(s.uri.trim()))
              .map((s) => ({
                uri: s.uri!.trim(),
                title: (s.title || s.uri!).trim(),
              }));
            if (validSources.length > 0) {
              params.onSources?.(validSources);
            }
          } else if (parsed.type === 'error') {
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
        return { ok: false, shouldFallbackDirect: !accumulated, error: streamError };
      }
    }

    buffer += decoder.decode();
    if (buffer.trim()) {
      processBackendEvents(buffer.split(/\r?\n\r?\n/));
      if (streamError) {
        return { ok: false, shouldFallbackDirect: !accumulated, error: streamError };
      }
    }

    if (!accumulated.trim()) {
      return {
        ok: false,
        shouldFallbackDirect: true,
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
  apiKey?: string;
  apiKeys?: string[];
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

  const keyPool = Array.from(
    new Set([...(params.apiKeys || []), ...(params.apiKey ? [params.apiKey] : [])].filter(Boolean))
  );
  if (keyPool.length === 0) {
    throw new Error('No Gemini keys available for Vision.');
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
    { model: 'gemini-2.0-flash-lite' },
    { model: 'gemini-3.1-flash-lite', thinkingConfig: { thinkingLevel: 'MINIMAL' } },
    { model: 'gemini-4-hydrogen', thinkingConfig: { thinkingLevel: 'LOW' } },
  ];

  let lastError = 'Photo analysis service is momentarily busy. Please try again.';

  for (const activeKey of keyPool) {
    for (let i = 0; i < visionCandidates.length; i++) {
      const candidate = visionCandidates[i];
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${candidate.model}:generateContent?key=${encodeURIComponent(
        activeKey
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
      const timeoutId = window.setTimeout(() => reqCtrl.abort(), 14000);
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
      } catch (err) {
        if (params.signal?.aborted) throw err;
        continue;
      } finally {
        window.clearTimeout(timeoutId);
        params.signal?.removeEventListener('abort', onAbort);
      }

      const rawText = await resp.text();
      if (!resp.ok) {
        lastError = extractReadableApiError(rawText, resp.status);
        continue;
      }

      try {
        const data = JSON.parse(rawText) as {
          candidates?: Array<{
            finishReason?: string;
            content?: { parts?: Array<{ text?: string }> };
          }>;
          promptFeedback?: { blockReason?: string };
          error?: { message?: string };
        };

        if (data.error?.message || data.promptFeedback?.blockReason) {
          continue;
        }

        const replyText = (
          data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') || ''
        ).trim();

        if (replyText) {
          return replyText;
        }
      } catch {
        continue;
      }
    }
  }

  throw new Error(lastError);
}

export async function streamChatCompletion(params: {
  messages: OutgoingMessage[];
  language?: string;
  userName?: string;
  isLiveVoice?: boolean;
  deepResearch?: boolean;
  responseStyle?: ResponseStyleMode;
  customInstructions?: string;
  globalSystemPrompt?: string;
  chatModel?: string;
  hasBackendApi: boolean;
  hasServerGeminiKey: boolean;
  signal?: AbortSignal;
  onChunk: (text: string) => void;
  onSources?: (sources: GroundingSource[]) => void;
}): Promise<string> {
  const userPrefs = loadUserSettings();
  const ownerCfg = loadOwnerConfig();
  const responseStyle = params.responseStyle ?? userPrefs.responseStyle;
  const customInstructions = params.customInstructions ?? userPrefs.customInstructions;
  const globalSystemPrompt = params.globalSystemPrompt ?? ownerCfg.globalSystemPrompt;
  const chatModel = params.chatModel ?? ownerCfg.chatModel;

  const recentMessages = params.messages.slice(-10);
  const resolved = resolveActiveProvider(params.hasServerGeminiKey);
  const geminiKeys = getAllGeminiKeys();
  const groqKeys = getAllGroqKeys();
  const lastMsg = recentMessages[recentMessages.length - 1];
  const currentHasImage = Boolean(lastMsg?.attachment?.base64) && lastMsg?.attachment?.kind !== 'file';
  const hasAnyImageInHistory = recentMessages.some(
    (m) => Boolean(m.attachment?.base64) && m.attachment?.kind !== 'file'
  );

  // Vision attachment flow (rotates all Gemini keys, then tries /api/vision)
  if (currentHasImage && lastMsg?.attachment?.base64) {
    const promptText =
      lastMsg.content?.trim() || 'Describe and analyze this image in detail.';
    const rawB64 = lastMsg.attachment.base64;
    const base64Data = (rawB64.includes(',') ? rawB64.split(',')[1] : rawB64).trim();
    const mimeType = lastMsg.attachment.mimeType || 'image/jpeg';

    if (geminiKeys.length > 0) {
      try {
        const visionText = await analyzeImageViaGeminiRest({
          apiKeys: geminiKeys,
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
      } catch (err) {
        if ((err as Error).name === 'AbortError') throw err;
        // Fall through to /api/vision server backup
      }
    }

    if (params.hasBackendApi || params.hasServerGeminiKey) {
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
          apiKeys: geminiKeys.length > 0 ? geminiKeys : undefined,
        }),
        signal: params.signal,
      });

      const contentType = visionResp.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const visionJson = (await visionResp.json()) as { text?: string; error?: string };
        const resultText = (visionJson.text || '').trim();
        if (visionResp.ok && resultText) {
          params.onChunk(resultText);
          return resultText;
        }
      }
    }

    // Graceful fallback rather than crashing with quota error
    return streamFromPollinationsText({
      messages: [
        ...recentMessages.slice(0, -1),
        {
          role: 'user',
          content: `The user shared an image named "${lastMsg.attachment.name || 'photo'}" with message: ${promptText}. Please respond helpfully.`,
        },
      ],
      language: params.language,
      userName: params.userName,
      isLiveVoice: params.isLiveVoice,
      deepResearch: params.deepResearch,
      responseStyle,
      customInstructions,
      globalSystemPrompt,
      signal: params.signal,
      onChunk: params.onChunk,
    });
  }

  // Follow-up question in a conversation with earlier image
  if (hasAnyImageInHistory) {
    if (params.hasBackendApi || params.hasServerGeminiKey) {
      const backendRes = await streamFromBackendEndpoint({
        endpoint: params.isLiveVoice ? '/api/chat-live-stream' : '/api/chat',
        apiKey: geminiKeys[0] || undefined,
        apiKeys: geminiKeys,
        messages: recentMessages,
        language: params.language,
        userName: params.userName,
        deepResearch: params.deepResearch,
        responseStyle,
        customInstructions,
        globalSystemPrompt,
        chatModel,
        signal: params.signal,
        onChunk: params.onChunk,
        onSources: params.onSources,
      });
      if (backendRes.ok) return backendRes.text;
    }

    if (geminiKeys.length > 0) {
      try {
        return await streamFromGeminiDirect({
          apiKeys: geminiKeys,
          messages: recentMessages,
          language: params.language,
          userName: params.userName,
          isLiveVoice: params.isLiveVoice,
          deepResearch: params.deepResearch,
          responseStyle,
          customInstructions,
          globalSystemPrompt,
          chatModel,
          signal: params.signal,
          onChunk: params.onChunk,
          onSources: params.onSources,
        });
      } catch (err) {
        if ((err as Error).name === 'AbortError') throw err;
      }
    }

    return streamFromPollinationsText({
      messages: recentMessages,
      language: params.language,
      userName: params.userName,
      isLiveVoice: params.isLiveVoice,
      deepResearch: params.deepResearch,
      responseStyle,
      customInstructions,
      globalSystemPrompt,
      signal: params.signal,
      onChunk: params.onChunk,
    });
  }

  // Try configured Groq keys first if Groq is primary
  if (resolved.provider === 'groq' && groqKeys.length > 0) {
    for (const gKey of groqKeys) {
      try {
        return await streamFromGroq({
          apiKey: gKey,
          messages: params.messages,
          language: params.language,
          userName: params.userName,
          isLiveVoice: params.isLiveVoice,
          deepResearch: params.deepResearch,
          responseStyle,
          customInstructions,
          globalSystemPrompt,
          chatModel,
          signal: params.signal,
          onChunk: params.onChunk,
        });
      } catch (err) {
        if ((err as Error).name === 'AbortError') throw err;
        // Rotate to next Groq key or Gemini / Pollinations fallback
      }
    }
  }

  // Try Express backend (handles multi-key rotation, Gemini 2.5 Flash -> 2.0 Flash-Lite -> Google Search + Pollinations server fallback)
  if (params.hasBackendApi || params.hasServerGeminiKey || resolved.source === 'server') {
    const backendRes = await streamFromBackendEndpoint({
      endpoint: params.isLiveVoice ? '/api/chat-live-stream' : '/api/chat',
      apiKey: geminiKeys[0] || undefined,
      apiKeys: geminiKeys,
      messages: params.messages,
      language: params.language,
      userName: params.userName,
      deepResearch: params.deepResearch,
      responseStyle,
      customInstructions,
      globalSystemPrompt,
      chatModel,
      signal: params.signal,
      onChunk: params.onChunk,
      onSources: params.onSources,
    });

    if (backendRes.ok) {
      return backendRes.text;
    }
  }

  // Try direct Gemini REST across ALL configured keys & models (static deploys or backend unavailable)
  if (geminiKeys.length > 0) {
    try {
      return await streamFromGeminiDirect({
        apiKeys: geminiKeys,
        messages: params.messages,
        language: params.language,
        userName: params.userName,
        isLiveVoice: params.isLiveVoice,
        deepResearch: params.deepResearch,
        responseStyle,
        customInstructions,
        globalSystemPrompt,
        chatModel,
        signal: params.signal,
        onChunk: params.onChunk,
        onSources: params.onSources,
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err;
    }
  }

  // Final Free Unlimited Text Fallback: Pollinations AI (100% keyless, never fails with 429)
  return streamFromPollinationsText({
    messages: params.messages,
    language: params.language,
    userName: params.userName,
    isLiveVoice: params.isLiveVoice,
    deepResearch: params.deepResearch,
    responseStyle,
    customInstructions,
    globalSystemPrompt,
    signal: params.signal,
    onChunk: params.onChunk,
  });
}

async function runQuickTextCompletion(params: {
  systemPrompt: string;
  userPrompt: string;
  hasBackendApi: boolean;
  hasServerGeminiKey: boolean;
  maxTokens?: number;
}): Promise<string | null> {
  const groqKeys = getAllGroqKeys();
  const geminiKeys = getAllGeminiKeys();

  try {
    // 1. Try Groq keys if present
    for (const gKey of groqKeys) {
      try {
        const { models } = await getActiveGroqChatModels(gKey);
        for (let i = 0; i < Math.min(2, models.length); i++) {
          const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${gKey}`,
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
      } catch {
        // Rotate next key
      }
    }

    // 2. Try direct Gemini keys (gemini-2.5-flash -> gemini-2.0-flash-lite)
    for (const gKey of geminiKeys) {
      for (const mName of ['gemini-2.5-flash', 'gemini-2.0-flash-lite'] as const) {
        try {
          const resp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${mName}:generateContent`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': gKey,
              },
              body: JSON.stringify({
                system_instruction: { parts: [{ text: params.systemPrompt }] },
                contents: [{ role: 'user', parts: [{ text: params.userPrompt }] }],
                safetySettings: GEMINI_SAFETY_SETTINGS,
                ...(mName === 'gemini-2.5-flash'
                  ? { generationConfig: { thinkingConfig: { thinkingBudget: 0 } } }
                  : {}),
              }),
            }
          );
          if (resp.ok) {
            const data = (await resp.json()) as {
              candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
            };
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            if (text) return text;
          }
        } catch {
          // Next model/key
        }
      }
    }

    // 3. Try backend SSE (which also handles server Gemini keys + Pollinations fallback)
    if (params.hasBackendApi || params.hasServerGeminiKey) {
      let collected = '';
      const backendRes = await streamFromBackendEndpoint({
        endpoint: '/api/chat',
        apiKeys: geminiKeys,
        messages: [
          {
            role: 'user',
            content: `${params.systemPrompt}\n\nRequest: ${params.userPrompt}`,
          },
        ],
        onChunk: (c) => {
          collected += c;
        },
      });
      if (backendRes.ok && collected.trim()) return collected.trim();
    }

    // 4. Direct Free Pollinations Text fallback
    let polyCollected = '';
    const polyResp = await fetch('https://text.pollinations.ai/openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai',
        messages: [
          { role: 'system', content: params.systemPrompt },
          { role: 'user', content: params.userPrompt },
        ],
      }),
    });
    if (polyResp.ok) {
      const json = (await polyResp.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      polyCollected = (json.choices?.[0]?.message?.content || '').trim();
      if (polyCollected) return polyCollected;
    }
  } catch {
    // Graceful fallback if quick helper fails
  }
  return null;
}

const RISKY_WORD_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\b(nude|naked|nsfw|sexy|bikini|lingerie|underwear|erotic|explicit|porn)\b/gi, 'modest stylish modern attire'],
  [/\b(blood|gore|kill|murder|dead body|corpse|violent|weapon|gun|knife|swordfight)\b/gi, 'dramatic artistic adventure'],
  [/\b(drug|weed|cocaine|cigarette|alcohol|beer|wine)\b/gi, 'refreshing herbal tea cup'],
];

const BARE_HUMAN_SUBJECT_RX =
  /^(a\s+|an\s+|the\s+)?(human|person|people|man|men|woman|women|boy|girl|kid|child|portrait|face|human being|insaan|aadmi|larka|larki)$/i;

export function getImageDimensionsForAspectRatio(aspectRatio: ImageAspectRatio): {
  width: number;
  height: number;
} {
  switch (aspectRatio) {
    case '16:9':
      return { width: 1280, height: 720 };
    case '9:16':
      return { width: 720, height: 1280 };
    case '4:3':
      return { width: 1024, height: 768 };
    case '1:1':
    default:
      return { width: 1024, height: 1024 };
  }
}

function isSimpleStylePrompt(rawInput: string): boolean {
  return /\b(simple|minimal|minimalist|flat\s*design|flat\s*style|plain|basic|clean\s*icon|line\s*art|uncluttered|sada|simple\s*style|no\s*extra\s*details)\b/i.test(
    rawInput || ''
  );
}

function extractQuotedTextSegments(input: string): string[] {
  const matches = input.match(/"([^"]{1,64})"/g);
  if (!matches) return [];
  return Array.from(new Set(matches.map((m) => m.trim())));
}

export function sanitizeShortSafePrompt(rawInput: string, maxWords = 56): string {
  const quotedSegments = extractQuotedTextSegments(rawInput || '');
  let text = (rawInput || '')
    .replace(/[`'\n\r]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  for (const [rx, safeReplacement] of RISKY_WORD_REPLACEMENTS) {
    text = text.replace(rx, safeReplacement);
  }

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length > maxWords) {
    text = words.slice(0, maxWords).join(' ').replace(/[,.;:-]+$/, '').trim();
    for (const q of quotedSegments) {
      if (!text.includes(q)) {
        text = `${text}, exact typography text ${q}`;
      }
    }
  }
  return (
    text ||
    'photorealistic serene scenery, cinematic lighting, 8k resolution, sharp details, rich colors, professional composition'
  );
}

export function buildSafeArtisticPrompt(rawInput: string): string {
  const wantsSimpleStyle = isSimpleStylePrompt(rawInput);
  const quotedSegments = extractQuotedTextSegments(rawInput || '');

  // Protect quoted text/brand names verbatim before command-word stripping
  let working = rawInput || '';
  quotedSegments.forEach((seg, idx) => {
    working = working.split(seg).join(` __QUOTE_${idx}__ `);
  });

  let text = working
    .replace(
      /\b(create|generate|make|draw|paint|sketch|render|show|please|kindly|me|mujy|mujhe|a|an|ek|aik|pic|pics|picture|tasveer|tasweer|tasvir|taswir|photo|foto|image|img|banao|bnao|bna\s*do|bna\s*dy|bna\s*de|bana\s*do|bana\s*dy|bana\s*de|banado|bnado|dikhao|chahiye|khincho|kar\s*do|kr\s*do)\b/gi,
      ' '
    )
    .replace(/\b(naksha|naqsha)\b/gi, 'modern architectural floor plan design')
    .replace(/\bof\b/gi, ' ')
    .replace(/[^\p{L}\p{N}\s,._-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  quotedSegments.forEach((seg, idx) => {
    text = text.replace(new RegExp(`__QUOTE_${idx}__`, 'g'), seg);
  });

  for (const [rx, safeReplacement] of RISKY_WORD_REPLACEMENTS) {
    text = text.replace(rx, safeReplacement);
  }

  if (!text || BARE_HUMAN_SUBJECT_RX.test(text)) {
    const noun = text.toLowerCase();
    if (noun.includes('woman') || noun.includes('girl') || noun.includes('larki')) {
      return 'Photorealistic studio portrait of a friendly smiling woman, cinematic lighting, 8k resolution, sharp details, rich colors, professional composition';
    }
    if (noun.includes('man') || noun.includes('boy') || noun.includes('larka')) {
      return 'Photorealistic studio portrait of a friendly smiling young man, cinematic lighting, 8k resolution, sharp details, rich colors, professional composition';
    }
    return 'Photorealistic studio portrait of a friendly smiling person, cinematic lighting, 8k resolution, sharp details, rich colors, professional composition';
  }

  const wordCount = text.split(/\s+/).length;
  if (wantsSimpleStyle) {
    return sanitizeShortSafePrompt(
      wordCount >= 10 ? text : `${text}, clean minimalist composition, crisp sharp edges`,
      56
    );
  }

  if (wordCount >= 18) {
    return sanitizeShortSafePrompt(text, 56);
  }

  const hasHumanNoun = /\b(human|person|people|man|woman|boy|girl|child|student|teacher|doctor|astronaut|face|portrait)\b/i.test(
    text
  );
  if (hasHumanNoun && wordCount <= 6) {
    return sanitizeShortSafePrompt(
      `Photorealistic studio portrait of a friendly ${text}, cinematic lighting, 8k resolution, sharp details, rich colors, professional composition`,
      56
    );
  }

  return sanitizeShortSafePrompt(
    `${text}, cinematic lighting, 8k resolution, sharp textures, depth, rich colors, professional composition`,
    56
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
  const quotedSegments = extractQuotedTextSegments(cleaned);

  const ensureQuotedPreserved = (candidatePrompt: string): string => {
    let out = candidatePrompt;
    for (const q of quotedSegments) {
      if (!out.includes(q)) {
        out = `${out}, crisp typography text ${q}`;
      }
    }
    return sanitizeShortSafePrompt(out, 56);
  };

  // 1. Prefer Gemini API Step-1 Prompt Enhancer via backend endpoint
  if (params.hasBackendApi || params.hasServerGeminiKey) {
    try {
      const geminiKeys = getAllGeminiKeys();
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 7500);
      try {
        const resp = await fetch('/api/detect-image-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: ctrl.signal,
          body: JSON.stringify({
            text: cleaned,
            forceImage: true,
            apiKey: geminiKeys[0] || undefined,
            apiKeys: geminiKeys.length > 0 ? geminiKeys : undefined,
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
              detailedPrompt: ensureQuotedPreserved(data.enhancedPrompt.trim()),
            };
          }
        }
      } finally {
        clearTimeout(timer);
      }
    } catch {
      // Fall through to generic text enhancer below
    }
  }

  const wantsSimpleStyle = isSimpleStylePrompt(cleaned);
  const translated = await runQuickTextCompletion({
    systemPrompt: [
      'You are an expert, family-friendly AI visual prompt engineer.',
      wantsSimpleStyle
        ? 'The user asked for a simple/minimalist style. Translate from ANY world language into a clean, minimal, uncluttered English prompt (10-22 words) with crisp clean edges without noisy cinematic clutter.'
        : 'Automatically expand and enhance ANY user request from ANY world language into a rich, detailed, family-friendly English prompt (24-44 words) adding cinematic lighting, 8k resolution, sharp textures, depth, rich colors, and professional composition.',
      'CRITICAL: If the user included quoted text or a brand name in double quotes (e.g. "Roosters Studio"), preserve the exact quoted text verbatim in detailedPrompt for crisp logo/poster rendering.',
      'Strip command words like "pic bna do", "tasveer banao", "naksha banao", "generate image", "draw me". Never include unsafe, explicit, or violent terms.',
      'Return ONLY JSON: {"title":"short 3-6 word title","detailedPrompt":"clean English prompt"}',
    ].join(' '),
    userPrompt: cleaned,
    hasBackendApi: params.hasBackendApi,
    hasServerGeminiKey: params.hasServerGeminiKey,
    maxTokens: 240,
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
            detailedPrompt: ensureQuotedPreserved(parsed.detailedPrompt.trim()),
          };
        }
      }
    } catch {
      // Fall back to deterministic safe prompt enhancer below
    }
  }

  const safePrompt = ensureQuotedPreserved(buildSafeArtisticPrompt(cleaned));
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

function resolveOfficialNanoModelId(
  preferred?: string
): 'gemini-2.5-flash-image' | 'gemini-3.1-flash-image-preview' {
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

function randomClientImageSeed(): number {
  return Math.floor(Math.random() * 1_000_000_000) + 1;
}

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchDirectImageAsDataUrl(
  targetUrl: string,
  timeoutMs = 12000
): Promise<{ ok: true; dataUrl: string } | { ok: false; status?: number; networkError?: boolean }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(targetUrl, { signal: ctrl.signal });
    if (!r.ok) {
      return { ok: false, status: r.status };
    }
    const ct = (r.headers.get('content-type') || '').toLowerCase();
    if (!ct.startsWith('image/')) {
      return { ok: false, status: r.status };
    }
    const blob = await r.blob();
    if (blob.size < 4500) {
      return { ok: false };
    }
    const dataUrl = await blobToSharpDataUrl(blob);
    if (!dataUrl) {
      return { ok: false };
    }
    return { ok: true, dataUrl };
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError';
    return { ok: false, networkError: !isAbort };
  } finally {
    clearTimeout(timer);
  }
}

async function preloadImageViaTag(
  targetUrl: string,
  timeoutMs = 12000
): Promise<{ ok: true; imageUrl: string } | { ok: false }> {
  if (typeof Image === 'undefined') return { ok: false };
  return new Promise((resolve) => {
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        img.src = '';
        resolve({ ok: false });
      }
    }, timeoutMs);

    img.onload = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (img.naturalWidth >= 64 && img.naturalHeight >= 64) {
        resolve({ ok: true, imageUrl: targetUrl });
      } else {
        resolve({ ok: false });
      }
    };

    img.onerror = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false });
    };

    img.src = targetUrl;
  });
}

async function tryClientGeminiImageDirect(params: {
  geminiKeys: string[];
  prompt: string;
  aspectRatio: ImageAspectRatio;
  mode: 'generate' | 'edit';
  sourceImageBase64?: string;
  sourceMimeType?: string;
  preferredModel?: string;
  dims: { width: number; height: number };
}): Promise<{
  ok: true;
  imageUrl: string;
  provider: 'nano-banana' | 'imagen';
  modelUsed: string;
  assistantText?: string;
} | null> {
  if (params.geminiKeys.length === 0) return null;
  const officialModelId = resolveOfficialNanoModelId(params.preferredModel);
  const ratioPrompt =
    params.mode === 'edit'
      ? params.prompt
      : `${params.prompt} (${params.aspectRatio} aspect ratio composition)`;

  for (const activeKey of params.geminiKeys) {
    // 1. Gemini Native Image (supports text rendering & Image-to-Image editing)
    for (const modelName of [officialModelId, 'gemini-2.5-flash-image']) {
      try {
        const parts: Array<Record<string, unknown>> = [];
        if (params.mode === 'edit' && params.sourceImageBase64) {
          parts.push({
            inline_data: {
              mime_type: params.sourceMimeType || 'image/png',
              data: params.sourceImageBase64,
            },
          });
        }
        parts.push({ text: ratioPrompt });

        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': activeKey,
            },
            body: JSON.stringify({
              contents: [{ role: 'user', parts }],
              safetySettings: GEMINI_SAFETY_SETTINGS,
              generationConfig: {
                responseModalities: ['TEXT', 'IMAGE'],
              },
            }),
          }
        );
        if (resp.ok) {
          const json = (await resp.json()) as {
            candidates?: Array<{
              content?: {
                parts?: Array<{
                  text?: string;
                  inlineData?: { mimeType?: string; data?: string };
                  inline_data?: { mime_type?: string; data?: string };
                }>;
              };
            }>;
          };
          const outParts = json.candidates?.[0]?.content?.parts || [];
          const assistantText = outParts
            .map((p) => p.text || '')
            .join('\n')
            .trim();
          const imgPart = outParts.find((p) => p.inlineData?.data || p.inline_data?.data);
          const b64 = imgPart?.inlineData?.data || imgPart?.inline_data?.data;
          const mime = imgPart?.inlineData?.mimeType || imgPart?.inline_data?.mime_type || 'image/png';
          if (b64) {
            return {
              ok: true,
              imageUrl: `data:${mime};base64,${b64}`,
              provider: 'nano-banana',
              modelUsed: modelName,
              assistantText: assistantText || undefined,
            };
          }
        }
      } catch {
        // Silently continue to next model/key
      }
    }

    // 2. Imagen 3 Direct (new image generation)
    if (params.mode !== 'edit') {
      try {
        const resp = await fetch(
          'https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': activeKey,
            },
            body: JSON.stringify({
              instances: [{ prompt: params.prompt }],
              parameters: { sampleCount: 1, aspectRatio: params.aspectRatio },
            }),
          }
        );
        if (resp.ok) {
          const json = (await resp.json()) as {
            predictions?: Array<{ bytesBase64Encoded?: string; mimeType?: string }>;
          };
          const b64 = json.predictions?.[0]?.bytesBase64Encoded;
          if (b64) {
            return {
              ok: true,
              imageUrl: `data:${json.predictions?.[0]?.mimeType || 'image/png'};base64,${b64}`,
              provider: 'imagen',
              modelUsed: 'imagen-3.0-generate-002',
            };
          }
        }
      } catch {
        // Silently continue
      }
    }
  }

  return null;
}

async function tryClientAiHordeFallback(
  prompt: string,
  aspectRatio: ImageAspectRatio,
  timeoutMs = 20000
): Promise<{ ok: true; dataUrl: string; w: number; h: number } | { ok: false }> {
  const dims =
    aspectRatio === '16:9'
      ? { w: 768, h: 448 }
      : aspectRatio === '9:16'
        ? { w: 448, h: 768 }
        : aspectRatio === '4:3'
          ? { w: 640, h: 512 }
          : { w: 512, h: 512 };
  const deadline = Date.now() + timeoutMs;
  try {
    const submitCtrl = new AbortController();
    const submitTimer = setTimeout(() => submitCtrl.abort(), 7000);
    let jobId = '';
    try {
      const submitResp = await fetch('https://aihorde.net/api/v2/generate/async', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: '0000000000',
          'Client-Agent': 'RoostersAI:2.0:sandsoft',
        },
        body: JSON.stringify({
          prompt,
          params: { width: dims.w, height: dims.h, steps: 14, n: 1 },
          r2: true,
        }),
        signal: submitCtrl.signal,
      });
      if (!submitResp.ok) return { ok: false };
      const submitJson = (await submitResp.json()) as { id?: string };
      jobId = submitJson.id || '';
    } finally {
      clearTimeout(submitTimer);
    }

    if (!jobId) return { ok: false };

    while (Date.now() < deadline) {
      await waitMs(1700);
      const pollCtrl = new AbortController();
      const pollTimer = setTimeout(() => pollCtrl.abort(), 5000);
      try {
        const statusResp = await fetch(
          `https://aihorde.net/api/v2/generate/status/${encodeURIComponent(jobId)}`,
          {
            headers: { 'Client-Agent': 'RoostersAI:2.0:sandsoft' },
            signal: pollCtrl.signal,
          }
        );
        if (!statusResp.ok) continue;
        const statusJson = (await statusResp.json()) as {
          done?: boolean;
          faulted?: boolean;
          generations?: Array<{ img?: string }>;
        };
        if (statusJson.faulted) return { ok: false };
        const imgUrl = statusJson.generations?.[0]?.img;
        if (statusJson.done && imgUrl && /^https:\/\//i.test(imgUrl)) {
          const downloaded = await fetchDirectImageAsDataUrl(imgUrl, 10000);
          if (downloaded.ok) {
            return { ok: true, dataUrl: downloaded.dataUrl, w: dims.w, h: dims.h };
          }
          return { ok: false };
        }
      } catch {
        // Keep polling until deadline
      } finally {
        clearTimeout(pollTimer);
      }
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

async function tryNanoBananaApi(params: {
  prompt: string;
  sourceImageBase64?: string;
  sourceMimeType?: string;
  aspectRatio: ImageAspectRatio;
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
      provider: 'pollinations' | 'airforce' | 'flux-hd' | 'ai-horde' | 'imagen' | 'nano-banana';
      modelUsed: string;
      title: string;
      detailedPrompt: string;
      assistantText?: string;
      width: number;
      height: number;
    }
  | { ok: false; reason: string }
> {
  const geminiKeys = getAllGeminiKeys();
  const officialModelId = resolveOfficialNanoModelId(
    params.preferredModel || loadOwnerConfig().imageModel
  );

  const cleanShortPrompt = sanitizeShortSafePrompt(params.prompt, 56);
  const dims = getImageDimensionsForAspectRatio(params.aspectRatio);
  const w = dims.width;
  const h = dims.height;
  const encodedPrompt = encodeURIComponent(cleanShortPrompt);
  const pollinationsModels: Array<'flux' | 'flux-realism' | 'flux-3d' | 'turbo'> = [
    'flux',
    'flux-realism',
    'flux-3d',
    'turbo',
  ];

  const MODEL_PRELOAD_TIMEOUT_MS = 12000;
  let backendEndpointMissing = false;

  const callBackendNanoBanana = async (geminiPrimaryOnly: boolean) => {
    if (backendEndpointMissing) return null;
    const apiCtrl = new AbortController();
    const apiTimer = setTimeout(() => apiCtrl.abort(), geminiPrimaryOnly ? 22000 : 55000);
    try {
      const resp = await fetch('/api/nano-banana', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: apiCtrl.signal,
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
          geminiPrimaryOnly,
          apiKey: geminiKeys[0] || undefined,
          apiKeys: geminiKeys.length > 0 ? geminiKeys : undefined,
        }),
      });
      if (resp.status === 404 || resp.status === 405) {
        backendEndpointMissing = true;
        return null;
      }
      const contentType = resp.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) return null;
      const data = (await resp.json()) as {
        imageUrl?: string;
        fallbackToClient?: boolean;
        provider?: 'pollinations' | 'airforce' | 'flux-hd' | 'ai-horde' | 'imagen' | 'nano-banana';
        modelUsed?: string;
        title?: string;
        detailedPrompt?: string;
        assistantText?: string;
        width?: number;
        height?: number;
      };
      if (resp.ok && data.imageUrl) {
        return {
          ok: true as const,
          imageUrl: data.imageUrl,
          provider:
            data.provider === 'imagen' ||
            data.provider === 'nano-banana' ||
            data.provider === 'flux-hd' ||
            data.provider === 'ai-horde' ||
            data.provider === 'airforce' ||
            data.provider === 'pollinations'
              ? data.provider
              : ('nano-banana' as const),
          modelUsed: data.modelUsed || officialModelId,
          title: data.title || params.prompt.slice(0, 52),
          detailedPrompt: data.detailedPrompt || params.prompt,
          assistantText: data.assistantText,
          width: data.width || w,
          height: data.height || h,
        };
      }
      return null;
    } catch {
      return null;
    } finally {
      clearTimeout(apiTimer);
    }
  };

  const runBrowserPollinationsFailover = async (roundLabel = '') => {
    for (let idx = 0; idx < pollinationsModels.length; idx++) {
      const modelName = pollinationsModels[idx];
      const prettyModel =
        modelName === 'flux'
          ? 'FLUX'
          : modelName === 'flux-realism'
            ? 'FLUX-Realism'
            : modelName === 'flux-3d'
              ? 'FLUX-3D'
              : 'Turbo';
      params.onStatus?.(
        idx === 0
          ? `Generating ${w}×${h} HD image (${prettyModel})${roundLabel}...`
          : `Trying next free HD model (${prettyModel})...`
      );

      const polyUrl = `https://pollinations.ai/p/${encodedPrompt}?width=${w}&height=${h}&model=${modelName}&nologo=true&enhance=true&seed=${randomClientImageSeed()}`;
      const polyRes = await fetchDirectImageAsDataUrl(polyUrl, MODEL_PRELOAD_TIMEOUT_MS);
      if (polyRes.ok) {
        return {
          ok: true as const,
          imageUrl: polyRes.dataUrl,
          provider: 'pollinations' as const,
          modelUsed: modelName,
          title: cleanShortPrompt.slice(0, 52),
          detailedPrompt: cleanShortPrompt,
          width: w,
          height: h,
        };
      }

      if (polyRes.networkError) {
        const tagPreload = await preloadImageViaTag(polyUrl, MODEL_PRELOAD_TIMEOUT_MS);
        if (tagPreload.ok) {
          return {
            ok: true as const,
            imageUrl: tagPreload.imageUrl,
            provider: 'pollinations' as const,
            modelUsed: modelName,
            title: cleanShortPrompt.slice(0, 52),
            detailedPrompt: cleanShortPrompt,
            width: w,
            height: h,
          };
        }
      }
    }
    return null;
  };

  // STEP 1 (Primary): Google Gemini Native Image Engine (creation + text rendering + Image-to-Image editing)
  if (params.hasServerGeminiKey || geminiKeys.length > 0 || params.mode === 'edit') {
    params.onStatus?.(
      params.mode === 'edit'
        ? 'Editing your photo with Gemini Native HD...'
        : 'Generating HD image with Gemini Native Studio...'
    );

    if (params.hasBackendApi || params.hasServerGeminiKey) {
      const geminiBackendResult = await callBackendNanoBanana(params.mode !== 'edit');
      if (geminiBackendResult) {
        return geminiBackendResult;
      }
    }

    if (geminiKeys.length > 0) {
      const directGeminiResult = await tryClientGeminiImageDirect({
        geminiKeys,
        prompt: params.prompt,
        aspectRatio: params.aspectRatio,
        mode: params.mode,
        sourceImageBase64: params.sourceImageBase64,
        sourceMimeType: params.sourceMimeType,
        preferredModel: officialModelId,
        dims,
      });
      if (directGeminiResult) {
        return {
          ok: true,
          imageUrl: directGeminiResult.imageUrl,
          provider: directGeminiResult.provider,
          modelUsed: directGeminiResult.modelUsed,
          title: cleanShortPrompt.slice(0, 52),
          detailedPrompt: cleanShortPrompt,
          assistantText: directGeminiResult.assistantText,
          width: w,
          height: h,
        };
      }
    }
  }

  // STEP 2 (Secondary - Free Unlimited Auto-Fallback): Silently cycle Pollinations flux -> flux-realism -> flux-3d -> turbo
  if (params.mode !== 'edit') {
    const directPolyResult = await runBrowserPollinationsFailover();
    if (directPolyResult) {
      return directPolyResult;
    }
  }

  // STEP 3 (Backup Cluster): Full server fallback (FLUX.1-schnell Gradio Space + Server AI Horde) + Browser AI Horde
  for (let attempt = 1; attempt <= 2; attempt++) {
    params.onStatus?.(
      attempt === 1 ? 'Rendering via free HD backup engine...' : 'Retrying free HD backup engine...'
    );

    if (!backendEndpointMissing) {
      const fullBackendResult = await callBackendNanoBanana(false);
      if (fullBackendResult) {
        return fullBackendResult;
      }
    }

    const hordeRes = await tryClientAiHordeFallback(cleanShortPrompt, params.aspectRatio, 20000);
    if (hordeRes.ok) {
      return {
        ok: true,
        imageUrl: hordeRes.dataUrl,
        provider: 'ai-horde',
        modelUsed: 'stable-horde-xl',
        title: cleanShortPrompt.slice(0, 52),
        detailedPrompt: cleanShortPrompt,
        width: hordeRes.w,
        height: hordeRes.h,
      };
    }

    if (attempt === 1) {
      await waitMs(800);
      const retryPolyResult = await runBrowserPollinationsFailover(' (Retry)');
      if (retryPolyResult) {
        return retryPolyResult;
      }
    }
  }

  return {
    ok: false,
    reason: 'Image studio is refreshing connections — please tap Generate again.',
  };
}

export async function generateArtworkUnified(params: {
  prompt: string;
  aspectRatio: ImageAspectRatio;
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
  provider: 'pollinations' | 'airforce' | 'flux-hd' | 'ai-horde' | 'imagen' | 'nano-banana';
  modelUsed: string;
  aspectRatio: ImageAspectRatio;
  width: number;
  height: number;
}> {
  const configuredModel = resolveOfficialNanoModelId(loadOwnerConfig().imageModel);

  params.onStatus?.('Preparing crisp HD visual prompt...');
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
  aspectRatio?: ImageAspectRatio;
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
  provider: 'pollinations' | 'airforce' | 'flux-hd' | 'ai-horde' | 'imagen' | 'nano-banana';
  modelUsed: string;
  isEdited: true;
  aspectRatio: ImageAspectRatio;
  width: number;
  height: number;
}> {
  const aspectRatio: ImageAspectRatio = params.aspectRatio || '1:1';
  const configuredModel = resolveOfficialNanoModelId(loadOwnerConfig().imageModel);

  params.onStatus?.('Preparing source image for HD photo editing...');
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
  aspectRatio?: VideoAspectRatio;
  language?: string;
  hasBackendApi: boolean;
  hasServerGeminiKey: boolean;
  onStatus?: (msg: string) => void;
}): Promise<GeneratedVideo> {
  const styleLabel = params.style?.trim() || 'Cinematic Realism';
  const cleanUserPrompt = params.prompt.trim();
  const aspectRatio: VideoAspectRatio = params.aspectRatio || '16:9';
  const geminiKeys = getAllGeminiKeys();

  // Step 1 (Primary): Google Veo (veo-2.0-generate-001) when supported by active API key
  if (params.hasBackendApi || params.hasServerGeminiKey || geminiKeys.length > 0) {
    params.onStatus?.('Connecting to Google Veo 2 video engine...');
    try {
      const veoCtrl = new AbortController();
      const veoTimer = setTimeout(() => veoCtrl.abort(), 38000);
      try {
        const resp = await fetch('/api/veo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: veoCtrl.signal,
          body: JSON.stringify({
            prompt: cleanUserPrompt,
            style: styleLabel,
            aspectRatio,
            apiKey: geminiKeys[0] || undefined,
            apiKeys: geminiKeys.length > 0 ? geminiKeys : undefined,
          }),
        });
        if (resp.ok && (resp.headers.get('content-type') || '').includes('application/json')) {
          const data = (await resp.json()) as {
            ok?: boolean;
            videoUrl?: string;
            modelUsed?: string;
          };
          if (data.ok && data.videoUrl) {
            return {
              title: cleanUserPrompt.slice(0, 56) || 'Veo AI Video',
              prompt: cleanUserPrompt,
              narration: '',
              mood: 'cinematic',
              style: styleLabel,
              heroImageUrl: '',
              veoVideoUrl: data.videoUrl,
              provider: 'veo',
              scenes: [
                {
                  caption: cleanUserPrompt.slice(0, 48),
                  visualPrompt: cleanUserPrompt,
                  imageUrl: '',
                },
              ],
              aspectRatio,
              createdAt: Date.now(),
            };
          }
        }
      } finally {
        clearTimeout(veoTimer);
      }
    } catch {
      // Silently switch to AI Motion Video Engine fallback
    }
  }

  // Step 2 (Free Unlimited Auto-Fallback): AI Motion Video Engine (3-4 scene visual script + HD FLUX frames)
  params.onStatus?.('Directing 4-scene AI motion script...');

  const langHint =
    params.language && params.language !== 'Auto-Detect'
      ? `Write the short narration in ${params.language}.`
      : 'Write the short narration in English (or match the prompt language naturally).';

  const storyboardRaw = await runQuickTextCompletion({
    systemPrompt: [
      'You are an AI Film Director.',
      `Given any topic or video request, create a family-friendly 4-scene visual story in "${styleLabel}" style.`,
      langHint,
      'Return ONLY valid JSON: {"title":"...","mood":"cinematic|calm|epic|study","narration":"2-3 warm concise sentences","scenes":[{"caption":"Scene 1 title","visualPrompt":"safe vivid English scene prompt under 28 words"},{"caption":"Scene 2 title","visualPrompt":"safe vivid English scene prompt under 28 words"},{"caption":"Scene 3 title","visualPrompt":"safe vivid English scene prompt under 28 words"},{"caption":"Scene 4 title","visualPrompt":"safe vivid English scene prompt under 28 words"}]}',
    ].join(' '),
    userPrompt: cleanUserPrompt,
    hasBackendApi: params.hasBackendApi,
    hasServerGeminiKey: params.hasServerGeminiKey,
    maxTokens: 520,
  });

  let title = cleanUserPrompt.slice(0, 52) || 'AI Cinema Story';
  let mood: GeneratedVideo['mood'] = 'cinematic';
  let narration = `Here is a cinematic AI visual story crafted for ${cleanUserPrompt}.`;
  let parsedScenes: Array<{ caption: string; visualPrompt: string }> = [];

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
          scenes?: Array<{ caption?: string; visualPrompt?: string }>;
        };
        if (parsed.title) title = parsed.title.slice(0, 64);
        if (parsed.narration) narration = parsed.narration.trim();
        if (
          parsed.mood === 'calm' ||
          parsed.mood === 'epic' ||
          parsed.mood === 'study' ||
          parsed.mood === 'cinematic'
        ) {
          mood = parsed.mood;
        }
        if (Array.isArray(parsed.scenes) && parsed.scenes.length >= 2) {
          parsedScenes = parsed.scenes.slice(0, 4).map((sc, idx) => ({
            caption: (sc?.caption || `Scene ${idx + 1}`).trim(),
            visualPrompt: (sc?.visualPrompt || cleanUserPrompt).trim(),
          }));
        } else if (Array.isArray(parsed.captions) && parsed.captions.length >= 2) {
          const baseVis = parsed.heroVisualPrompt || cleanUserPrompt;
          parsedScenes = parsed.captions.slice(0, 4).map((c, idx) => ({
            caption: (c || `Scene ${idx + 1}`).trim(),
            visualPrompt: `${baseVis}, scene ${idx + 1}`,
          }));
        }
      }
    } catch {
      // Deterministic fallback below
    }
  }

  const defaultBeats = [
    { caption: 'Opening Horizon', cue: 'wide establishing atmospheric view' },
    { caption: 'Closer Perspective', cue: 'dramatic medium angle with rich golden light' },
    { caption: 'Cinematic Motion', cue: 'dynamic sweeping tracking shot' },
    { caption: 'Serene Finale', cue: 'peaceful glowing sunset finale' },
  ];
  while (parsedScenes.length < 4) {
    const beat = defaultBeats[parsedScenes.length];
    parsedScenes.push({
      caption: beat.caption,
      visualPrompt: `${cleanUserPrompt}, ${styleLabel}, ${beat.cue}`,
    });
  }

  const dims = getImageDimensionsForAspectRatio(aspectRatio);
  const configuredModel = resolveOfficialNanoModelId(loadOwnerConfig().imageModel);
  const scene1Prompt = buildSafeArtisticPrompt(parsedScenes[0].visualPrompt);

  params.onStatus?.('Rendering Scene 1 HD visual frame...');
  const heroResult = await tryNanoBananaApi({
    prompt: scene1Prompt,
    aspectRatio,
    resolution: '1K',
    mode: 'generate',
    preferredModel: configuredModel,
    skipEnhance: true,
    hasBackendApi: params.hasBackendApi,
    hasServerGeminiKey: params.hasServerGeminiKey,
    onStatus: params.onStatus,
  });

  if (!heroResult.ok) {
    throw new Error(heroResult.reason);
  }

  const heroUrl = heroResult.imageUrl;

  // Fetch distinct HD frames for scenes 2–4 in parallel via Pollinations FLUX (fast 11s cap; reuses heroUrl seamlessly if any timeout)
  params.onStatus?.('Generating smooth multi-scene transitions...');
  const extraFramePromises = parsedScenes.slice(1).map(async (sc) => {
    const safeScPrompt = buildSafeArtisticPrompt(sc.visualPrompt);
    const polyUrl = `https://pollinations.ai/p/${encodeURIComponent(safeScPrompt)}?width=${dims.width}&height=${dims.height}&model=flux&nologo=true&enhance=true&seed=${randomClientImageSeed()}`;
    const res = await fetchDirectImageAsDataUrl(polyUrl, 11000);
    return {
      caption: sc.caption,
      visualPrompt: safeScPrompt,
      imageUrl: res.ok ? res.dataUrl : heroUrl,
    };
  });

  const extraScenes = await Promise.all(extraFramePromises);
  const scenes: VideoScene[] = [
    {
      caption: parsedScenes[0].caption,
      visualPrompt: scene1Prompt,
      imageUrl: heroUrl,
    },
    ...extraScenes,
  ];

  return {
    title,
    prompt: cleanUserPrompt,
    narration,
    mood,
    style: styleLabel,
    heroImageUrl: heroUrl,
    provider: heroResult.provider,
    scenes,
    aspectRatio,
    createdAt: Date.now(),
  };
}
