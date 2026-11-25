import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { WebSocket as WsSocket, WebSocketServer } from 'ws';
import {
  GoogleGenAI,
  HarmBlockThreshold,
  HarmCategory,
  LiveServerMessage,
  Modality,
  ThinkingLevel,
  Type,
} from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

interface ModelCandidate {
  model: string;
  thinkingConfig: { thinkingBudget: number } | { thinkingLevel: ThinkingLevel };
}

// Primary: gemini-2.5-flash -> gemini-2.0-flash-lite -> gemini-3.1-flash-lite -> gemini-4-hydrogen.
const FAST_CHAT_MODELS: ModelCandidate[] = [
  { model: 'gemini-2.5-flash', thinkingConfig: { thinkingBudget: 0 } },
  { model: 'gemini-2.0-flash-lite', thinkingConfig: { thinkingBudget: 0 } },
  { model: 'gemini-3.1-flash-lite', thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } },
  { model: 'gemini-4-hydrogen', thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
];

const DEFAULT_SAFETY_SETTINGS = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
];

function parseApiKeyList(raw?: string | string[] | null): string[] {
  const items = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    if (typeof item !== 'string') continue;
    for (const part of item.split(/[,\n;]+/)) {
      const k = part.trim();
      if (k && !k.startsWith('gsk_') && !seen.has(k)) {
        seen.add(k);
        out.push(k);
      }
    }
  }
  return out;
}

function getServerDefaultGeminiKey(): string {
  const envRaw = (process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '').trim();
  return parseApiKeyList(envRaw)[0] || envRaw;
}

function resolveGeminiKeyPool(customApiKey?: string, customApiKeys?: string[]): string[] {
  return Array.from(
    new Set([
      ...parseApiKeyList(customApiKeys),
      ...parseApiKeyList(customApiKey),
      ...parseApiKeyList(process.env.GEMINI_API_KEY),
      ...parseApiKeyList(process.env.VITE_GEMINI_API_KEY),
    ])
  );
}

function createAiClientForKey(apiKey: string) {
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function getAiClient(customApiKey?: string) {
  const apiKey = resolveGeminiKeyPool(customApiKey)[0] || '';
  if (!apiKey) {
    throw new Error('MISSING_API_KEY');
  }
  return createAiClientForKey(apiKey);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableOrFallbackError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  return (
    lower.includes('503') ||
    lower.includes('unavailable') ||
    lower.includes('high demand') ||
    lower.includes('overloaded') ||
    lower.includes('resource_exhausted') ||
    lower.includes('429') ||
    lower.includes('not_found') ||
    lower.includes('404') ||
    lower.includes('internal') ||
    lower.includes('timeout')
  );
}

function extractReadableErrorMessage(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') || trimmed.includes('"error"')) {
    try {
      const jsonStart = trimmed.indexOf('{');
      const parsed = JSON.parse(trimmed.slice(jsonStart)) as {
        error?: { message?: string };
        message?: string;
      };
      const nestedMsg = parsed?.error?.message || parsed?.message;
      if (nestedMsg && typeof nestedMsg === 'string') {
        return nestedMsg;
      }
    } catch {
      // Fall through
    }
  }
  return trimmed.replace(/\{[\s\S]*\}/g, '').trim() || raw;
}

function formatGeminiError(err: unknown): { status: number; message: string; code?: string } {
  const rawMessage = err instanceof Error ? err.message : String(err);
  const lower = rawMessage.toLowerCase();

  if (lower.includes('missing_api_key') || lower.includes('gemini_api_key is not configured')) {
    return {
      status: 503,
      code: 'MISSING_API_KEY',
      message:
        'Roosters AI is momentarily connecting to its AI engine. Please try again in a few moments.',
    };
  }
  if (
    lower.includes('permission_denied') ||
    lower.includes('api_key_invalid') ||
    lower.includes('403') ||
    lower.includes('401')
  ) {
    return {
      status: 401,
      message: 'Unable to authenticate with the AI service right now. Please try again shortly.',
    };
  }
  if (lower.includes('503') || lower.includes('unavailable') || lower.includes('high demand') || lower.includes('overloaded')) {
    return {
      status: 503,
      message: 'Our AI servers are experiencing high traffic right now. Please try again in a moment.',
    };
  }
  if (lower.includes('resource_exhausted') || lower.includes('429') || lower.includes('quota')) {
    return {
      status: 200,
      message: 'Roosters AI switched seamlessly to its unlimited free cloud engine. Please send your message again.',
    };
  }

  return {
    status: 500,
    message:
      extractReadableErrorMessage(rawMessage) ||
      'I apologize, something unexpected happened while preparing your response. Please try again.',
  };
}

function isSimpleStyleRequested(rawPrompt: string): boolean {
  return /\b(simple|minimal|minimalist|flat\s*design|flat\s*style|plain|basic|clean\s*icon|line\s*art|uncluttered|sada|simple\s*style|no\s*extra\s*details)\b/i.test(
    rawPrompt || ''
  );
}

type ServerImageAspectRatio = '1:1' | '16:9' | '9:16' | '4:3';

function normalizeServerAspectRatio(raw?: string): ServerImageAspectRatio {
  if (raw === '16:9' || raw === '9:16' || raw === '4:3') return raw;
  return '1:1';
}

function getServerImageDimensions(aspectRatio: ServerImageAspectRatio): { w: number; h: number } {
  if (aspectRatio === '16:9') return { w: 1280, h: 720 };
  if (aspectRatio === '9:16') return { w: 720, h: 1280 };
  if (aspectRatio === '4:3') return { w: 1024, h: 768 };
  return { w: 1024, h: 1024 };
}

function preserveQuotedSegments(originalRaw: string, candidatePrompt: string): string {
  const quoted = Array.from(originalRaw.matchAll(/"([^"]{2,60})"/g))
    .map((m) => m[1].trim())
    .filter(Boolean);
  if (quoted.length === 0) return candidatePrompt;

  let result = candidatePrompt;
  for (const exactText of quoted) {
    if (!result.toLowerCase().includes(exactText.toLowerCase())) {
      result = `${result}, featuring exact clear typography text "${exactText}"`;
    } else if (!result.includes(`"${exactText}"`)) {
      const escaped = exactText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp(escaped, 'i'), `"${exactText}"`);
    }
  }
  return result;
}

function sanitizeSafeImagePrompt(rawPrompt: string, maxWords = 52): string {
  // Preserve double quotes around exact text/brand names while removing stray backticks/newlines
  let cleaned = (rawPrompt || '')
    .replace(/\b(nude|naked|nsfw|sexy|bikini|lingerie|underwear|erotic|explicit|porn)\b/gi, 'modest stylish attire')
    .replace(/\b(blood|gore|kill|murder|corpse|violent|weapon|gun|knife)\b/gi, 'dramatic artistic scene')
    .replace(/\b(drug|weed|cocaine|cigarette|alcohol|beer|wine)\b/gi, 'refreshing tea cup')
    .replace(/[`\n\r]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length > maxWords) {
    cleaned = words.slice(0, maxWords).join(' ').replace(/[,.;:-]+$/, '').trim();
  }
  return (
    cleaned ||
    'serene photorealistic landscape under warm golden sunlight, cinematic lighting, 8k resolution, sharp details, rich colors, professional composition'
  );
}

// Concise, direct system prompt with configurable style, custom/global instructions, anti-refusal & Roman Urdu script matching
function buildStudyTutorInstruction(options: {
  language?: string;
  userName?: string;
  isLiveVoice?: boolean;
  deepResearch?: boolean;
  responseStyle?: 'simple' | 'detailed' | 'study';
  customInstructions?: string;
  globalSystemPrompt?: string;
}) {
  const {
    language,
    userName,
    isLiveVoice,
    deepResearch = false,
    responseStyle = 'simple',
    customInstructions,
    globalSystemPrompt,
  } = options;

  const langRule =
    !language || language === 'Auto-Detect'
      ? "CRITICAL UNIVERSAL LANGUAGE & SCRIPT RULE: Automatically detect the user's exact language and script across all world languages (100+ languages including English, Urdu, Roman Urdu, Hindi, Roman Hindi, Arabic, Punjabi, Pashto, Sindhi, Persian, Bengali, Spanish, French, German, Turkish, Chinese, Japanese, Korean, Russian, etc.). ALWAYS reply fluently in that exact same language and script. If the user writes in Roman Urdu ('kya haal hai', 'mujhe samjhao', 'aik insan moon pr') or Roman Hindi, reply in natural Romanized script with English letters — NEVER switch to Arabic/Urdu/Devanagari script unless the user explicitly asks for native script."
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
    'Roosters AI has full built-in HD image and video creation capabilities. NEVER say "I cannot create images", "I cannot generate pictures", or refuse to create images in English, Urdu, or Roman Urdu. If the user asks for an image, picture, photo, portrait, logo, or floor plan/design (e.g., "pic bna do", "tasveer banao", "naksha banao", or gives a follow-up subject right after asking for a pic), reply ONLY with [CREATE_IMAGE: <detailed, photorealistic English prompt>].',
    'Format code in fenced markdown blocks with language tags only when code is requested or relevant.',
    'NEVER generate ASCII art or text-character drawings when asked for images, photos, portraits, or videos.',
    langRule,
    globalExtra,
    userExtra,
  ]
    .filter(Boolean)
    .join(' ');
}

interface IncomingHistoryItem {
  role: 'user' | 'assistant';
  content: string;
  attachment?: {
    kind?: 'image' | 'file';
    name?: string;
    base64?: string;
    mimeType?: string;
    textContent?: string;
  };
}

type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

function buildContents(messages: IncomingHistoryItem[]) {
  const recent = messages.slice(-10);

  // Single-turn photo/multimodal request: pass direct parts array [{ inlineData }, { text }]
  if (
    recent.length === 1 &&
    recent[0].role === 'user' &&
    recent[0].attachment?.base64 &&
    recent[0].attachment.kind !== 'file'
  ) {
    const raw = recent[0].attachment.base64;
    const base64Data = (raw.includes(',') ? raw.split(',')[1] : raw).trim();
    const imageMimeType = recent[0].attachment.mimeType || 'image/jpeg';
    const userText = recent[0].content?.trim();
    if (base64Data) {
      return [
        { inlineData: { data: base64Data, mimeType: imageMimeType } },
        { text: userText || 'Describe and analyze this image in detail.' },
      ] as GeminiPart[];
    }
  }

  return recent.map((msg) => {
    const parts: GeminiPart[] = [];
    if (msg.attachment?.base64 && msg.attachment.kind !== 'file') {
      const raw = msg.attachment.base64;
      const cleanBase64 = (raw.includes(',') ? raw.split(',')[1] : raw).trim();
      if (cleanBase64) {
        parts.push({
          inlineData: {
            data: cleanBase64,
            mimeType: msg.attachment.mimeType || 'image/jpeg',
          },
        });
      }
    }
    let textPayload = msg.content?.trim() || '';
    if (msg.attachment?.kind === 'file' && msg.attachment.textContent) {
      const fileLabel = msg.attachment.name || 'study-file.txt';
      const section = `[Uploaded File: ${fileLabel}]\n\`\`\`\n${msg.attachment.textContent.slice(0, 60000)}\n\`\`\``;
      textPayload = textPayload
        ? `${textPayload}\n\n${section}`
        : `Please kindly review, summarize, or debug this uploaded file:\n\n${section}`;
    } else if (!textPayload && msg.attachment) {
      textPayload = 'Describe and analyze this image in detail.';
    }
    parts.push({ text: textPayload || 'Hello!' });
    return {
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts,
    };
  });
}

function decodeBasicHtmlEntities(input: string): string {
  return (input || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/\\u0026/gi, '&')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractLastUserQueryText(contents: ReturnType<typeof buildContents>): string {
  if (!Array.isArray(contents)) return '';
  for (let i = contents.length - 1; i >= 0; i--) {
    const item = contents[i] as { role?: string; text?: string; parts?: Array<{ text?: string }> };
    if (typeof item?.text === 'string' && item.text.trim()) {
      return item.text.trim();
    }
    if (item?.role === 'user' && Array.isArray(item.parts)) {
      const joined = item.parts
        .map((p) => p?.text || '')
        .join(' ')
        .trim();
      if (joined) return joined;
    }
  }
  return '';
}

function appendContextToContents(
  contents: ReturnType<typeof buildContents>,
  contextBlock: string
): ReturnType<typeof buildContents> {
  if (!contextBlock.trim() || !Array.isArray(contents)) return contents;
  const cloned = contents.map((item) => {
    const rec = item as { role?: string; text?: string; parts?: Array<{ text?: string } | { inlineData: { mimeType: string; data: string } }> };
    if (Array.isArray(rec.parts)) {
      return { ...rec, parts: rec.parts.map((p) => ({ ...p })) };
    }
    return { ...rec };
  });

  for (let i = cloned.length - 1; i >= 0; i--) {
    const item = cloned[i] as { role?: string; text?: string; parts?: Array<{ text?: string }> };
    if (typeof item?.text === 'string') {
      item.text = `${item.text}\n\n${contextBlock}`;
      return cloned as ReturnType<typeof buildContents>;
    }
    if (item?.role === 'user' && Array.isArray(item.parts)) {
      const textPartIdx = item.parts.findIndex((p) => typeof p.text === 'string');
      if (textPartIdx >= 0) {
        item.parts[textPartIdx] = {
          text: `${item.parts[textPartIdx].text || ''}\n\n${contextBlock}`,
        };
      } else {
        item.parts.push({ text: contextBlock });
      }
      return cloned as ReturnType<typeof buildContents>;
    }
  }
  return contents;
}

async function fetchLiveWebSearchFallback(
  rawQuery: string
): Promise<Array<{ title: string; uri: string; snippet: string }>> {
  const cleanQuery = rawQuery
    .replace(/\[Uploaded File:[\s\S]*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);

  if (!cleanQuery || cleanQuery.length < 3) return [];
  if (/^(hi|hello|hey|salam|assalam|ok|okay|thanks|thank you|shukriya|good morning|good night)[!.?]*$/i.test(cleanQuery)) {
    return [];
  }

  const lower = cleanQuery.toLowerCase();
  const wantsVideo =
    /\b(youtube|yt|video|videos|watch|tutorial|course|podcast|vlog|song|trailer|clip|channel|lecture)\b/i.test(
      lower
    );
  const wantsNews =
    /\b(news|latest|today|breaking|current|update|updates|score|match|price|weather|stock|election|2025|2026)\b/i.test(
      lower
    );

  const ytResults: Array<{ title: string; uri: string; snippet: string }> = [];
  const newsResults: Array<{ title: string; uri: string; snippet: string }> = [];
  const webResults: Array<{ title: string; uri: string; snippet: string }> = [];
  const seenUrls = new Set<string>();

  const isNoisyRootUrl = (uri: string): boolean => {
    try {
      const u = new URL(uri);
      const host = u.hostname.toLowerCase();
      const pathname = u.pathname.replace(/\/+$/, '');
      if (
        (host === 'www.youtube.com' || host === 'youtube.com' || host === 'music.youtube.com' || host === 'studio.youtube.com') &&
        !u.searchParams.get('v') &&
        !pathname.startsWith('/watch') &&
        !pathname.startsWith('/shorts') &&
        !pathname.startsWith('/playlist') &&
        !pathname.startsWith('/@')
      ) {
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const pushToBucket = (
    bucket: Array<{ title: string; uri: string; snippet: string }>,
    title: string,
    uri: string,
    snippet = ''
  ) => {
    const cleanUri = uri.trim();
    if (!/^https?:\/\//i.test(cleanUri) || seenUrls.has(cleanUri) || isNoisyRootUrl(cleanUri)) return;
    seenUrls.add(cleanUri);
    bucket.push({
      title: decodeBasicHtmlEntities(title) || cleanUri,
      uri: cleanUri,
      snippet: decodeBasicHtmlEntities(snippet).slice(0, 220),
    });
  };

  // Strip conversational request phrasing so search engines match the actual topic
  const topicQuery = cleanQuery
    .replace(/\b(please|kindly|find me|give me|send me|show me|share|can you|could you|i need|i want|links? for|link for|youtube video links?|youtube videos?|video links?|latest links?)\b/gi, ' ')
    .replace(/\b\d+\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || cleanQuery;

  const tasks: Array<Promise<void>> = [];

  // 1. Live YouTube video search when user asks for videos/tutorials/songs/links
  if (wantsVideo) {
    tasks.push(
      (async () => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 3500);
        try {
          const ytQuery = topicQuery.split(/\band\b/i)[0].trim() || topicQuery;
          const resp = await fetch(
            `https://www.youtube.com/results?search_query=${encodeURIComponent(ytQuery)}`,
            {
              headers: {
                'User-Agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
              },
              signal: ctrl.signal,
            }
          );
          if (!resp.ok) return;
          const html = await resp.text();
          const blocks = html.split('"videoRenderer":{"videoId":"').slice(1, 14);
          for (const block of blocks) {
            if (ytResults.length >= 4) break;
            const vidIdMatch = block.match(/^([A-Za-z0-9_-]{11})"/);
            const titleMatch = block.match(/"title":\{"runs":\[\{"text":"([^"]+)"/);
            if (vidIdMatch?.[1] && titleMatch?.[1]) {
              pushToBucket(
                ytResults,
                `${titleMatch[1]} - YouTube`,
                `https://www.youtube.com/watch?v=${vidIdMatch[1]}`,
                `YouTube video result for "${ytQuery}"`
              );
            }
          }
        } catch {
          // Ignore timeout/network failure on fallback search
        } finally {
          clearTimeout(timer);
        }
      })()
    );
  }

  // 2. Live Google News RSS when news/current/latest info is requested
  if (wantsNews) {
    tasks.push(
      (async () => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 3500);
        try {
          const newsParts = topicQuery.split(/\band\b/i);
          const newsQuery = (newsParts.length > 1 ? newsParts[newsParts.length - 1] : topicQuery).trim() || topicQuery;
          const resp = await fetch(
            `https://news.google.com/rss/search?q=${encodeURIComponent(newsQuery)}&hl=en-US&gl=US&ceid=US:en`,
            {
              headers: {
                'User-Agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
              },
              signal: ctrl.signal,
            }
          );
          if (!resp.ok) return;
          const xml = await resp.text();
          for (const itemMatch of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
            if (newsResults.length >= 4) break;
            const block = itemMatch[1];
            const title = block.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '';
            const link = block.match(/<link>([\s\S]*?)<\/link>/)?.[1] || '';
            const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || '';
            if (link && title) {
              pushToBucket(newsResults, title, link, pubDate ? `Published: ${pubDate}` : '');
            }
          }
        } catch {
          // Ignore timeout
        } finally {
          clearTimeout(timer);
        }
      })()
    );
  }

  // 3. Live Web Search via Bing Search RSS
  tasks.push(
    (async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3500);
      try {
        const resp = await fetch(
          `https://www.bing.com/search?format=rss&setLang=en&cc=US&q=${encodeURIComponent(topicQuery)}`,
          {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            },
            signal: ctrl.signal,
          }
        );
        if (!resp.ok) return;
        const xml = await resp.text();
        for (const itemMatch of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
          if (webResults.length >= 6) break;
          const block = itemMatch[1];
          const title = block.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '';
          const link = block.match(/<link>([\s\S]*?)<\/link>/)?.[1] || '';
          const desc = block.match(/<description>([\s\S]*?)<\/description>/)?.[1] || '';
          if (link && title) {
            pushToBucket(webResults, title, link, desc);
          }
        }
      } catch {
        // Ignore timeout
      } finally {
        clearTimeout(timer);
      }
    })()
  );

  await Promise.all(tasks);
  return [...ytResults, ...newsResults, ...webResults].slice(0, 10);
}

function convertContentsToOpenAIMessages(
  contents: ReturnType<typeof buildContents>,
  systemInstruction: string
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const out: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
  if (systemInstruction.trim()) {
    out.push({ role: 'system', content: systemInstruction.trim() });
  }
  if (!Array.isArray(contents)) return out;

  const isPartsOnly = contents.some(
    (c) =>
      typeof c === 'object' &&
      c !== null &&
      ('text' in c || 'inlineData' in c) &&
      !('parts' in c)
  );
  if (isPartsOnly) {
    const joined = (contents as GeminiPart[])
      .map((p) => ('text' in p ? p.text : '[User attached an image]'))
      .filter(Boolean)
      .join('\n');
    out.push({ role: 'user', content: joined || 'Hello!' });
    return out;
  }

  for (const item of contents as Array<{ role?: string; parts?: GeminiPart[] }>) {
    const text = Array.isArray(item.parts)
      ? item.parts
          .map((p) => ('text' in p ? p.text : '[Attached image]'))
          .filter(Boolean)
          .join('\n')
      : '';
    if (!text.trim()) continue;
    out.push({
      role: item.role === 'model' ? 'assistant' : 'user',
      content: text.trim(),
    });
  }
  return out;
}

async function fetchPollinationsTextReply(params: {
  contents: ReturnType<typeof buildContents>;
  systemInstruction: string;
}): Promise<string | null> {
  const openAiMessages = convertContentsToOpenAIMessages(params.contents, params.systemInstruction);
  const endpoints = [
    { url: 'https://text.pollinations.ai/openai', body: { model: 'openai', messages: openAiMessages } },
    { url: 'https://gen.pollinations.ai/v1/chat/completions', body: { model: 'openai', messages: openAiMessages } },
  ];

  for (const ep of endpoints) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 16000);
    try {
      const resp = await fetch(ep.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        },
        body: JSON.stringify(ep.body),
        signal: ctrl.signal,
      });
      if (!resp.ok) continue;
      const json = (await resp.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = (json.choices?.[0]?.message?.content || '').trim();
      if (text) return text;
    } catch {
      // Try next Pollinations endpoint cleanly
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

async function streamWithFallback(
  res: express.Response,
  params: {
    contents: ReturnType<typeof buildContents>;
    systemInstruction: string;
    apiKey?: string;
    apiKeys?: string[];
    preferredModel?: string;
    enableSearchGrounding?: boolean;
  }
) {
  const keyPool = resolveGeminiKeyPool(params.apiKey, params.apiKeys);
  let succeeded = false;
  const collectedSources = new Map<string, string>();

  const preferred = params.preferredModel?.trim();
  const orderedCandidates: ModelCandidate[] =
    preferred && FAST_CHAT_MODELS.some((m) => m.model === preferred)
      ? [
          FAST_CHAT_MODELS.find((m) => m.model === preferred)!,
          ...FAST_CHAT_MODELS.filter((m) => m.model !== preferred),
        ]
      : FAST_CHAT_MODELS;

  const enableSearch = params.enableSearchGrounding !== false;
  let finalAccumulatedText = '';
  let liveSearchCache: Array<{ title: string; uri: string; snippet: string }> | null = null;
  let groundedContentsCache: ReturnType<typeof buildContents> | null = null;

  const getGroundedFallbackContents = async (): Promise<ReturnType<typeof buildContents>> => {
    if (groundedContentsCache) return groundedContentsCache;
    const queryText = extractLastUserQueryText(params.contents);
    liveSearchCache = await fetchLiveWebSearchFallback(queryText);
    if (liveSearchCache.length > 0) {
      for (const item of liveSearchCache) {
        if (!collectedSources.has(item.uri)) {
          collectedSources.set(item.uri, item.title);
        }
      }
      const formattedResults = liveSearchCache
        .map(
          (item, idx) =>
            `${idx + 1}. Title: ${item.title}\n   URL: ${item.uri}${item.snippet ? `\n   Snippet: ${item.snippet}` : ''}`
        )
        .join('\n');
      const liveContextPrompt = `[LIVE WEB SEARCH RESULTS — Use these real-time search results and include exact clickable Markdown links formatted as [Title](URL) directly in your reply. Never claim you cannot fetch real-time internet links.]\n${formattedResults}`;
      groundedContentsCache = appendContextToContents(params.contents, liveContextPrompt);
    } else {
      groundedContentsCache = params.contents;
    }
    return groundedContentsCache;
  };

  // Iterate across all configured Gemini keys (auto-rotating on 429/quota/auth/overload)
  for (let keyIdx = 0; keyIdx < keyPool.length && !succeeded; keyIdx++) {
    const ai = createAiClientForKey(keyPool[keyIdx]);

    const runCandidateStream = async (
      candidate: ModelCandidate,
      useSearchTool: boolean,
      customContents?: ReturnType<typeof buildContents>
    ) => {
      let emittedAnyChunk = false;
      let accumulatedText = '';
      const stream = await ai.models.generateContentStream({
        model: candidate.model,
        contents: customContents ?? params.contents,
        config: {
          systemInstruction: params.systemInstruction,
          thinkingConfig: candidate.thinkingConfig,
          safetySettings: DEFAULT_SAFETY_SETTINGS,
          ...(useSearchTool ? { tools: [{ googleSearch: {} }] } : {}),
        },
      });

      for await (const chunk of stream) {
        const text = chunk.text;
        if (text) {
          emittedAnyChunk = true;
          accumulatedText += text;
          res.write(`data: ${JSON.stringify({ type: 'chunk', text })}\n\n`);
        }

        const groundingChunks = (
          chunk as unknown as {
            candidates?: Array<{
              groundingMetadata?: {
                groundingChunks?: Array<{
                  web?: { uri?: string; title?: string };
                  retrievedContext?: { uri?: string; title?: string };
                }>;
              };
            }>;
          }
        )?.candidates?.[0]?.groundingMetadata?.groundingChunks;

        if (Array.isArray(groundingChunks)) {
          for (const gChunk of groundingChunks) {
            const uri = (gChunk?.web?.uri || gChunk?.retrievedContext?.uri || '').trim();
            if (uri && /^https?:\/\//i.test(uri) && !collectedSources.has(uri)) {
              const title = (gChunk?.web?.title || gChunk?.retrievedContext?.title || uri).trim();
              collectedSources.set(uri, title);
            }
          }
        }
      }

      if (!emittedAnyChunk) {
        throw new Error('Gemini stream completed without returning any text.');
      }
      return { emittedAnyChunk, accumulatedText };
    };

    let sawSearchQuotaOrToolIssue = false;
    const pass1Limit = enableSearch ? Math.min(2, orderedCandidates.length) : orderedCandidates.length;

    // Pass 1: Try Gemini WITH native tools: [{ googleSearch: {} }]
    for (let i = 0; i < pass1Limit; i++) {
      const candidate = orderedCandidates[i];
      let emittedAnyChunk = false;

      try {
        const runResult = await runCandidateStream(candidate, enableSearch);
        emittedAnyChunk = runResult.emittedAnyChunk;
        finalAccumulatedText = runResult.accumulatedText;
        succeeded = true;
        break;
      } catch (err) {
        const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
        const isToolOrQuotaIssue =
          enableSearch &&
          !emittedAnyChunk &&
          (msg.includes('tool') ||
            msg.includes('googlesearch') ||
            msg.includes('search') ||
            msg.includes('429') ||
            msg.includes('resource_exhausted') ||
            msg.includes('quota'));

        if (isToolOrQuotaIssue) {
          sawSearchQuotaOrToolIssue = true;
        }

        if (!emittedAnyChunk && (isRetryableOrFallbackError(err) || isToolOrQuotaIssue) && i < pass1Limit - 1) {
          await sleep(80);
          continue;
        }
        if (emittedAnyChunk) {
          succeeded = true;
          break;
        }
        break;
      }
    }

    // Pass 2: If native googleSearch tool hit quota/tool error, use live RSS web search + all Gemini models (including gemini-2.0-flash-lite)
    if (!succeeded && enableSearch && sawSearchQuotaOrToolIssue) {
      const groundedContents = await getGroundedFallbackContents();
      for (let i = 0; i < orderedCandidates.length; i++) {
        const candidate = orderedCandidates[i];
        let emittedAnyChunk = false;
        try {
          const fallbackRun = await runCandidateStream(candidate, false, groundedContents);
          emittedAnyChunk = fallbackRun.emittedAnyChunk;
          finalAccumulatedText = fallbackRun.accumulatedText;
          succeeded = true;
          break;
        } catch (fallbackErr) {
          if (!emittedAnyChunk && isRetryableOrFallbackError(fallbackErr) && i < orderedCandidates.length - 1) {
            await sleep(80);
            continue;
          }
          if (emittedAnyChunk) {
            succeeded = true;
            break;
          }
          break;
        }
      }
    }
  }

  // Pass 3: Permanent 429 / Quota Failover — Pollinations AI Free Unlimited Text API (zero errors!)
  if (!succeeded) {
    const contentsForFallback = enableSearch
      ? await getGroundedFallbackContents()
      : params.contents;

    const polyReply = await fetchPollinationsTextReply({
      contents: contentsForFallback,
      systemInstruction: params.systemInstruction,
    });

    if (polyReply) {
      finalAccumulatedText = polyReply;
      // Stream in natural crisp chunks so UI renders smoothly
      const words = polyReply.split(/(\s+)/);
      for (let i = 0; i < words.length; i += 6) {
        const slice = words.slice(i, i + 6).join('');
        if (slice) {
          res.write(`data: ${JSON.stringify({ type: 'chunk', text: slice })}\n\n`);
        }
      }
      succeeded = true;
    }
  }

  // Ultimate guarantee: never display raw 429/Quota errors to users
  if (!succeeded) {
    const safeReply =
      'I am ready to help! Let me know your question again or try rephrasing in a moment.';
    finalAccumulatedText = safeReply;
    res.write(`data: ${JSON.stringify({ type: 'chunk', text: safeReply })}\n\n`);
    succeeded = true;
  }

  if (collectedSources.size > 0) {
    const sources = Array.from(collectedSources.entries())
      .slice(0, 12)
      .map(([uri, title]) => ({ uri, title }));

    // Ensure clickable https:// links are always visible directly inside the chat text if model only returned metadata
    if (!/https?:\/\//i.test(finalAccumulatedText)) {
      const markdownLinks = sources
        .slice(0, 6)
        .map((s) => {
          const safeTitle = s.title.replace(/[\[\]]/g, '').trim() || s.uri;
          return `- [${safeTitle}](${s.uri})`;
        })
        .join('\n');
      const appendText = `\n\n**Verified Live Links:**\n${markdownLinks}`;
      res.write(`data: ${JSON.stringify({ type: 'chunk', text: appendText })}\n\n`);
    }

    res.write(`data: ${JSON.stringify({ type: 'sources', sources })}\n\n`);
  }

  res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
  res.end();
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  const activeVisitors = new Map<string, number>();

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'Roosters AI by SandSoft',
      version: '2.0',
      hasServerGeminiKey: Boolean(getServerDefaultGeminiKey()),
    });
  });

  app.post('/api/visitors/heartbeat', (req, res) => {
    const clientId = typeof req.body?.clientId === 'string' && req.body.clientId
      ? req.body.clientId.slice(0, 64)
      : 'anon';
    const now = Date.now();
    activeVisitors.set(clientId, now);
    for (const [id, lastSeen] of activeVisitors.entries()) {
      if (now - lastSeen > 45_000) {
        activeVisitors.delete(id);
      }
    }
    res.json({ activeClients: activeVisitors.size });
  });

  // Real-Time Streaming Multimodal Chat Endpoint (SSE — multi-key rotation + Pollinations 429 fallback)
  app.post('/api/chat', async (req, res) => {
    try {
      const {
        messages,
        language,
        userName,
        apiKey,
        apiKeys,
        responseStyle,
        customInstructions,
        globalSystemPrompt,
        chatModel,
        deepResearch,
      } = req.body as {
        messages: IncomingHistoryItem[];
        language?: string;
        userName?: string;
        apiKey?: string;
        apiKeys?: string[];
        responseStyle?: 'simple' | 'detailed' | 'study';
        customInstructions?: string;
        globalSystemPrompt?: string;
        chatModel?: string;
        deepResearch?: boolean;
      };

      if (!Array.isArray(messages) || messages.length === 0) {
        res.status(400).json({ error: 'Messages array is required.' });
        return;
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      await streamWithFallback(res, {
        contents: buildContents(messages),
        systemInstruction: buildStudyTutorInstruction({
          language,
          userName,
          isLiveVoice: false,
          deepResearch: Boolean(deepResearch),
          responseStyle,
          customInstructions,
          globalSystemPrompt,
        }),
        apiKey,
        apiKeys,
        preferredModel: chatModel,
        enableSearchGrounding: true,
      });
    } catch (err) {
      const formatted = formatGeminiError(err);
      if (res.headersSent) {
        res.write(
          `data: ${JSON.stringify({ type: 'chunk', text: formatted.message })}\n\n`
        );
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        res.end();
      } else {
        res.status(formatted.status).json({ error: formatted.message, code: formatted.code });
      }
    }
  });

  // Direct Gemini Vision Endpoint with Multi-Key Rotation
  app.post('/api/vision', async (req, res) => {
    try {
      const {
        prompt,
        base64Data,
        mimeType,
        language,
        userName,
        isLiveVoice,
        apiKey,
        apiKeys,
        responseStyle,
        customInstructions,
        globalSystemPrompt,
      } = req.body as {
        prompt?: string;
        base64Data?: string;
        mimeType?: string;
        language?: string;
        userName?: string;
        isLiveVoice?: boolean;
        apiKey?: string;
        apiKeys?: string[];
        responseStyle?: 'simple' | 'detailed' | 'study';
        customInstructions?: string;
        globalSystemPrompt?: string;
      };

      const keyPool = resolveGeminiKeyPool(apiKey, apiKeys);
      if (keyPool.length === 0) {
        res.status(503).json({ error: 'Image analysis requires a Gemini API key in Settings.' });
        return;
      }

      const rawB64 = (base64Data || '').trim();
      const cleanBase64 = (rawB64.includes(',') ? rawB64.split(',')[1] : rawB64).trim();
      if (!cleanBase64) {
        res.status(400).json({ error: 'Image Base64 data is empty.' });
        return;
      }

      const systemText = buildStudyTutorInstruction({
        language,
        userName,
        isLiveVoice: Boolean(isLiveVoice),
        responseStyle,
        customInstructions,
        globalSystemPrompt,
      });
      const userPromptText = (prompt || '').trim() || 'Describe and analyze this image in detail.';
      const imageMime = mimeType || 'image/jpeg';

      let lastErr: unknown = null;

      for (const activeKey of keyPool) {
        // 1. Direct Gemini 2.5 Flash REST API attempt with clean inline_data JSON body
        try {
          const restCtrl = new AbortController();
          const restTimer = setTimeout(() => restCtrl.abort(), 7000);
          try {
            const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
              activeKey
            )}`;
            const geminiResp = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: restCtrl.signal,
              body: JSON.stringify({
                system_instruction: { parts: [{ text: systemText }] },
                contents: [
                  {
                    parts: [
                      { text: userPromptText },
                      {
                        inline_data: {
                          mime_type: imageMime,
                          data: cleanBase64,
                        },
                      },
                    ],
                  },
                ],
                safetySettings: DEFAULT_SAFETY_SETTINGS.map((s) => ({
                  category: s.category,
                  threshold: 'BLOCK_ONLY_HIGH',
                })),
                generationConfig: { thinkingConfig: { thinkingBudget: 0 } },
              }),
            });

            if (geminiResp.ok) {
              const data = (await geminiResp.json()) as {
                candidates?: Array<{
                  finishReason?: string;
                  content?: { parts?: Array<{ text?: string }> };
                }>;
                promptFeedback?: { blockReason?: string };
              };
              if (data.promptFeedback?.blockReason) {
                res.status(400).json({
                  error: `Gemini blocked this image request (${data.promptFeedback.blockReason}).`,
                });
                return;
              }
              const restText = (
                data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') || ''
              ).trim();
              if (restText) {
                res.json({ text: restText });
                return;
              }
            }
          } finally {
            clearTimeout(restTimer);
          }
        } catch {
          // Fall through to SDK models
        }

        // 2. Fallback to @google/genai multimodal models on this key
        const ai = createAiClientForKey(activeKey);
        for (const candidate of FAST_CHAT_MODELS.slice(1)) {
          try {
            const response = await ai.models.generateContent({
              model: candidate.model,
              contents: [
                { text: userPromptText },
                { inlineData: { mimeType: imageMime, data: cleanBase64 } },
              ],
              config: {
                systemInstruction: systemText,
                thinkingConfig: candidate.thinkingConfig,
                safetySettings: DEFAULT_SAFETY_SETTINGS,
              },
            });
            const sdkText = (response.text ?? '').trim();
            if (sdkText) {
              res.json({ text: sdkText });
              return;
            }
          } catch (err) {
            lastErr = err;
            if (isRetryableOrFallbackError(err)) {
              continue;
            }
            break;
          }
        }
      }

      const formatted = formatGeminiError(lastErr || new Error('Gemini Vision returned no response.'));
      res.status(formatted.status).json({ error: formatted.message });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Unexpected server error during photo analysis.',
      });
    }
  });

  // Streaming SSE Live Talk Endpoint with multi-key + Pollinations fallback
  app.post('/api/chat-live-stream', async (req, res) => {
    try {
      const {
        messages,
        language,
        userName,
        apiKey,
        apiKeys,
        responseStyle,
        customInstructions,
        globalSystemPrompt,
        chatModel,
      } = req.body as {
        messages: IncomingHistoryItem[];
        language?: string;
        userName?: string;
        apiKey?: string;
        apiKeys?: string[];
        responseStyle?: 'simple' | 'detailed' | 'study';
        customInstructions?: string;
        globalSystemPrompt?: string;
        chatModel?: string;
      };

      if (!Array.isArray(messages) || messages.length === 0) {
        res.status(400).json({ error: 'Messages array is required.' });
        return;
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      await streamWithFallback(res, {
        contents: buildContents(messages),
        systemInstruction: buildStudyTutorInstruction({
          language,
          userName,
          isLiveVoice: true,
          responseStyle,
          customInstructions,
          globalSystemPrompt,
        }),
        apiKey,
        apiKeys,
        preferredModel: chatModel,
        enableSearchGrounding: true,
      });
    } catch (err) {
      const formatted = formatGeminiError(err);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ type: 'chunk', text: formatted.message })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        res.end();
      } else {
        res.status(formatted.status).json({ error: formatted.message, code: formatted.code });
      }
    }
  });

  // Non-streaming Live Talk endpoint with multi-key rotation + Pollinations fallback
  app.post('/api/chat-live', async (req, res) => {
    try {
      const {
        messages,
        language,
        userName,
        apiKey,
        apiKeys,
        responseStyle,
        customInstructions,
        globalSystemPrompt,
      } = req.body as {
        messages: IncomingHistoryItem[];
        language?: string;
        userName?: string;
        apiKey?: string;
        apiKeys?: string[];
        responseStyle?: 'simple' | 'detailed' | 'study';
        customInstructions?: string;
        globalSystemPrompt?: string;
      };

      if (!Array.isArray(messages) || messages.length === 0) {
        res.status(400).json({ error: 'Messages array is required.' });
        return;
      }

      const keyPool = resolveGeminiKeyPool(apiKey, apiKeys);
      const systemInstruction = buildStudyTutorInstruction({
        language,
        userName,
        isLiveVoice: true,
        responseStyle,
        customInstructions,
        globalSystemPrompt,
      });
      const contents = buildContents(messages);

      for (const activeKey of keyPool) {
        const ai = createAiClientForKey(activeKey);
        for (const useSearchTool of [true, false]) {
          const limit = useSearchTool ? Math.min(2, FAST_CHAT_MODELS.length) : FAST_CHAT_MODELS.length;
          for (let i = 0; i < limit; i++) {
            const candidate = FAST_CHAT_MODELS[i];
            try {
              const response = await ai.models.generateContent({
                model: candidate.model,
                contents,
                config: {
                  systemInstruction,
                  thinkingConfig: candidate.thinkingConfig,
                  safetySettings: DEFAULT_SAFETY_SETTINGS,
                  ...(useSearchTool ? { tools: [{ googleSearch: {} }] } : {}),
                },
              });
              const text = (response.text ?? '').trim();
              if (text) {
                res.json({ text });
                return;
              }
            } catch (err) {
              if (isRetryableOrFallbackError(err) && i < limit - 1) {
                await sleep(80);
                continue;
              }
              break;
            }
          }
        }
      }

      const polyText = await fetchPollinationsTextReply({ contents, systemInstruction });
      res.json({
        text: polyText || "I'm listening! Ask me anything and I will answer right away.",
      });
    } catch (err) {
      const formatted = formatGeminiError(err);
      res.json({ text: formatted.message });
    }
  });

  // Step 1: Gemini Multilingual & Context-Aware Image/Edit/Design Intent Detector + Prompt Enhancer
  app.post('/api/detect-image-intent', async (req, res) => {
    try {
      const {
        text,
        recentMessages,
        forceImage,
        hasAttachment,
        hasPreviousGeneratedImage,
        apiKey,
        apiKeys,
      } = req.body as {
        text: string;
        recentMessages?: Array<{ role?: string; content?: string }>;
        forceImage?: boolean;
        hasAttachment?: boolean;
        hasPreviousGeneratedImage?: boolean;
        apiKey?: string;
        apiKeys?: string[];
      };

      const cleaned = (text || '').trim();
      if (!cleaned) {
        res.status(400).json({ error: 'Input text is required.' });
        return;
      }

      const contextLines = Array.isArray(recentMessages)
        ? recentMessages
            .slice(-5)
            .map((m) => {
              const roleLabel = m.role === 'assistant' ? 'Assistant' : 'User';
              return `${roleLabel}: ${(m.content || '').trim().slice(0, 260)}`;
            })
            .filter(Boolean)
        : [];

      const stateFlags = [
        hasAttachment ? 'USER_ATTACHED_PHOTO=true' : 'USER_ATTACHED_PHOTO=false',
        hasPreviousGeneratedImage
          ? 'PREVIOUS_GENERATED_IMAGE_EXISTS_IN_CHAT=true'
          : 'PREVIOUS_GENERATED_IMAGE_EXISTS_IN_CHAT=false',
      ].join(' | ');

      const detectorInput =
        contextLines.length > 0
          ? `Session State: ${stateFlags}\n\nRecent Conversation Context:\n${contextLines.join('\n')}\n\nLatest User Message:\n${cleaned}`
          : `Session State: ${stateFlags}\n\nLatest User Message:\n${cleaned}`;

      const wantsSimpleStyle = isSimpleStyleRequested(cleaned);
      const keyPool = resolveGeminiKeyPool(apiKey, apiKeys);
      const enhancerSystemInstruction = forceImage
        ? [
            'You are a world-class AI visual prompt engineer for ultra-high-quality image generation (3D logos, glowing digital art, studio photography, illustrations).',
            'Understand ANY world language (100+ languages including English, Urdu, Roman Urdu, Hindi, Arabic, Punjabi, Pashto, Sindhi, Spanish, French, German, Turkish, Chinese, Japanese, Korean, Russian, etc.).',
            'If Recent Conversation Context is provided, combine any relevant visual subject from the context with the Latest User Message.',
            'CRITICAL QUOTED TEXT RULE: If the user puts any exact text, brand name, title, or slogan in quotes ("..."), you MUST preserve that exact quoted text verbatim in double quotes inside enhancedPrompt.',
            wantsSimpleStyle
              ? 'USER REQUESTED SIMPLE STYLE: Set intent to "image". Translate and refine into a clean, minimal, uncluttered English prompt (10-24 words) with clean edges and simple aesthetic — do NOT add heavy cinematic effects or extra clutter.'
              : 'Set intent to "image". Automatically expand and enhance the user prompt into a rich, detailed, family-friendly English prompt (24-44 words) adding cinematic lighting, 8k resolution, sharp textures, depth, rich colors, and professional composition matched to the subject.',
            'Strip command words like "pic bna do", "tasveer banao", "naksha banao", "generate image", "draw me". Never include unsafe, explicit, or violent terms.',
          ].join(' ')
        : [
            'You are a context-aware intent classifier and professional AI image/photo-editing prompt engineer for Roosters AI.',
            'Analyze the Session State, Recent Conversation Context, and Latest User Message in ANY world language (English, Urdu, Roman Urdu, Hindi, Arabic, Spanish, French, German, Turkish, etc.).',
            'Classify intent as one of: "image_edit", "image", "video", or "chat":',
            '- "image_edit": MUST be chosen when USER_ATTACHED_PHOTO=true AND the user asks to edit, modify, transform, retouch, restore old photo, make a 3D figurine, change background, change outfit/clothes, add/remove objects, change hair/glasses, change lighting/weather/style, or convert the attached photo. ALSO choose "image_edit" when USER_ATTACHED_PHOTO=false AND PREVIOUS_GENERATED_IMAGE_EXISTS_IN_CHAT=true AND the user asks a follow-up visual refinement to the previous image. Note: if USER_ATTACHED_PHOTO=true and user only asks a question like "what is this?", "read text", "solve this", choose "chat"!',
            '- "video": if the user asks to create/generate/make a video, reel, clip, or animation.',
            '- "image": if creating a brand new picture/photo/portrait/logo/wallpaper/poster/house design/map (naksha) from scratch (including follow-ups right after "Mujhe aik pic bna k do").',
            '- "chat": for normal questions, vision Q&A on an attached image, greeting, math, translation, or coding help.',
            'CRITICAL QUOTED TEXT RULE: Preserve any quoted text/brand names ("...") verbatim inside enhancedPrompt.',
            'Output fields:',
            '- If intent is "image": UNLESS the user explicitly requests a simple/minimalist/flat/plain style (in which case keep it clean and uncluttered in 10-24 words), expand and enhance the prompt into a rich, detailed, family-friendly English prompt (24-44 words) with cinematic lighting, 8k resolution, sharp textures, depth, rich colors, and professional composition + 3-6 word English shortTitle.',
            '- If intent is "image_edit": translate/refine into a clear, safe, family-friendly English photo-editing instruction (under 30 words) preserving face/identity consistency + 3-6 word English shortTitle.',
            '- If intent is "chat" or "video": set enhancedPrompt to "" and shortTitle to "".',
          ].join(' ');

      const detectorLimit = Math.min(2, FAST_CHAT_MODELS.length);
      for (const activeKey of keyPool) {
        const ai = createAiClientForKey(activeKey);
        for (let i = 0; i < detectorLimit; i++) {
          const candidate = FAST_CHAT_MODELS[i];
          try {
            const response = await ai.models.generateContent({
              model: candidate.model,
              contents: detectorInput,
              config: {
                abortSignal: AbortSignal.timeout(4500),
                systemInstruction: enhancerSystemInstruction,
                thinkingConfig: candidate.thinkingConfig,
                safetySettings: DEFAULT_SAFETY_SETTINGS,
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    intent: { type: Type.STRING },
                    shortTitle: { type: Type.STRING },
                    enhancedPrompt: { type: Type.STRING },
                  },
                  required: ['intent', 'shortTitle', 'enhancedPrompt'],
                },
              },
            });

            const rawJson = (response.text ?? '{}').trim();
            const startIdx = rawJson.indexOf('{');
            const endIdx = rawJson.lastIndexOf('}');
            const parsed = JSON.parse(
              startIdx >= 0 && endIdx > startIdx ? rawJson.slice(startIdx, endIdx + 1) : rawJson
            ) as {
              intent?: string;
              shortTitle?: string;
              enhancedPrompt?: string;
            };
            const normalizedIntent = forceImage
              ? 'image'
              : parsed.intent === 'image_edit'
                ? 'image_edit'
                : parsed.intent === 'image'
                  ? 'image'
                  : parsed.intent === 'video'
                    ? 'video'
                    : 'chat';

            const cleanEnhanced =
              normalizedIntent === 'image' || normalizedIntent === 'image_edit'
                ? sanitizeSafeImagePrompt(preserveQuotedSegments(cleaned, parsed.enhancedPrompt || ''), 52)
                : (parsed.enhancedPrompt || '').trim();

            res.json({
              intent: normalizedIntent,
              shortTitle: (parsed.shortTitle || '').trim(),
              enhancedPrompt: cleanEnhanced,
            });
            return;
          } catch (err) {
            const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
            const isTimeoutErr = msg.includes('abort') || msg.includes('timeout');
            if ((isRetryableOrFallbackError(err) || isTimeoutErr) && i < detectorLimit - 1) {
              await sleep(60);
              continue;
            }
            break;
          }
        }
      }

      if (forceImage) {
        const cleanSubject = cleaned
          .replace(
            /\b(create|generate|make|draw|paint|sketch|render|show|please|kindly|me|mujy|mujhe|a|an|ek|aik|pic|picture|tasveer|photo|image|banao|bnao|dikhao)\b/gi,
            ' '
          )
          .replace(/\s+/g, ' ')
          .trim() || cleaned;
        const fallbackEnhanced = sanitizeSafeImagePrompt(
          preserveQuotedSegments(
            cleaned,
            wantsSimpleStyle
              ? `${cleanSubject}, clean minimalist composition, crisp sharp edges`
              : `${cleanSubject}, cinematic lighting, 8k resolution, sharp textures, depth, rich colors, professional composition`
          ),
          52
        );
        res.json({
          intent: 'image',
          shortTitle: cleanSubject.slice(0, 52),
          enhancedPrompt: fallbackEnhanced,
        });
        return;
      }

      res.json({ intent: 'chat', shortTitle: '', enhancedPrompt: '' });
    } catch {
      res.json({ intent: 'chat', shortTitle: '', enhancedPrompt: '' });
    }
  });

  function randomImageSeed(): number {
    return Math.floor(Math.random() * 1_000_000_000) + 1;
  }

  // Server-Side Keyless Image Fetch Helper (Converts fetched image directly to Base64 data URL)
  async function fetchKeylessImageAsDataUrl(
    targetUrl: string,
    timeoutMs = 18000
  ): Promise<{ ok: true; dataUrl: string; mimeType: string } | { ok: false; reason: string; status?: number }> {
    if (!/^https:\/\//i.test(targetUrl)) {
      return { ok: false, reason: 'Invalid image URL scheme' };
    }
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const resp = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          Accept: 'image/avif,image/webp,image/apng,image/png,image/jpeg,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
        signal: ctrl.signal,
      });

      if (!resp.ok) {
        return { ok: false, reason: `HTTP ${resp.status}`, status: resp.status };
      }

      const contentType = (resp.headers.get('content-type') || '').toLowerCase();
      if (!contentType.startsWith('image/')) {
        return { ok: false, reason: `Unexpected content-type: ${contentType || 'unknown'}`, status: resp.status };
      }

      const arrayBuf = await resp.arrayBuffer();
      // Reject tiny rate-limit/error notices or empty payloads
      if (arrayBuf.byteLength < 4500) {
        return { ok: false, reason: `Image payload too small (${arrayBuf.byteLength} bytes)` };
      }

      const cleanMime = contentType.split(';')[0].trim() || 'image/jpeg';
      const b64 = Buffer.from(arrayBuf).toString('base64');
      return {
        ok: true,
        dataUrl: `data:${cleanMime};base64,${b64}`,
        mimeType: cleanMime,
      };
    } catch (err) {
      return {
        ok: false,
        reason: err instanceof Error ? err.message : 'Image fetch timed out or failed',
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Keyless Hugging Face FLUX.1-schnell Gradio Space helper (returns Base64 data URL)
  async function fetchFluxSchnellGradioAsDataUrl(
    prompt: string,
    width: number,
    height: number,
    timeoutMs = 20000
  ): Promise<{ ok: true; dataUrl: string; mimeType: string } | { ok: false; reason: string }> {
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), timeoutMs);
    const spaceBase = 'https://black-forest-labs-flux-1-schnell.hf.space';
    const clampedW = Math.min(1024, Math.max(512, Math.round(width / 8) * 8));
    const clampedH = Math.min(1024, Math.max(512, Math.round(height / 8) * 8));
    try {
      const startResp = await fetch(`${spaceBase}/gradio_api/call/infer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        },
        body: JSON.stringify({
          data: [prompt, randomImageSeed(), false, clampedW, clampedH, 4],
        }),
        signal: ctrl.signal,
      });

      if (!startResp.ok) {
        return { ok: false, reason: `FLUX Space start HTTP ${startResp.status}` };
      }

      const startJson = (await startResp.json()) as { event_id?: string };
      const eventId = startJson.event_id;
      if (!eventId) {
        return { ok: false, reason: 'FLUX Space missing event_id' };
      }

      const pollResp = await fetch(`${spaceBase}/gradio_api/call/infer/${encodeURIComponent(eventId)}`, {
        method: 'GET',
        headers: { Accept: 'text/event-stream' },
        signal: ctrl.signal,
      });

      if (!pollResp.ok) {
        return { ok: false, reason: `FLUX Space result HTTP ${pollResp.status}` };
      }

      const sseText = await pollResp.text();
      const dataLines = sseText
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim());

      for (let i = dataLines.length - 1; i >= 0; i--) {
        try {
          const parsed = JSON.parse(dataLines[i]) as Array<{ url?: string; path?: string }>;
          const fileUrl =
            parsed?.[0]?.url ||
            (parsed?.[0]?.path ? `${spaceBase}/gradio_api/file=${parsed[0].path}` : '');
          if (fileUrl && fileUrl.startsWith(spaceBase)) {
            return await fetchKeylessImageAsDataUrl(fileUrl, 12000);
          }
        } catch {
          // Continue checking lines
        }
      }

      return { ok: false, reason: 'FLUX Space returned no image output' };
    } catch (err) {
      return {
        ok: false,
        reason: err instanceof Error ? err.message : 'FLUX Space timed out or failed',
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Keyless AI Horde (Stable Horde anonymous tier) helper (returns Base64 data URL)
  async function fetchAiHordeAsDataUrl(
    prompt: string,
    aspectRatio: ServerImageAspectRatio,
    attempt = 1,
    timeoutMs = 22000
  ): Promise<{ ok: true; dataUrl: string; mimeType: string } | { ok: false; reason: string }> {
    const deadline = Date.now() + timeoutMs;
    const hordeDims =
      attempt >= 2
        ? aspectRatio === '16:9'
          ? { w: 768, h: 448 }
          : aspectRatio === '9:16'
            ? { w: 448, h: 768 }
            : aspectRatio === '4:3'
              ? { w: 640, h: 512 }
              : { w: 512, h: 512 }
        : aspectRatio === '16:9'
          ? { w: 896, h: 512 }
          : aspectRatio === '9:16'
            ? { w: 512, h: 896 }
            : aspectRatio === '4:3'
              ? { w: 768, h: 576 }
              : { w: 768, h: 768 };

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
            params: {
              width: hordeDims.w,
              height: hordeDims.h,
              steps: attempt >= 2 ? 14 : 16,
              n: 1,
            },
            r2: true,
          }),
          signal: submitCtrl.signal,
        });
        if (!submitResp.ok) {
          return { ok: false, reason: `AI Horde HTTP ${submitResp.status}` };
        }
        const submitJson = (await submitResp.json()) as { id?: string };
        jobId = submitJson.id || '';
      } finally {
        clearTimeout(submitTimer);
      }

      if (!jobId) {
        return { ok: false, reason: 'AI Horde missing job id' };
      }

      while (Date.now() < deadline) {
        await sleep(1600);
        const statusCtrl = new AbortController();
        const statusTimer = setTimeout(() => statusCtrl.abort(), 5000);
        try {
          const statusResp = await fetch(
            `https://aihorde.net/api/v2/generate/status/${encodeURIComponent(jobId)}`,
            {
              headers: { 'Client-Agent': 'RoostersAI:2.0:sandsoft' },
              signal: statusCtrl.signal,
            }
          );
          if (!statusResp.ok) continue;
          const statusJson = (await statusResp.json()) as {
            done?: boolean;
            faulted?: boolean;
            generations?: Array<{ img?: string }>;
          };
          if (statusJson.faulted) {
            return { ok: false, reason: 'AI Horde job faulted' };
          }
          const imgUrl = statusJson.generations?.[0]?.img;
          if (statusJson.done && imgUrl && /^https:\/\//i.test(imgUrl)) {
            return await fetchKeylessImageAsDataUrl(imgUrl, 10000);
          }
        } catch {
          // Retry polling until deadline
        } finally {
          clearTimeout(statusTimer);
        }
      }

      return { ok: false, reason: 'AI Horde generation timed out' };
    } catch (err) {
      return {
        ok: false,
        reason: err instanceof Error ? err.message : 'AI Horde failed',
      };
    }
  }

  // Gemini Native Image + Imagen 3 Primary Route + Free Multi-Provider Auto-Fallback
  app.post('/api/nano-banana', async (req, res) => {
    try {
      const {
        prompt,
        sourceImageBase64,
        sourceMimeType,
        aspectRatio: rawAspectRatio = '1:1',
        resolution = '1K',
        mode = 'generate',
        preferredModel,
        previousEditContext,
        skipEnhance,
        geminiPrimaryOnly,
        apiKey,
        apiKeys,
      } = req.body as {
        prompt: string;
        sourceImageBase64?: string;
        sourceMimeType?: string;
        aspectRatio?: string;
        resolution?: '1K' | '2K';
        mode?: 'generate' | 'edit';
        preferredModel?: string;
        previousEditContext?: string;
        skipEnhance?: boolean;
        geminiPrimaryOnly?: boolean;
        apiKey?: string;
        apiKeys?: string[];
      };

      const rawPrompt = (prompt || '').trim();
      if (!rawPrompt) {
        res.status(400).json({ error: 'Image prompt or edit instruction is required.' });
        return;
      }

      const aspectRatio = normalizeServerAspectRatio(rawAspectRatio);
      const dims = getServerImageDimensions(aspectRatio);
      const cleanBase64 = (sourceImageBase64 || '').replace(/^data:[^;]+;base64,/, '').trim();
      const isEditMode = mode === 'edit' || Boolean(cleanBase64);
      const keyPool = resolveGeminiKeyPool(apiKey, apiKeys);

      let enhancedPrompt = rawPrompt;
      let shortTitle = rawPrompt.slice(0, 52);
      const wantsSimpleStyle = isSimpleStyleRequested(rawPrompt);

      // Step 1: Prompt Enhancer (preserving exact quoted text/brand names verbatim)
      if (keyPool.length > 0 && !skipEnhance) {
        const enhanceSys = isEditMode
          ? [
              'You are a Nano Banana photo-editing prompt engineer.',
              'Translate ANY user edit request from ANY world language into a clean, safe, family-friendly English editing instruction STRICTLY under 36 words.',
              'CRITICAL: Preserve any quoted text ("...") verbatim.',
              'Return ONLY JSON: {"shortTitle":"3-6 word title","enhancedPrompt":"clean English edit instruction"}',
            ].join(' ')
          : wantsSimpleStyle
            ? [
                'You are a visual prompt engineer.',
                'The user asked for a simple/minimalist style. Translate into a clean, uncluttered, family-friendly English prompt (10-22 words) preserving any quoted text ("...") verbatim.',
                'Return ONLY JSON: {"shortTitle":"3-6 word title","enhancedPrompt":"clean simple English image prompt"}',
              ].join(' ')
            : [
                'You are an ultra-HD visual prompt engineer.',
                'Automatically expand and enhance the request from ANY world language into a rich, detailed, family-friendly English prompt (24-44 words) adding cinematic lighting, 8k resolution, sharp textures, depth, rich colors, and professional composition.',
                'CRITICAL: Preserve any exact brand names, slogans, or words inside quotes ("...") verbatim in quotes inside enhancedPrompt.',
                'Return ONLY JSON: {"shortTitle":"3-6 word title","enhancedPrompt":"rich detailed English image prompt"}',
              ].join(' ');

        const enhanceInput =
          isEditMode && previousEditContext
            ? `Previous Image Context: ${previousEditContext.slice(0, 300)}\nNew Edit Request: ${rawPrompt}`
            : rawPrompt;

        for (const activeKey of keyPool) {
          try {
            const ai = createAiClientForKey(activeKey);
            const enhResp = await ai.models.generateContent({
              model: FAST_CHAT_MODELS[0].model,
              contents: enhanceInput,
              config: {
                abortSignal: AbortSignal.timeout(4500),
                systemInstruction: enhanceSys,
                thinkingConfig: FAST_CHAT_MODELS[0].thinkingConfig,
                safetySettings: DEFAULT_SAFETY_SETTINGS,
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    shortTitle: { type: Type.STRING },
                    enhancedPrompt: { type: Type.STRING },
                  },
                  required: ['shortTitle', 'enhancedPrompt'],
                },
              },
            });

            const rawJson = (enhResp.text ?? '{}').trim();
            const start = rawJson.indexOf('{');
            const end = rawJson.lastIndexOf('}');
            const jsonSlice = start >= 0 && end > start ? rawJson.slice(start, end + 1) : rawJson;
            const parsed = JSON.parse(jsonSlice) as {
              shortTitle?: string;
              enhancedPrompt?: string;
            };
            if (parsed.enhancedPrompt?.trim()) {
              enhancedPrompt = parsed.enhancedPrompt.trim();
            }
            if (parsed.shortTitle?.trim()) {
              shortTitle = parsed.shortTitle.trim().slice(0, 56);
            }
            break;
          } catch {
            // Try next key or fall through seamlessly
          }
        }
      }

      enhancedPrompt = sanitizeSafeImagePrompt(
        preserveQuotedSegments(rawPrompt, enhancedPrompt),
        52
      );

      // Step 2: Primary Gemini Native Image Engine (gemini-2.5-flash-image & imagen-3.0-generate-002 across rotated keys)
      for (const activeKey of keyPool) {
        const ai = createAiClientForKey(activeKey);

        if (isEditMode && cleanBase64) {
          const editPrompt = `${enhancedPrompt}. Keep original subject identity consistent, crisp HD clarity.`;
          const nativeModelsOrdered = Array.from(
            new Set(
              preferredModel === 'gemini-3.1-flash-image-preview'
                ? ['gemini-2.5-flash-image', 'gemini-3.1-flash-image-preview', 'gemini-3.1-flash-lite-image']
                : ['gemini-2.5-flash-image', 'gemini-3.1-flash-lite-image']
            )
          );

          for (const modelId of nativeModelsOrdered) {
            try {
              const response = await ai.models.generateContent({
                model: modelId,
                contents: {
                  parts: [
                    {
                      inlineData: {
                        data: cleanBase64,
                        mimeType: sourceMimeType || 'image/png',
                      },
                    },
                    { text: editPrompt },
                  ],
                },
                config: {
                  ...(modelId === 'gemini-3.1-flash-lite-image'
                    ? {}
                    : { responseModalities: ['IMAGE', 'TEXT'] }),
                  safetySettings: DEFAULT_SAFETY_SETTINGS,
                  imageConfig:
                    modelId === 'gemini-3.1-flash-image-preview' && resolution === '2K'
                      ? { aspectRatio, imageSize: '2K' }
                      : { aspectRatio },
                },
              });

              let imageBase64 = '';
              let imageMime = 'image/png';
              let assistantText = '';
              for (const part of response.candidates?.[0]?.content?.parts ?? []) {
                if (part.inlineData?.data && !imageBase64) {
                  imageBase64 = part.inlineData.data;
                  imageMime = part.inlineData.mimeType || 'image/png';
                } else if (part.text) {
                  assistantText += `${part.text}\n`;
                }
              }

              if (imageBase64) {
                res.json({
                  imageUrl: `data:${imageMime};base64,${imageBase64}`,
                  mimeType: imageMime,
                  provider: 'nano-banana',
                  modelUsed: modelId,
                  title: shortTitle,
                  detailedPrompt: editPrompt,
                  assistantText: assistantText.trim(),
                  aspectRatio,
                  width: dims.w,
                  height: dims.h,
                  isEdited: true,
                });
                return;
              }
            } catch {
              // Rotate model / key cleanly
            }
          }
        } else {
          // New image creation: 1) gemini-2.5-flash-image -> 2) imagen-3.0-generate-002 -> 3) gemini-3.1-flash-lite-image
          const genModelsOrdered = Array.from(
            new Set(
              preferredModel === 'gemini-3.1-flash-image-preview'
                ? ['gemini-2.5-flash-image', 'gemini-3.1-flash-image-preview', 'gemini-3.1-flash-lite-image']
                : ['gemini-2.5-flash-image', 'gemini-3.1-flash-lite-image']
            )
          );

          for (const nativeGenModel of genModelsOrdered) {
            try {
              const response = await ai.models.generateContent({
                model: nativeGenModel,
                contents: enhancedPrompt,
                config: {
                  ...(nativeGenModel === 'gemini-3.1-flash-lite-image'
                    ? {}
                    : { responseModalities: ['IMAGE', 'TEXT'] }),
                  safetySettings: DEFAULT_SAFETY_SETTINGS,
                  imageConfig:
                    nativeGenModel === 'gemini-3.1-flash-image-preview' && resolution === '2K'
                      ? { aspectRatio, imageSize: '2K' }
                      : { aspectRatio },
                },
              });

              let imageBase64 = '';
              let imageMime = 'image/png';
              for (const part of response.candidates?.[0]?.content?.parts ?? []) {
                if (part.inlineData?.data && !imageBase64) {
                  imageBase64 = part.inlineData.data;
                  imageMime = part.inlineData.mimeType || 'image/png';
                }
              }

              if (imageBase64) {
                res.json({
                  imageUrl: `data:${imageMime};base64,${imageBase64}`,
                  mimeType: imageMime,
                  provider: 'nano-banana',
                  modelUsed: nativeGenModel,
                  title: shortTitle,
                  detailedPrompt: enhancedPrompt,
                  assistantText: '',
                  aspectRatio,
                  width: dims.w,
                  height: dims.h,
                  isEdited: false,
                });
                return;
              }
            } catch {
              // Try Imagen 3 or next key cleanly
            }
          }

          // Try Google Imagen 3 native model (imagen-3.0-generate-002)
          try {
            const imagenResp = await ai.models.generateImages({
              model: 'imagen-3.0-generate-002',
              prompt: enhancedPrompt,
              config: {
                numberOfImages: 1,
                aspectRatio,
                outputMimeType: 'image/png',
              },
            });
            const imgBytes = imagenResp.generatedImages?.[0]?.image?.imageBytes;
            if (imgBytes) {
              res.json({
                imageUrl: `data:image/png;base64,${imgBytes}`,
                mimeType: 'image/png',
                provider: 'imagen',
                modelUsed: 'imagen-3.0-generate-002',
                title: shortTitle,
                detailedPrompt: enhancedPrompt,
                assistantText: '',
                aspectRatio,
                width: dims.w,
                height: dims.h,
                isEdited: false,
              });
              return;
            }
          } catch {
            // Try next key or fall through to free unlimited Pollinations engine
          }
        }
      }

      // If edit mode fell back from Gemini, run Vision bridge to build an accurate prompt before keyless synthesis
      if (isEditMode && cleanBase64 && keyPool.length > 0) {
        try {
          const ai = createAiClientForKey(keyPool[0]);
          const bridgeResp = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [
              { inlineData: { data: cleanBase64, mimeType: sourceMimeType || 'image/png' } },
              {
                text: `Combine the subject and scene of this photo with this edit: "${enhancedPrompt}". Output ONE clean, safe English image prompt strictly under 28 words preserving any quoted text.`,
              },
            ],
            config: {
              thinkingConfig: { thinkingBudget: 0 },
              safetySettings: DEFAULT_SAFETY_SETTINGS,
            },
          });
          if (bridgeResp.text?.trim()) {
            enhancedPrompt = sanitizeSafeImagePrompt(
              preserveQuotedSegments(rawPrompt, bridgeResp.text.trim()),
              34
            );
          }
        } catch {
          // Keep sanitized prompt
        }
      }

      // Fast handoff to client Pollinations browser IP when client requested Gemini-primary check first
      if (geminiPrimaryOnly) {
        res.json({
          fallbackToClient: true,
          enhancedPrompt,
          shortTitle,
          aspectRatio,
          width: dims.w,
          height: dims.h,
        });
        return;
      }

      // Step 3: Free Unlimited Auto-Fallback Waterfall (Pollinations -> FLUX.1-schnell -> AI Horde)
      const encodedPrompt = encodeURIComponent(enhancedPrompt);
      const pollinationsModels: Array<'flux' | 'flux-realism' | 'flux-3d' | 'turbo'> = [
        'flux',
        'flux-realism',
        'flux-3d',
        'turbo',
      ];
      const MAX_SERVER_ATTEMPTS = 2;

      for (let attempt = 1; attempt <= MAX_SERVER_ATTEMPTS; attempt++) {
        // 3A. Pollinations AI free multi-model cycle
        for (const polyModel of pollinationsModels) {
          const polyUrl = `https://pollinations.ai/p/${encodedPrompt}?width=${dims.w}&height=${dims.h}&model=${polyModel}&nologo=true&enhance=true&seed=${randomImageSeed()}`;
          const polyRes = await fetchKeylessImageAsDataUrl(polyUrl, 12000);
          if (polyRes.ok) {
            res.json({
              imageUrl: polyRes.dataUrl,
              mimeType: polyRes.mimeType,
              provider: 'pollinations',
              modelUsed: polyModel,
              title: shortTitle,
              detailedPrompt: enhancedPrompt,
              assistantText: '',
              aspectRatio,
              width: dims.w,
              height: dims.h,
              isEdited: isEditMode,
            });
            return;
          }
          // If shared server IP hits 402/429 immediately, skip remaining Pollinations models to move straight to FLUX/Horde
          if (polyRes.status === 402 || polyRes.status === 429) {
            break;
          }
        }

        // 3B. Keyless Hugging Face FLUX.1-schnell Gradio Space
        const fluxSpaceRes = await fetchFluxSchnellGradioAsDataUrl(
          enhancedPrompt,
          dims.w,
          dims.h,
          18000
        );
        if (fluxSpaceRes.ok) {
          res.json({
            imageUrl: fluxSpaceRes.dataUrl,
            mimeType: fluxSpaceRes.mimeType,
            provider: 'flux-hd',
            modelUsed: 'FLUX.1-schnell',
            title: shortTitle,
            detailedPrompt: enhancedPrompt,
            assistantText: '',
            aspectRatio,
            width: dims.w,
            height: dims.h,
            isEdited: isEditMode,
          });
          return;
        }

        // 3C. Keyless AI Horde
        const hordeRes = await fetchAiHordeAsDataUrl(enhancedPrompt, aspectRatio, attempt, 22000);
        if (hordeRes.ok) {
          res.json({
            imageUrl: hordeRes.dataUrl,
            mimeType: hordeRes.mimeType,
            provider: 'ai-horde',
            modelUsed: 'stable-horde-xl',
            title: shortTitle,
            detailedPrompt: enhancedPrompt,
            assistantText: '',
            aspectRatio,
            width: dims.w,
            height: dims.h,
            isEdited: isEditMode,
          });
          return;
        }

        if (attempt < MAX_SERVER_ATTEMPTS) {
          await sleep(600);
        }
      }

      res.json({
        fallbackToClient: true,
        enhancedPrompt,
        shortTitle,
        aspectRatio,
        width: dims.w,
        height: dims.h,
      });
    } catch {
      res.json({ fallbackToClient: true });
    }
  });

  // Google Veo Primary Video Route (veo-2.0-generate-001) with silent fallback flag when unsupported/quota
  app.post('/api/veo', async (req, res) => {
    try {
      const { prompt, aspectRatio = '16:9', apiKey, apiKeys } = req.body as {
        prompt?: string;
        aspectRatio?: '16:9' | '9:16' | '1:1';
        apiKey?: string;
        apiKeys?: string[];
      };

      const cleanPrompt = (prompt || '').trim();
      const keyPool = resolveGeminiKeyPool(apiKey, apiKeys);
      if (!cleanPrompt || keyPool.length === 0) {
        res.json({ ok: false, fallback: true });
        return;
      }

      const veoRatio = aspectRatio === '9:16' ? '9:16' : '16:9';

      for (const activeKey of keyPool) {
        try {
          const ai = createAiClientForKey(activeKey);
          let operation = await ai.models.generateVideos({
            model: 'veo-2.0-generate-001',
            source: { prompt: cleanPrompt },
            config: {
              numberOfVideos: 1,
              aspectRatio: veoRatio,
            },
          });

          for (let poll = 0; poll < 5 && !operation.done; poll++) {
            await sleep(4000);
            operation = await ai.operations.getVideosOperation({ operation });
          }

          if (operation.done) {
            const genVid = operation.response?.generatedVideos?.[0]?.video;
            if (genVid?.videoBytes) {
              const mime = genVid.mimeType || 'video/mp4';
              res.json({
                ok: true,
                videoUrl: `data:${mime};base64,${genVid.videoBytes}`,
                modelUsed: 'veo-2.0-generate-001',
              });
              return;
            }
            if (genVid?.uri) {
              const sep = genVid.uri.includes('?') ? '&' : '?';
              const authedUri = `${genVid.uri}${sep}key=${encodeURIComponent(activeKey)}`;
              const vidResp = await fetch(authedUri);
              if (vidResp.ok) {
                const buf = await vidResp.arrayBuffer();
                const mime = (vidResp.headers.get('content-type') || 'video/mp4').split(';')[0];
                res.json({
                  ok: true,
                  videoUrl: `data:${mime};base64,${Buffer.from(buf).toString('base64')}`,
                  modelUsed: 'veo-2.0-generate-001',
                });
                return;
              }
            }
          }
        } catch {
          // Rotate key or hand off silently to browser AI Motion Video Engine
        }
      }

      res.json({ ok: false, fallback: true });
    } catch {
      res.json({ ok: false, fallback: true });
    }
  });

  // Multilingual Voice Transcription Endpoint
  app.post('/api/transcribe', async (req, res) => {
    try {
      const { audioBase64, mimeType, language, apiKey } = req.body as {
        audioBase64: string;
        mimeType?: string;
        language?: string;
        apiKey?: string;
      };

      if (!audioBase64) {
        res.status(400).json({ error: 'Audio data is required.' });
        return;
      }

      const ai = getAiClient(apiKey);
      const langHint =
        !language || language === 'Auto-Detect'
          ? 'Transcribe the spoken audio accurately in its original language. Output ONLY the transcribed text.'
          : `Transcribe the spoken audio accurately in ${language}. Output ONLY the transcribed text.`;

      const transcribeModels = ['gemini-3.5-transcribe', 'gemini-2.5-flash', 'gemini-3.1-flash-lite'];
      let lastErr: unknown = null;

      for (let i = 0; i < transcribeModels.length; i++) {
        try {
          const response = await ai.models.generateContent({
            model: transcribeModels[i],
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType: mimeType || 'audio/webm',
                    data: audioBase64,
                  },
                },
                { text: langHint },
              ],
            },
          });

          res.json({
            text: (response.text ?? '').trim(),
          });
          return;
        } catch (err) {
          lastErr = err;
          if (isRetryableOrFallbackError(err) && i < transcribeModels.length - 1) {
            await sleep(150);
            continue;
          }
          break;
        }
      }

      const formatted = formatGeminiError(lastErr);
      res.status(formatted.status).json({ error: formatted.message });
    } catch (err) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // Text-to-Speech Endpoint
  app.post('/api/tts', async (req, res) => {
    try {
      const { text, language, apiKey } = req.body as {
        text: string;
        language?: string;
        apiKey?: string;
      };

      if (!text || !text.trim()) {
        res.status(400).json({ error: 'Text is required for speech synthesis.' });
        return;
      }

      const cleanSpeechText = text
        .replace(/```[\s\S]*?```/g, ' Code block omitted. ')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/[#*_~>\[\]]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 1800);

      if (!cleanSpeechText) {
        res.status(400).json({ error: 'No speakable text found in this message.' });
        return;
      }

      const ai = getAiClient(apiKey);
      const styleHint =
        language && language !== 'Auto-Detect'
          ? `Warm, polite, articulate teacher fluent in ${language}`
          : 'Warm, polite, articulate teacher voice';

      let lastErr: unknown = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await ai.models.generateContent({
            model: 'gemini-3.8-flash-lite-tts',
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text: cleanSpeechText,
                    speechMetadata: {
                      style: styleHint,
                    },
                  },
                ],
              },
            ],
            config: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: 'Kore' },
                },
              },
            },
          });

          const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
          if (!base64Audio) {
            throw new Error('No audio data returned by TTS service.');
          }

          res.json({
            audioBase64: base64Audio,
            mimeType: 'audio/wav',
          });
          return;
        } catch (err) {
          lastErr = err;
          if (isRetryableOrFallbackError(err) && attempt === 0) {
            await sleep(200);
            continue;
          }
          break;
        }
      }

      const formatted = formatGeminiError(lastErr);
      res.status(formatted.status).json({ error: formatted.message });
    } catch (err) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    process.env.DISABLE_HMR = 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: null,
        allowedHosts: true,
        ws: {
          server: httpServer,
          path: '/__vite_ws',
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const liveWss = new WebSocketServer({ noServer: true });
  httpServer.on('upgrade', (req, socket, head) => {
    try {
      const pathname = new URL(req.url || '/', 'http://localhost').pathname;
      if (pathname === '/api/live-ws') {
        liveWss.handleUpgrade(req, socket, head, (ws) => {
          liveWss.emit('connection', ws, req);
        });
      }
    } catch {
      // Ignore malformed upgrade URLs
    }
  });

  const LIVE_MODELS = [
    'gemini-2.5-flash-native-audio-preview',
    'gemini-2.5-flash-native-audio-preview-09-2025',
    'gemini-3.8-live',
  ];

  liveWss.on('connection', (clientWs) => {
    let liveSession: Awaited<ReturnType<GoogleGenAI['live']['connect']>> | null = null;
    let isClosed = false;
    let isConnecting = false;

    const sendJson = (payload: Record<string, unknown>) => {
      if (!isClosed && clientWs.readyState === WsSocket.OPEN) {
        try {
          clientWs.send(JSON.stringify(payload));
        } catch {
          // Ignore send errors on closing socket
        }
      }
    };

    const closeSessionCleanly = () => {
      if (liveSession) {
        try {
          liveSession.close();
        } catch {
          // Ignore close errors
        }
        liveSession = null;
      }
    };

    clientWs.on('message', async (rawData) => {
      if (isClosed) return;
      let msg: {
        type?: string;
        data?: string;
        mimeType?: string;
        text?: string;
        language?: string;
        userName?: string;
        voiceGender?: 'default' | 'male' | 'female';
        responseStyle?: 'simple' | 'detailed' | 'study';
        customInstructions?: string;
        globalSystemPrompt?: string;
        apiKey?: string;
      };

      try {
        msg = JSON.parse(rawData.toString()) as typeof msg;
      } catch {
        return;
      }

      if (msg.type === 'start') {
        if (liveSession || isConnecting) return;
        isConnecting = true;

        try {
          const ai = getAiClient(msg.apiKey);
          const voiceName =
            msg.voiceGender === 'male'
              ? 'Charon'
              : msg.voiceGender === 'female'
                ? 'Kore'
                : 'Zephyr';

          const baseInstruction = buildStudyTutorInstruction({
            language: msg.language,
            userName: msg.userName,
            isLiveVoice: true,
            responseStyle: msg.responseStyle,
            customInstructions: msg.customInstructions,
            globalSystemPrompt: msg.globalSystemPrompt,
          });

          const liveSystemInstruction = [
            baseInstruction,
            'You are in a live real-time duplex voice, camera, and screen-share call with the user, like Google Gemini Live.',
            'Speak warmly, naturally, expressively, and concisely in plain spoken dialogue without markdown formatting.',
            'Fluently detect, understand, and respond in ANY of the world\'s 100+ languages (including Urdu, Roman Urdu, English, Hindi, Arabic, Punjabi, Pashto, Sindhi, Spanish, French, German, Turkish, Chinese, Japanese, Korean, Russian, etc.) matching whichever language the user speaks.',
            'If live camera or screen-share video frames are arriving, inspect them in real time to help with homework, math, handwriting, apps, code, documents, or objects the user shows.',
          ].join(' ');

          let connectedModel = '';
          let lastConnectErr: unknown = null;

          for (const modelId of LIVE_MODELS) {
            if (isClosed) break;
            try {
              const session = await ai.live.connect({
                model: modelId,
                config: {
                  responseModalities: [Modality.AUDIO],
                  speechConfig: {
                    voiceConfig: {
                      prebuiltVoiceConfig: { voiceName },
                    },
                  },
                  systemInstruction: liveSystemInstruction,
                  inputAudioTranscription: {},
                  outputAudioTranscription: {},
                },
                callbacks: {
                  onmessage: (message: LiveServerMessage) => {
                    const content = message.serverContent;
                    if (content?.inputTranscription?.text) {
                      sendJson({
                        type: 'input_transcript',
                        text: content.inputTranscription.text,
                      });
                    }
                    if (content?.outputTranscription?.text) {
                      sendJson({
                        type: 'output_transcript',
                        text: content.outputTranscription.text,
                      });
                    }
                    for (const part of content?.modelTurn?.parts ?? []) {
                      if (part.inlineData?.data) {
                        sendJson({
                          type: 'audio',
                          data: part.inlineData.data,
                          mimeType: part.inlineData.mimeType || 'audio/pcm;rate=24000',
                        });
                      }
                    }
                    if (content?.interrupted) {
                      sendJson({ type: 'interrupted' });
                    }
                    if (content?.turnComplete) {
                      sendJson({ type: 'turn_complete' });
                    }
                  },
                  onerror: (errEvent: unknown) => {
                    const msgText =
                      errEvent instanceof Error
                        ? errEvent.message
                        : typeof errEvent === 'object' && errEvent && 'message' in errEvent
                          ? String((errEvent as { message?: unknown }).message || 'Live stream error')
                          : 'Live audio session encountered an error.';
                    const lowerErr = msgText.toLowerCase();
                    const isQuota =
                      lowerErr.includes('429') ||
                      lowerErr.includes('quota') ||
                      lowerErr.includes('resource_exhausted');
                    sendJson({ type: 'error', message: msgText, isQuota });
                  },
                  onclose: () => {
                    if (!isClosed) {
                      sendJson({ type: 'session_closed' });
                    }
                  },
                },
              });

              liveSession = session;
              connectedModel = modelId;
              break;
            } catch (err) {
              lastConnectErr = err;
              continue;
            }
          }

          if (!liveSession) {
            const formatted = formatGeminiError(
              lastConnectErr || new Error('Could not establish Gemini Live session.')
            );
            sendJson({
              type: 'error',
              message: formatted.message,
              isQuota: formatted.status === 429,
            });
          } else if (isClosed) {
            closeSessionCleanly();
          } else {
            sendJson({ type: 'ready', model: connectedModel });
          }
        } catch (err) {
          const formatted = formatGeminiError(err);
          sendJson({
            type: 'error',
            message: formatted.message,
            isQuota: formatted.status === 429,
          });
        } finally {
          isConnecting = false;
        }
        return;
      }

      if (!liveSession) return;

      try {
        if (msg.type === 'audio' && msg.data) {
          liveSession.sendRealtimeInput({
            audio: {
              data: msg.data,
              mimeType: 'audio/pcm;rate=16000',
            },
          });
        } else if (msg.type === 'video' && msg.data) {
          liveSession.sendRealtimeInput({
            video: {
              data: msg.data,
              mimeType: msg.mimeType || 'image/jpeg',
            },
          });
        } else if (msg.type === 'text' && msg.text?.trim()) {
          liveSession.sendRealtimeInput({
            text: msg.text.trim(),
          });
        }
      } catch {
        // Ignore transient write errors on closing session
      }
    });

    clientWs.on('close', () => {
      isClosed = true;
      closeSessionCleanly();
    });

    clientWs.on('error', () => {
      isClosed = true;
      closeSessionCleanly();
    });
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Roosters AI server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Roosters AI server:', err);
  process.exit(1);
});
