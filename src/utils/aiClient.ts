import { loadCustomApiKey } from './storage';
import { GeneratedVideo, VideoScene } from '../types';

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
}): string {
  const { language, userName, isLiveVoice } = options;
  const langRule =
    !language || language === 'Auto-Detect'
      ? "Match the user's latest message language naturally (such as English, Urdu, or Roman Urdu)."
      : `Reply fluently in ${language}.`;

  const baseInstruction =
    "You are Roosters AI, a helpful and polite AI assistant created by SandSoft. By default, always give clear, simple, direct, and concise answers in plain conversational language (matching the user's language, such as English, Urdu, or Roman Urdu). Do NOT add long headings, bulleted study notes, or practice questions unless the user explicitly asks for 'study notes', 'notes', 'questions', or a detailed explanation.";

  const multimodalCore =
    'You have full permission and ability to view, read, and analyze any photo, screenshot, or document uploaded by the user, including handwritten notes and images.';

  if (isLiveVoice) {
    return [
      baseInstruction,
      userName ? `You are warmly assisting ${userName}.` : '',
      multimodalCore,
      'Speak naturally in 2–4 concise, clear sentences without markdown symbols or code fences unless asked.',
      langRule,
    ]
      .filter(Boolean)
      .join(' ');
  }

  return [
    baseInstruction,
    userName ? `You are assisting ${userName}.` : '',
    multimodalCore,
    'Format code in fenced markdown blocks with language tags only when code is requested or relevant.',
    'NEVER output ASCII art, text-character drawings, or box-art diagrams when asked for a picture, image, photo, or video.',
    langRule,
  ]
    .filter(Boolean)
    .join(' ');
}

export function detectChatMediaIntent(
  rawText: string,
  hasAttachment: boolean
): 'video' | 'image' | 'chat' {
  if (hasAttachment) return 'chat';
  const text = rawText.trim();
  if (!text || text.length > 500) return 'chat';
  const lower = text.toLowerCase();

  // Exclude coding/explanatory/tutorial questions unless explicitly asking to render an image/video directly
  const isTutorialOrCodeQuestion =
    /\b(how to|how do i|explain|what is|html|css|python|javascript|react|code for|script for|algorithm|tag|tutorial|difference between)\b/i.test(
      lower
    ) && !/\b(pic banao|tasveer banao|tasweer banao|video banao|generate image|create video)\b/i.test(lower);

  if (isTutorialOrCodeQuestion) return 'chat';

  // 1. Video intent (check first so "video banao" / "create video" always triggers Video Generator)
  const videoPatterns: RegExp[] = [
    /\b(create|generate|make|render|produce|animate|build|show)\s+(me\s+)?(a\s+|an\s+|the\s+|some\s+)?(short\s+|cinematic\s+|ai\s+|hd\s+|animated\s+)?(video|clip|animation|movie|reel|short\s*film)\b/i,
    /\b(video|clip|reel|animation)\s+(of|about|for|on)\b/i,
    /\b(video|veedio|vedio|clip|reel|animation)\s*(banao|bana\s*do|banado|bnao|taiyar\s*karo|dikhao|chahiye)\b/i,
    /\b(banao|bana\s*do|banado)\s*(ek\s+)?(video|clip|reel|animation)\b/i,
    /(ویڈیو\s*(بنائیں|بناؤ|بنا\s*دو|دکھائیں)|فيديو|إنشاء\s+فيديو|वीडियो\s*(बनाओ|बनाएं|बना\s*दो)|créer\s+une\s+vidéo|generar\s+(un\s+)?vídeo|crear\s+(un\s+)?video|video\s+erstellen|buat\s+video)/i,
  ];
  if (videoPatterns.some((rx) => rx.test(text))) {
    return 'video';
  }

  // 2. Image / Photo / Drawing intent in ANY language
  const imagePatterns: RegExp[] = [
    /\b(create|generate|make|draw|paint|sketch|render|design|illustrate|show)\s+(me\s+)?(a\s+|an\s+|some\s+|the\s+)?(hd\s+|4k\s+|real\s+|realistic\s+|photorealistic\s+|cute\s+|cool\s+|beautiful\s+)?(picture|pic|pics|image|img|photo|photograph|portrait|wallpaper|illustration|artwork|drawing|poster|avatar|painting|sketch)\b/i,
    /^(draw|paint|sketch|illustrate)\s+(a|an|the|me|some)?\s*\S+/i,
    /\b(picture|pic|image|photo|portrait)\s+of\b/i,
    /\b(pic|pics|picture|tasveer|tasweer|tasvir|taswir|photo|foto|image|img|drawing|sketch|chitra|portrait|wallpaper)\s*(banao|bana\s*do|banado|bnao|dikhao|nikalo|chahiye|khincho)\b/i,
    /\b(banao|bana\s*do|banado|draw\s*karo)\s*(ek\s+)?(pyari\s+si\s+|khoobsurat\s+|sundar\s+)?(pic|picture|tasveer|tasweer|tasvir|photo|image|sketch|drawing)\b/i,
    /(تصویر\s*(بنائیں|بناؤ|بنا\s*دو|دکھائیں)|صورة|ارسم|تصوير|चित्र\s*(बनाओ|बनाएं)|तस्वीर\s*(बनाओ|बनाएं)|फोटो\s*(बनाओ|बनाएं)|dessine|créer\s+une\s+image|generar\s+(una\s+)?imagen|dibujar|criar\s+imagem|bild\s+erstellen|buat\s+gambar|resim\s+(çiz|yap))/i,
  ];
  if (imagePatterns.some((rx) => rx.test(text))) {
    return 'image';
  }

  return 'chat';
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
  signal?: AbortSignal;
  onChunk: (text: string) => void;
}): Promise<string> {
  const systemPrompt = buildClientStudyTutorInstruction({
    language: params.language,
    userName: params.userName,
    isLiveVoice: params.isLiveVoice,
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
  signal?: AbortSignal;
  onChunk: (text: string) => void;
}): Promise<string> {
  const systemText = buildClientStudyTutorInstruction({
    language: params.language,
    userName: params.userName,
    isLiveVoice: params.isLiveVoice,
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

  const candidates = [
    { model: 'gemini-2.5-flash', thinkingConfig: { thinkingBudget: 0 } },
    { model: 'gemini-3.1-flash-lite', thinkingConfig: { thinkingLevel: 'MINIMAL' } },
  ];

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
    isLiveVoice: false,
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
  hasBackendApi: boolean;
  hasServerGeminiKey: boolean;
  signal?: AbortSignal;
  onChunk: (text: string) => void;
}): Promise<string> {
  const recentMessages = params.messages.slice(-10);
  const resolved = resolveActiveProvider(params.hasServerGeminiKey);
  const lastMsg = recentMessages[recentMessages.length - 1];
  const currentHasImage = Boolean(lastMsg?.attachment?.base64) && lastMsg?.attachment?.kind !== 'file';
  const hasAnyImageInHistory = recentMessages.some(
    (m) => Boolean(m.attachment?.base64) && m.attachment?.kind !== 'file'
  );

  // When the current message has an uploaded photo/screenshot, bypass Groq completely
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

export function buildSafeArtisticPrompt(rawInput: string): string {
  let text = rawInput
    .replace(
      /\b(create|generate|make|draw|paint|sketch|render|show|please|kindly|me|a|an|pic|pics|picture|tasveer|tasweer|tasvir|photo|foto|image|img|banao|bana do|banado|dikhao|chahiye)\b/gi,
      ' '
    )
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
      return 'Portrait of a friendly smiling woman wearing casual modern attire in a sunlit studio, warm natural lighting, ultra detailed, digital illustration, wholesome family-friendly artwork';
    }
    if (noun.includes('man') || noun.includes('boy') || noun.includes('larka')) {
      return 'Portrait of a friendly smiling young man wearing casual modern attire in a sunlit studio, warm natural lighting, ultra detailed, digital illustration, wholesome family-friendly artwork';
    }
    return 'Portrait of a friendly smiling person wearing casual modern attire in a sunlit contemporary studio, warm golden hour lighting, ultra detailed, digital illustration, wholesome family-friendly art';
  }

  // If the prompt mentions a human/person briefly without artistic scene context, frame it safely
  const hasHumanNoun = /\b(human|person|people|man|woman|boy|girl|child|student|teacher|doctor|astronaut|face|portrait)\b/i.test(
    text
  );
  if (hasHumanNoun && text.split(/\s+/).length <= 5) {
    return `Artistic portrait of a friendly ${text} in wholesome modern attire, bright sunlit studio background, warm natural lighting, ultra detailed, digital illustration, family-friendly`;
  }

  const hasStyleWords = /\b(illustration|digital art|painting|photorealistic|studio|lighting|detailed|cinematic|wholesome)\b/i.test(
    text
  );
  if (hasStyleWords) {
    return `${text}, wholesome family-friendly digital artwork, crisp focus, balanced warm lighting`;
  }

  return `${text}, vivid artistic digital illustration, warm natural lighting, ultra detailed, crisp focus, wholesome family-friendly composition`;
}

function buildProceduralFallbackSvg(title: string, width: number, height: number): string {
  const safeTitle = title.replace(/[<>&"']/g, '').slice(0, 48) || 'Roosters AI Artwork';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0b132b"/>
        <stop offset="50%" stop-color="#1c2541"/>
        <stop offset="100%" stop-color="#0f2942"/>
      </linearGradient>
      <radialGradient id="sun" cx="50%" cy="38%" r="42%">
        <stop offset="0%" stop-color="#ffd700" stop-opacity="0.75"/>
        <stop offset="55%" stop-color="#00d4ff" stop-opacity="0.28"/>
        <stop offset="100%" stop-color="#0b132b" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#bg)"/>
    <rect width="100%" height="100%" fill="url(#sun)"/>
    <circle cx="${Math.round(width * 0.5)}" cy="${Math.round(height * 0.38)}" r="${Math.round(Math.min(width, height) * 0.16)}" fill="#ffd700" fill-opacity="0.18" stroke="#ffd700" stroke-opacity="0.55" stroke-width="2"/>
    <path d="M0 ${Math.round(height * 0.72)} Q ${Math.round(width * 0.25)} ${Math.round(height * 0.58)} ${Math.round(width * 0.52)} ${Math.round(height * 0.7)} T ${width} ${Math.round(height * 0.66)} L ${width} ${height} L 0 ${height} Z" fill="#07090e" fill-opacity="0.68"/>
    <path d="M0 ${Math.round(height * 0.8)} Q ${Math.round(width * 0.35)} ${Math.round(height * 0.68)} ${Math.round(width * 0.68)} ${Math.round(height * 0.8)} T ${width} ${Math.round(height * 0.76)} L ${width} ${height} L 0 ${height} Z" fill="#050608" fill-opacity="0.88"/>
    <text x="50%" y="${Math.round(height * 0.9)}" text-anchor="middle" fill="#ffd700" font-family="sans-serif" font-size="${Math.round(width * 0.03)}" font-weight="700">${safeTitle}</text>
  </svg>`;
  return svg;
}

async function blobToCompactDataUrl(blob: Blob, maxWidth = 896): Promise<string | null> {
  try {
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

      const scale = Math.min(1, maxWidth / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(64, Math.round(img.naturalWidth * scale));
      const h = Math.max(64, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, w, h);
      return canvas.toDataURL('image/jpeg', 0.84);
    } finally {
      URL.revokeObjectURL(objUrl);
    }
  } catch {
    return null;
  }
}

async function tryPollinationsImage(params: {
  safePrompt: string;
  width: number;
  height: number;
  onStatus?: (msg: string) => void;
}): Promise<{ ok: true; imageUrl: string } | { ok: false; reason: string }> {
  const seed = Math.floor(Math.random() * 100000);
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(
    params.safePrompt
  )}?width=${params.width}&height=${params.height}&nologo=true&seed=${seed}`;

  params.onStatus?.('Generating HD image...');

  try {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 24000);
    try {
      const resp = await fetch(url, { mode: 'cors', signal: controller.signal });
      if (!resp.ok) {
        return { ok: false, reason: `Primary returned status ${resp.status}` };
      }

      const contentType = (resp.headers.get('content-type') || '').toLowerCase();
      if (!contentType.startsWith('image/')) {
        return { ok: false, reason: 'Primary returned non-image response' };
      }

      const blob = await resp.blob();
      if (blob.size < 9000) {
        return { ok: false, reason: 'Primary returned temporary placeholder' };
      }

      const dataUrl = await blobToCompactDataUrl(blob, Math.max(params.width, params.height));
      if (dataUrl) {
        return { ok: true, imageUrl: dataUrl };
      }
      return { ok: true, imageUrl: url };
    } finally {
      window.clearTimeout(timeoutId);
    }
  } catch {
    // Even if CORS blob verification fails, direct URL can still render cleanly in <img>
    return { ok: true, imageUrl: url };
  }
}

function getHordeDimensions(aspectRatio: '1:1' | '16:9' | '4:3'): { w: number; h: number } {
  // Anonymous AI Horde fast queue dimensions (multiples of 64, max ~512-640px for zero kudos)
  if (aspectRatio === '16:9') return { w: 640, h: 384 };
  if (aspectRatio === '4:3') return { w: 576, h: 448 };
  return { w: 512, h: 512 };
}

async function tryAiHordeImage(params: {
  safePrompt: string;
  aspectRatio: '1:1' | '16:9' | '4:3';
  onStatus?: (msg: string) => void;
}): Promise<{ ok: true; imageUrl: string } | { ok: false; reason: string }> {
  const dims = getHordeDimensions(params.aspectRatio);
  params.onStatus?.('Routing to Free AI Horde Studio (bypassing 45s limit)...');

  try {
    const submitResp = await fetch('https://stablehorde.net/api/v2/generate/async', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: '0000000000',
        'Client-Agent': 'RoostersAI:2.0:sandsoft',
      },
      body: JSON.stringify({
        prompt: `${params.safePrompt} ### nsfw, nude, violence, gore, watermark, blurry, text, deformed`,
        params: {
          sampler_name: 'k_euler_a',
          cfg_scale: 7,
          steps: 20,
          width: dims.w,
          height: dims.h,
          n: 1,
        },
        nsfw: false,
        censor_nsfw: true,
        trusted_workers: false,
        slow_workers: true,
        r2: true,
      }),
    });

    if (!submitResp.ok) {
      return { ok: false, reason: `AI Horde queue busy (${submitResp.status})` };
    }

    const submitData = (await submitResp.json()) as { id?: string; message?: string };
    const jobId = submitData.id;
    if (!jobId) {
      return { ok: false, reason: submitData.message || 'AI Horde did not return a job ID' };
    }

    const startedAt = Date.now();
    const maxWaitMs = 55_000;

    while (Date.now() - startedAt < maxWaitMs) {
      await new Promise((r) => setTimeout(r, 2200));

      const checkResp = await fetch(`https://stablehorde.net/api/v2/generate/check/${jobId}`, {
        headers: { 'Client-Agent': 'RoostersAI:2.0:sandsoft' },
      });
      if (!checkResp.ok) continue;

      const checkData = (await checkResp.json()) as {
        done?: boolean;
        faulted?: boolean;
        queue_position?: number;
        wait_time?: number;
        processing?: number;
      };

      if (checkData.faulted) {
        return { ok: false, reason: 'AI Horde worker faulted' };
      }

      if (checkData.done) {
        break;
      }

      const waitHint = checkData.wait_time ? `~${checkData.wait_time}s` : 'rendering';
      const queueHint =
        typeof checkData.queue_position === 'number' && checkData.queue_position > 0
          ? `Queue #${checkData.queue_position}, `
          : '';
      params.onStatus?.(`Free AI Horde generating (${queueHint}${waitHint})...`);
    }

    const statusResp = await fetch(`https://stablehorde.net/api/v2/generate/status/${jobId}`, {
      headers: { 'Client-Agent': 'RoostersAI:2.0:sandsoft' },
    });
    if (!statusResp.ok) {
      return { ok: false, reason: 'Could not retrieve AI Horde image result' };
    }

    const statusData = (await statusResp.json()) as {
      done?: boolean;
      generations?: Array<{ img?: string; censored?: boolean }>;
    };
    const imgRaw = statusData.generations?.[0]?.img;
    if (!imgRaw) {
      return { ok: false, reason: 'AI Horde finished without an image frame' };
    }

    // Convert R2 image URL to compact JPEG DataURL so saved chats & Canvas export never expire or CORS-taint
    if (imgRaw.startsWith('http')) {
      try {
        const imgResp = await fetch(imgRaw, { mode: 'cors' });
        if (imgResp.ok) {
          const blob = await imgResp.blob();
          const dataUrl = await blobToCompactDataUrl(blob, 768);
          if (dataUrl) return { ok: true, imageUrl: dataUrl };
        }
      } catch {
        // Fall back to direct R2 URL if CORS conversion fails
      }
      return { ok: true, imageUrl: imgRaw };
    }

    // Base64 fallback (rare when r2=true)
    const dataSrc = imgRaw.startsWith('data:') ? imgRaw : `data:image/webp;base64,${imgRaw}`;
    return { ok: true, imageUrl: dataSrc };
  } catch {
    return { ok: false, reason: 'AI Horde network connection failed' };
  }
}

export async function translatePromptToDetailedEnglish(params: {
  rawPrompt: string;
  hasBackendApi: boolean;
  hasServerGeminiKey: boolean;
}): Promise<{ detailedPrompt: string; shortTitle: string }> {
  const cleaned = params.rawPrompt.trim();
  const translated = await runQuickTextCompletion({
    systemPrompt: [
      'You are an expert, family-friendly visual prompt enhancer.',
      'Convert ANY user request from ANY language (English, Urdu, Roman Urdu, Hindi, Arabic, Spanish, etc.) into a safe, wholesome, vivid, artistic English description (under 40 words).',
      'If the input is short or ambiguous (like "make pic of human", "person", "girl", "boy"), expand it into a warm, friendly artistic portrait (e.g., "Portrait of a friendly smiling person wearing modern casual attire in a sunlit studio, ultra detailed, digital illustration").',
      'Strip command words like "pic banao", "generate image", "draw me". Never include unsafe, explicit, or violent terms.',
      'Return ONLY JSON: {"title":"short 3-6 word title","detailedPrompt":"safe vivid artistic English prompt"}',
    ].join(' '),
    userPrompt: cleaned,
    hasBackendApi: params.hasBackendApi,
    hasServerGeminiKey: params.hasServerGeminiKey,
    maxTokens: 220,
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
            detailedPrompt: buildSafeArtisticPrompt(parsed.detailedPrompt.trim()),
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
      /\b(create|generate|make|draw|paint|sketch|render|show|please|kindly|me|a|an|pic|picture|tasveer|tasweer|photo|image|banao|bana do|banado|dikhao|chahiye)\b/gi,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim();

  return {
    shortTitle: (titleCandidate || 'HD AI Artwork').slice(0, 52),
    detailedPrompt: safePrompt,
  };
}

async function resolveImageWithFallback(params: {
  safePrompt: string;
  aspectRatio: '1:1' | '16:9' | '4:3';
  pollinationsDims: { w: number; h: number };
  title: string;
  language?: string;
  hasBackendApi: boolean;
  hasServerGeminiKey: boolean;
  onStatus?: (msg: string) => void;
}): Promise<{
  imageUrl?: string;
  svgCode?: string;
  provider: 'pollinations' | 'horde' | 'svg';
}> {
  // 1. Primary: Pollinations (only when outside 45s cooldown)
  const pollinationsRes = await tryPollinationsImage({
    safePrompt: params.safePrompt,
    width: params.pollinationsDims.w,
    height: params.pollinationsDims.h,
    onStatus: params.onStatus,
  });
  if (pollinationsRes.ok) {
    return { imageUrl: pollinationsRes.imageUrl, provider: 'pollinations' };
  }

  // 2. Fallback: Free Public AI Horde API (bypasses Pollinations 45s cooldown & refusals)
  params.onStatus?.(`${pollinationsRes.reason} — switching to Free AI Horde...`);
  const hordeRes = await tryAiHordeImage({
    safePrompt: params.safePrompt,
    aspectRatio: params.aspectRatio,
    onStatus: params.onStatus,
  });
  if (hordeRes.ok) {
    return { imageUrl: hordeRes.imageUrl, provider: 'horde' };
  }

  // 3. Optional backend Gemini SVG fallback if server is running
  if (params.hasBackendApi) {
    try {
      const resolved = resolveActiveProvider(params.hasServerGeminiKey);
      const resp = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: params.safePrompt,
          aspectRatio: params.aspectRatio,
          language: params.language,
          apiKey: resolved.provider === 'gemini' ? resolved.apiKey || undefined : undefined,
        }),
      });
      if (resp.ok) {
        const data = (await resp.json()) as { svgCode?: string };
        if (data.svgCode) {
          return { svgCode: data.svgCode, provider: 'svg' };
        }
      }
    } catch {
      // Fall through to local artistic SVG fallback
    }
  }

  // 4. Local offline-safe SVG artwork fallback so users NEVER hit a dead end
  return {
    svgCode: buildProceduralFallbackSvg(
      params.title,
      params.pollinationsDims.w,
      params.pollinationsDims.h
    ),
    provider: 'svg',
  };
}

export async function generateArtworkUnified(params: {
  prompt: string;
  aspectRatio: '1:1' | '16:9' | '4:3';
  language?: string;
  hasBackendApi: boolean;
  hasServerGeminiKey: boolean;
  onStatus?: (msg: string) => void;
}): Promise<{
  title: string;
  description: string;
  detailedPrompt: string;
  svgCode?: string;
  imageUrl?: string;
  provider: 'pollinations' | 'horde' | 'svg';
  aspectRatio: '1:1' | '16:9' | '4:3';
  width: number;
  height: number;
}> {
  const dims =
    params.aspectRatio === '16:9'
      ? { w: 896, h: 504 }
      : params.aspectRatio === '4:3'
        ? { w: 768, h: 576 }
        : { w: 768, h: 768 };

  params.onStatus?.('Enhancing prompt into safe artistic English...');
  const { detailedPrompt, shortTitle } = await translatePromptToDetailedEnglish({
    rawPrompt: params.prompt,
    hasBackendApi: params.hasBackendApi,
    hasServerGeminiKey: params.hasServerGeminiKey,
  });

  const resolved = await resolveImageWithFallback({
    safePrompt: detailedPrompt,
    aspectRatio: params.aspectRatio,
    pollinationsDims: dims,
    title: shortTitle,
    language: params.language,
    hasBackendApi: params.hasBackendApi,
    hasServerGeminiKey: params.hasServerGeminiKey,
    onStatus: params.onStatus,
  });

  return {
    title: shortTitle || 'HD AI Artwork',
    description: detailedPrompt,
    detailedPrompt,
    imageUrl: resolved.imageUrl,
    svgCode: resolved.svgCode,
    provider: resolved.provider,
    aspectRatio: params.aspectRatio,
    width: dims.w,
    height: dims.h,
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

  // SINGLE-FETCH PIPELINE: Only fetch ONE scene image so we NEVER trigger 4x rate-limit blocks!
  const imageResult = await resolveImageWithFallback({
    safePrompt: safeHeroPrompt,
    aspectRatio: '16:9',
    pollinationsDims: { w: 768, h: 432 },
    title,
    language: params.language,
    hasBackendApi: params.hasBackendApi,
    hasServerGeminiKey: params.hasServerGeminiKey,
    onStatus: params.onStatus,
  });

  const singleHeroUrl = imageResult.svgCode
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(imageResult.svgCode)}`
    : imageResult.imageUrl || '';

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


