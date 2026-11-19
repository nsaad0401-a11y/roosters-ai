import { loadCustomApiKey } from './storage';

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
    const metaEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    return (metaEnv?.VITE_GROQ_API_KEY || '').trim();
  } catch {
    return '';
  }
}

export function getEnvGeminiKey(): string {
  try {
    const metaEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    return (metaEnv?.VITE_GEMINI_API_KEY || '').trim();
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
        label: 'Groq (Llama 3.3 70B)',
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
      ? 'Reply fluently in the exact language of the user’s latest message.'
      : `Reply fluently in ${language}.`;

  if (isLiveVoice) {
    return [
      `You are Roosters AI by SandSoft${userName ? `, warmly assisting ${userName}` : ''}.`,
      'Be ultra-polite, warm, respectful, and encouraging like a kind study tutor.',
      'Speak naturally in 2–4 concise, clear sentences without markdown symbols or code fences unless asked.',
      langRule,
    ].join(' ');
  }

  return [
    `You are Roosters AI v2.0 by SandSoft${userName ? `, warmly assisting ${userName}` : ''}.`,
    'Always be deeply polite, warm, respectful, and encouraging like a patient master teacher.',
    'For study topics: explain in clear numbered steps with simple examples, crisp study notes, and 1–2 helpful practice questions.',
    'Format code in fenced markdown blocks with language tags. Analyze attached images, screens, study notes, or code files politely and thoroughly.',
    langRule,
  ].join(' ');
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
    ...params.messages.slice(-16).map((m) => ({
      role: m.role,
      content: formatMessageTextWithFile(m),
    })),
  ];

  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: groqMessages,
      stream: true,
      temperature: 0.65,
      max_tokens: params.isLiveVoice ? 450 : 4096,
    }),
    signal: params.signal,
  });

  if (!resp.ok || !resp.body) {
    const errText = await resp.text().catch(() => '');
    throw new Error(extractReadableApiError(errText, resp.status));
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
}

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

  const contents = params.messages.slice(-16).map((msg) => {
    const parts: Array<{ text: string } | { inline_data: { mime_type: string; data: string } }> = [];
    if (msg.attachment?.base64 && msg.attachment?.mimeType && msg.attachment.kind !== 'file') {
      parts.push({
        inline_data: {
          mime_type: msg.attachment.mimeType,
          data: msg.attachment.base64,
        },
      });
    }
    let text = msg.content?.trim() || '';
    if (msg.attachment?.kind === 'file' && msg.attachment.textContent) {
      const label = msg.attachment.name || 'study-file.txt';
      const section = `[Uploaded File: ${label}]\n\`\`\`\n${msg.attachment.textContent.slice(0, 60000)}\n\`\`\``;
      text = text
        ? `${text}\n\n${section}`
        : `Please kindly review, summarize, or debug this uploaded file:\n\n${section}`;
    } else if (!text && msg.attachment) {
      text = 'Please analyze this attachment kindly.';
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

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';

      for (const rawEvent of events) {
        const lines = rawEvent.split('\n');
        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const parsed = JSON.parse(payload) as {
              candidates?: Array<{
                content?: { parts?: Array<{ text?: string }> };
              }>;
              error?: { message?: string };
            };
            if (parsed.error?.message) {
              throw new Error(parsed.error.message);
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

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';

      for (const rawEvent of events) {
        const line = rawEvent.trim();
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
            return { ok: false, shouldFallbackDirect: false, error: new MissingApiKeyError() };
          }
          return {
            ok: false,
            shouldFallbackDirect: false,
            error: new Error(parsed.error || 'I apologize, please try sending your question again.'),
          };
        }
      }
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
  const resolved = resolveActiveProvider(params.hasServerGeminiKey);

  if (resolved.provider === 'none') {
    throw new MissingApiKeyError();
  }

  // Always route Groq (gsk_...) directly to Groq's fast streaming API
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

function preloadExternalImage(url: string, timeoutMs = 9500): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    let settled = false;
    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(false);
      }
    }, timeoutMs);
    img.onload = () => {
      if (!settled) {
        settled = true;
        window.clearTimeout(timer);
        resolve(img.naturalWidth > 0);
      }
    };
    img.onerror = () => {
      if (!settled) {
        settled = true;
        window.clearTimeout(timer);
        resolve(false);
      }
    };
    img.src = url;
  });
}

export async function generateArtworkUnified(params: {
  prompt: string;
  aspectRatio: '1:1' | '16:9' | '4:3';
  language?: string;
  hasBackendApi: boolean;
  hasServerGeminiKey: boolean;
}): Promise<{
  title: string;
  description: string;
  svgCode?: string;
  imageUrl?: string;
  provider: 'pollinations' | 'svg';
  aspectRatio: '1:1' | '16:9' | '4:3';
  width: number;
  height: number;
}> {
  const dims =
    params.aspectRatio === '16:9'
      ? { w: 1280, h: 720 }
      : params.aspectRatio === '4:3'
        ? { w: 1024, h: 768 }
        : { w: 1024, h: 1024 };

  // 1. Free Pollinations AI Image Generation (zero API key required)
  const cleanPrompt = params.prompt.trim();
  const seed = Math.floor(Math.random() * 1_000_000);
  const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(
    cleanPrompt
  )}?width=${dims.w}&height=${dims.h}&nologo=true&seed=${seed}`;

  const loadedPollinations = await preloadExternalImage(pollinationsUrl);
  if (loadedPollinations) {
    return {
      title: cleanPrompt.slice(0, 60) || 'Generated Artwork',
      description: cleanPrompt,
      imageUrl: pollinationsUrl,
      provider: 'pollinations',
      aspectRatio: params.aspectRatio,
      width: dims.w,
      height: dims.h,
    };
  }

  // 2. Fallback to Gemini / Groq SVG synthesis if Pollinations is unreachable
  const resolved = resolveActiveProvider(params.hasServerGeminiKey);
  if (resolved.provider === 'none') {
    throw new MissingApiKeyError();
  }

  const langNote =
    params.language && params.language !== 'Auto-Detect'
      ? `Write the title and description in ${params.language}.`
      : 'Write the title and description in the same language as the prompt.';

  const artPrompt = [
    `Create a richly layered SVG illustration for: "${cleanPrompt}".`,
    `The root <svg> MUST specify viewBox="0 0 ${dims.w} ${dims.h}" width="${dims.w}" height="${dims.h}".`,
    'Use <defs> linearGradient/radialGradient, crisp vector paths, and atmospheric lighting. No external URLs, <script>, or foreignObject.',
    langNote,
    'Return ONLY a valid JSON object with keys: "title", "description", "svgCode".',
  ].join('\n');

  if (resolved.provider === 'groq') {
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resolved.apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: artPrompt }],
        response_format: { type: 'json_object' },
        temperature: 0.7,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(extractReadableApiError(errText, resp.status));
    }

    const data = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const rawJson = data.choices?.[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(rawJson) as {
      title?: string;
      description?: string;
      svgCode?: string;
    };
    if (!parsed.svgCode || !parsed.svgCode.includes('<svg')) {
      throw new Error('Unable to synthesize artwork SVG. Please try a different prompt.');
    }
    const cleanSvg = parsed.svgCode
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
      .replace(/\son\w+="[^"]*"/gi, '');

    return {
      title: parsed.title || 'Generated Artwork',
      description: parsed.description || cleanPrompt,
      svgCode: cleanSvg,
      provider: 'svg',
      aspectRatio: params.aspectRatio,
      width: dims.w,
      height: dims.h,
    };
  }

  // Try backend first if available
  if (params.hasBackendApi || resolved.source === 'server') {
    try {
      const resp = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: params.prompt,
          aspectRatio: params.aspectRatio,
          language: params.language,
          apiKey: resolved.apiKey || undefined,
        }),
      });
      const contentType = resp.headers.get('content-type') || '';
      if (resp.ok && contentType.includes('application/json')) {
        const data = (await resp.json()) as {
          title?: string;
          description?: string;
          svgCode?: string;
          aspectRatio?: '1:1' | '16:9' | '4:3';
          width?: number;
          height?: number;
        };
        if (data.svgCode) {
          return {
            title: data.title || 'Generated Artwork',
            description: data.description || params.prompt,
            svgCode: data.svgCode,
            provider: 'svg',
            aspectRatio: data.aspectRatio || params.aspectRatio,
            width: data.width || dims.w,
            height: data.height || dims.h,
          };
        }
      } else if (resp.status !== 404 && resp.status !== 405 && contentType.includes('application/json')) {
        const errData = (await resp.json().catch(() => ({}))) as { error?: string; code?: string };
        if (errData.code === 'MISSING_API_KEY') throw new MissingApiKeyError();
        if (!resolved.apiKey) throw new Error(errData.error || 'Image generation failed.');
      }
    } catch (err) {
      if (err instanceof MissingApiKeyError || !resolved.apiKey) {
        throw err;
      }
    }
  }

  // Direct Gemini REST fallback (Vercel static builds)
  if (!resolved.apiKey) {
    throw new MissingApiKeyError();
  }

  const resp = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': resolved.apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: artPrompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    }
  );

  if (!resp.ok) {
    const rawErr = await resp.text().catch(() => '');
    throw new Error(extractReadableApiError(rawErr, resp.status));
  }

  const data = (await resp.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  const parsed = JSON.parse(rawText) as {
    title?: string;
    description?: string;
    svgCode?: string;
  };
  if (!parsed.svgCode || !parsed.svgCode.includes('<svg')) {
    throw new Error('Unable to synthesize artwork SVG. Please try a different prompt.');
  }
  const cleanSvg = parsed.svgCode
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '');

  return {
    title: parsed.title || 'Generated Artwork',
    description: parsed.description || cleanPrompt,
    svgCode: cleanSvg,
    provider: 'svg',
    aspectRatio: params.aspectRatio,
    width: dims.w,
    height: dims.h,
  };
}
