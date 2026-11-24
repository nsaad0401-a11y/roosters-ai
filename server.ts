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

// Primary: gemini-2.5-flash with thinkingBudget: 0 for instant zero-delay responses.
// Fallbacks: supported low-latency models with minimal/low thinking if 503 overload occurs.
const FAST_CHAT_MODELS: ModelCandidate[] = [
  { model: 'gemini-2.5-flash', thinkingConfig: { thinkingBudget: 0 } },
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

function getServerDefaultGeminiKey(): string {
  return (process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '').trim();
}

function getAiClient(customApiKey?: string) {
  const apiKey = (customApiKey || getServerDefaultGeminiKey()).trim();
  if (!apiKey) {
    throw new Error('MISSING_API_KEY');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
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
  if (lower.includes('resource_exhausted') || lower.includes('429')) {
    return {
      status: 429,
      message: 'Request quota was temporarily reached. Please wait a moment and try again.',
    };
  }

  return {
    status: 500,
    message:
      extractReadableErrorMessage(rawMessage) ||
      'I apologize, something unexpected happened while preparing your response. Please try again.',
  };
}

function sanitizeSafeImagePrompt(rawPrompt: string, maxWords = 24): string {
  let cleaned = (rawPrompt || '')
    .replace(/\b(nude|naked|nsfw|sexy|bikini|lingerie|underwear|erotic|explicit|porn)\b/gi, 'modest stylish attire')
    .replace(/\b(blood|gore|kill|murder|corpse|violent|weapon|gun|knife)\b/gi, 'dramatic artistic scene')
    .replace(/\b(drug|weed|cocaine|cigarette|alcohol|beer|wine)\b/gi, 'refreshing tea cup')
    .replace(/["'`\n\r]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length > maxWords) {
    cleaned = words.slice(0, maxWords).join(' ').replace(/[,.;:-]+$/, '').trim();
  }
  return cleaned || 'serene photorealistic landscape under warm golden sunlight, sharp HD detail';
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

  if (isLiveVoice) {
    return [
      baseInstruction,
      userName ? `You are warmly assisting ${userName}.` : '',
      multimodalCore,
      'Speak naturally in 2–4 concise, clear sentences without markdown symbols, URLs, or code fences unless asked.',
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

async function streamWithFallback(
  res: express.Response,
  params: {
    contents: ReturnType<typeof buildContents>;
    systemInstruction: string;
    apiKey?: string;
    preferredModel?: string;
    enableSearchGrounding?: boolean;
  }
) {
  const ai = getAiClient(params.apiKey);
  let lastErr: unknown = null;
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

  const runCandidateStream = async (candidate: ModelCandidate, useSearchTool: boolean) => {
    let emittedAnyChunk = false;
    const stream = await ai.models.generateContentStream({
      model: candidate.model,
      contents: params.contents,
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
        res.write(`data: ${JSON.stringify({ type: 'chunk', text })}\n\n`);
      }

      const groundingChunks = (
        chunk as unknown as {
          candidates?: Array<{
            groundingMetadata?: {
              groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
            };
          }>;
        }
      )?.candidates?.[0]?.groundingMetadata?.groundingChunks;

      if (Array.isArray(groundingChunks)) {
        for (const gChunk of groundingChunks) {
          const uri = gChunk?.web?.uri?.trim();
          if (uri && /^https?:\/\//i.test(uri) && !collectedSources.has(uri)) {
            const title = (gChunk.web?.title || uri).trim();
            collectedSources.set(uri, title);
          }
        }
      }
    }

    if (!emittedAnyChunk) {
      throw new Error('Gemini stream completed without returning any text.');
    }
    return emittedAnyChunk;
  };

  for (let i = 0; i < orderedCandidates.length; i++) {
    const candidate = orderedCandidates[i];
    let emittedAnyChunk = false;

    try {
      try {
        emittedAnyChunk = await runCandidateStream(
          candidate,
          Boolean(params.enableSearchGrounding)
        );
      } catch (toolErr) {
        const msg = (toolErr instanceof Error ? toolErr.message : String(toolErr)).toLowerCase();
        const isToolUnsupported =
          Boolean(params.enableSearchGrounding) &&
          !emittedAnyChunk &&
          (msg.includes('tool') || msg.includes('googlesearch') || msg.includes('search'));
        if (isToolUnsupported) {
          emittedAnyChunk = await runCandidateStream(candidate, false);
        } else {
          throw toolErr;
        }
      }

      succeeded = true;
      break;
    } catch (err) {
      lastErr = err;
      if (!emittedAnyChunk && isRetryableOrFallbackError(err) && i < orderedCandidates.length - 1) {
        await sleep(150);
        continue;
      }
      if (emittedAnyChunk) {
        succeeded = true;
        break;
      }
      break;
    }
  }

  if (!succeeded) {
    const formatted = formatGeminiError(lastErr);
    res.write(
      `data: ${JSON.stringify({ type: 'error', error: formatted.message, code: formatted.code })}\n\n`
    );
    res.end();
    return;
  }

  if (collectedSources.size > 0) {
    const sources = Array.from(collectedSources.entries())
      .slice(0, 12)
      .map(([uri, title]) => ({ uri, title }));
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

  // Real-Time Streaming Multimodal Chat Endpoint (SSE)
  app.post('/api/chat', async (req, res) => {
    try {
      const {
        messages,
        language,
        userName,
        apiKey,
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

      if (!apiKey?.trim() && !getServerDefaultGeminiKey()) {
        const missing = formatGeminiError(new Error('MISSING_API_KEY'));
        res.status(missing.status).json({ error: missing.message, code: missing.code });
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
        preferredModel: chatModel,
        enableSearchGrounding: true,
      });
    } catch (err) {
      const formatted = formatGeminiError(err);
      if (res.headersSent) {
        res.write(
          `data: ${JSON.stringify({ type: 'error', error: formatted.message, code: formatted.code })}\n\n`
        );
        res.end();
      } else {
        res.status(formatted.status).json({ error: formatted.message, code: formatted.code });
      }
    }
  });

  // Direct Gemini 2.5 Flash REST Vision Endpoint (bypasses Groq completely, returns exact REST error if failed)
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
        responseStyle?: 'simple' | 'detailed' | 'study';
        customInstructions?: string;
        globalSystemPrompt?: string;
      };

      const resolvedKey = (apiKey || getServerDefaultGeminiKey()).trim();
      if (!resolvedKey) {
        res.status(503).json({ error: 'Gemini API key is missing on the server.' });
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

      // 1. Direct Gemini 2.5 Flash REST API attempt with clean inline_data JSON body
      try {
        const restCtrl = new AbortController();
        const restTimer = setTimeout(() => restCtrl.abort(), 7000);
        try {
          const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
            resolvedKey
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
              error?: { message?: string };
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
          } else if (geminiResp.status !== 404 && geminiResp.status !== 503 && geminiResp.status !== 429) {
            const errTxt = await geminiResp.text().catch(() => '');
            res.status(geminiResp.status).json({
              error: `Gemini Vision API (${geminiResp.status}): ${extractReadableErrorMessage(errTxt)}`,
            });
            return;
          }
        } finally {
          clearTimeout(restTimer);
        }
      } catch {
        // Fall through to active @google/genai SDK vision models
      }

      // 2. Fallback to active @google/genai multimodal models (gemini-3.1-flash-lite / gemini-4-hydrogen)
      const ai = getAiClient(resolvedKey);
      let lastErr: unknown = null;
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

      const formatted = formatGeminiError(lastErr || new Error('Gemini Vision returned no response.'));
      res.status(formatted.status).json({ error: formatted.message });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Unexpected server error during photo analysis.',
      });
    }
  });

  // Streaming SSE Live Talk Endpoint so first sentence speaks immediately
  app.post('/api/chat-live-stream', async (req, res) => {
    try {
      const {
        messages,
        language,
        userName,
        apiKey,
        responseStyle,
        customInstructions,
        globalSystemPrompt,
        chatModel,
      } = req.body as {
        messages: IncomingHistoryItem[];
        language?: string;
        userName?: string;
        apiKey?: string;
        responseStyle?: 'simple' | 'detailed' | 'study';
        customInstructions?: string;
        globalSystemPrompt?: string;
        chatModel?: string;
      };

      if (!Array.isArray(messages) || messages.length === 0) {
        res.status(400).json({ error: 'Messages array is required.' });
        return;
      }

      if (!apiKey?.trim() && !getServerDefaultGeminiKey()) {
        const missing = formatGeminiError(new Error('MISSING_API_KEY'));
        res.status(missing.status).json({ error: missing.message, code: missing.code });
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
        preferredModel: chatModel,
      });
    } catch (err) {
      const formatted = formatGeminiError(err);
      if (res.headersSent) {
        res.write(
          `data: ${JSON.stringify({ type: 'error', error: formatted.message, code: formatted.code })}\n\n`
        );
        res.end();
      } else {
        res.status(formatted.status).json({ error: formatted.message, code: formatted.code });
      }
    }
  });

  // Non-streaming Live Talk endpoint kept for compatibility
  app.post('/api/chat-live', async (req, res) => {
    try {
      const {
        messages,
        language,
        userName,
        apiKey,
        responseStyle,
        customInstructions,
        globalSystemPrompt,
      } = req.body as {
        messages: IncomingHistoryItem[];
        language?: string;
        userName?: string;
        apiKey?: string;
        responseStyle?: 'simple' | 'detailed' | 'study';
        customInstructions?: string;
        globalSystemPrompt?: string;
      };

      if (!Array.isArray(messages) || messages.length === 0) {
        res.status(400).json({ error: 'Messages array is required.' });
        return;
      }

      const ai = getAiClient(apiKey);
      const systemInstruction = buildStudyTutorInstruction({
        language,
        userName,
        isLiveVoice: true,
        responseStyle,
        customInstructions,
        globalSystemPrompt,
      });
      const contents = buildContents(messages);

      let lastErr: unknown = null;
      for (let i = 0; i < FAST_CHAT_MODELS.length; i++) {
        const candidate = FAST_CHAT_MODELS[i];
        try {
          const response = await ai.models.generateContent({
            model: candidate.model,
            contents,
            config: {
              systemInstruction,
              thinkingConfig: candidate.thinkingConfig,
              safetySettings: DEFAULT_SAFETY_SETTINGS,
            },
          });
          const text = (response.text ?? '').trim();
          if (!text) {
            throw new Error('Gemini returned an empty live voice response.');
          }
          res.json({ text });
          return;
        } catch (err) {
          lastErr = err;
          if (isRetryableOrFallbackError(err) && i < FAST_CHAT_MODELS.length - 1) {
            await sleep(150);
            continue;
          }
          break;
        }
      }

      const formatted = formatGeminiError(lastErr);
      res.status(formatted.status).json({ error: formatted.message, code: formatted.code });
    } catch (err) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message, code: formatted.code });
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
      } = req.body as {
        text: string;
        recentMessages?: Array<{ role?: string; content?: string }>;
        forceImage?: boolean;
        hasAttachment?: boolean;
        hasPreviousGeneratedImage?: boolean;
        apiKey?: string;
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

      const ai = getAiClient(apiKey);
      const enhancerSystemInstruction = forceImage
        ? [
            'You are a world-class AI visual prompt engineer for Google Nano Banana and Flux HD image generation.',
            'Understand ANY world language (100+ languages including English, Urdu, Roman Urdu, Hindi, Arabic, Punjabi, Pashto, Sindhi, Spanish, French, German, Turkish, Chinese, Japanese, Korean, Russian, etc.).',
            'If Recent Conversation Context is provided, combine any relevant visual subject from the context with the Latest User Message.',
            'Set intent to "image". Translate and refine the combined idea into ONE clean, safe, family-friendly English prompt STRICTLY under 25 words including sharp photography descriptors such as "ultra-sharp focus, crisp details, 8k resolution, DSLR 85mm lens, natural lighting".',
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
            'Output fields:',
            '- If intent is "image": translate/refine into a clean, safe, family-friendly English prompt STRICTLY under 25 words including sharp photography descriptors ("ultra-sharp focus, crisp details, 8k resolution, DSLR 85mm lens, natural lighting") + 3-6 word English shortTitle.',
            '- If intent is "image_edit": translate/refine into a concise, safe, family-friendly English photo-editing instruction (under 25 words) preserving face/identity consistency + 3-6 word English shortTitle.',
            '- If intent is "chat" or "video": set enhancedPrompt to "" and shortTitle to "".',
          ].join(' ');

      let lastErr: unknown = null;
      for (let i = 0; i < FAST_CHAT_MODELS.length; i++) {
        const candidate = FAST_CHAT_MODELS[i];
        try {
          const response = await ai.models.generateContent({
            model: candidate.model,
            contents: detectorInput,
            config: {
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

          const parsed = JSON.parse((response.text ?? '{}').trim()) as {
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
              ? sanitizeSafeImagePrompt(parsed.enhancedPrompt || '', 24)
              : (parsed.enhancedPrompt || '').trim();

          res.json({
            intent: normalizedIntent,
            shortTitle: (parsed.shortTitle || '').trim(),
            enhancedPrompt: cleanEnhanced,
          });
          return;
        } catch (err) {
          lastErr = err;
          if (isRetryableOrFallbackError(err) && i < FAST_CHAT_MODELS.length - 1) {
            await sleep(120);
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
    aspectRatio: '1:1' | '16:9' | '4:3',
    attempt = 1,
    timeoutMs = 22000
  ): Promise<{ ok: true; dataUrl: string; mimeType: string } | { ok: false; reason: string }> {
    const deadline = Date.now() + timeoutMs;
    // Fast anonymous dimensions (multiples of 64) for reliable worker pickup in ~7-14s
    const hordeDims =
      attempt >= 2
        ? aspectRatio === '16:9'
          ? { w: 768, h: 448 }
          : aspectRatio === '4:3'
            ? { w: 640, h: 512 }
            : { w: 512, h: 512 }
        : aspectRatio === '16:9'
          ? { w: 896, h: 512 }
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

  // Zero-Setup Server-Side Image Generation Route (Multi-Provider + 3-Attempt Retry + Optional Gemini Native)
  app.post('/api/nano-banana', async (req, res) => {
    try {
      const {
        prompt,
        sourceImageBase64,
        sourceMimeType,
        aspectRatio = '1:1',
        resolution = '1K',
        mode = 'generate',
        preferredModel,
        previousEditContext,
        skipEnhance,
        apiKey,
      } = req.body as {
        prompt: string;
        sourceImageBase64?: string;
        sourceMimeType?: string;
        aspectRatio?: '1:1' | '16:9' | '4:3';
        resolution?: '1K' | '2K';
        mode?: 'generate' | 'edit';
        preferredModel?: string;
        previousEditContext?: string;
        skipEnhance?: boolean;
        apiKey?: string;
      };

      const rawPrompt = (prompt || '').trim();
      if (!rawPrompt) {
        res.status(400).json({ error: 'Image prompt or edit instruction is required.' });
        return;
      }

      const cleanBase64 = (sourceImageBase64 || '').replace(/^data:[^;]+;base64,/, '').trim();
      const isEditMode = mode === 'edit' || Boolean(cleanBase64);
      const resolvedKey = (apiKey || getServerDefaultGeminiKey()).trim();

      let enhancedPrompt = rawPrompt;
      let shortTitle = rawPrompt.slice(0, 52);

      // Step 1: Optional fast single-attempt prompt enhancement when Gemini key exists (never blocks on quota)
      if (resolvedKey && !skipEnhance) {
        const ai = getAiClient(resolvedKey);
        const enhanceSys = isEditMode
          ? [
              'You are a Nano Banana photo-editing prompt engineer.',
              'Translate ANY user edit request from ANY world language into a clean, safe, family-friendly English editing instruction STRICTLY under 25 words.',
              'Return ONLY JSON: {"shortTitle":"3-6 word title","enhancedPrompt":"clean English edit instruction under 25 words"}',
            ].join(' ')
          : [
              'You are an ultra-HD visual prompt engineer.',
              'Translate ANY request from ANY world language into a clean, safe, family-friendly English prompt STRICTLY under 25 words including sharp photography descriptors such as "ultra-sharp focus, crisp details, 8k resolution, natural lighting".',
              'Return ONLY JSON: {"shortTitle":"3-6 word title","enhancedPrompt":"clean English image prompt under 25 words"}',
            ].join(' ');

        const enhanceInput =
          isEditMode && previousEditContext
            ? `Previous Image Context: ${previousEditContext.slice(0, 300)}\nNew Edit Request: ${rawPrompt}`
            : rawPrompt;

        try {
          const enhResp = await ai.models.generateContent({
            model: FAST_CHAT_MODELS[0].model,
            contents: enhanceInput,
            config: {
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
        } catch {
          // Immediately proceed to keyless synthesis without stalling
        }
      }

      enhancedPrompt = sanitizeSafeImagePrompt(enhancedPrompt, 24);
      const dims =
        aspectRatio === '16:9'
          ? { w: 1024, h: 576 }
          : aspectRatio === '4:3'
            ? { w: 1024, h: 768 }
            : { w: 1024, h: 1024 };

      // Step 2: Optional native Gemini image generation/editing when Gemini API key exists (gracefully falls through on quota/free tier)
      if (resolvedKey) {
        const ai = getAiClient(resolvedKey);
        if (isEditMode && cleanBase64) {
          const editPrompt = `${enhancedPrompt}. Keep original subject identity consistent, crisp HD clarity.`;
          const nativeModelsOrdered = Array.from(
            new Set(
              preferredModel === 'gemini-3.1-flash-image-preview'
                ? ['gemini-3.1-flash-image-preview', 'gemini-2.5-flash-image']
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
              // Gracefully fall through to keyless generation pipeline below
            }
          }

          // Vision bridge so keyless endpoint renders an accurate edited variation when Gemini native edit is quota-limited
          try {
            const bridgeResp = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: [
                { inlineData: { data: cleanBase64, mimeType: sourceMimeType || 'image/png' } },
                {
                  text: `Combine the subject and scene of this photo with this edit: "${enhancedPrompt}". Output ONE clean, safe English image prompt strictly under 24 words.`,
                },
              ],
              config: {
                thinkingConfig: { thinkingBudget: 0 },
                safetySettings: DEFAULT_SAFETY_SETTINGS,
              },
            });
            if (bridgeResp.text?.trim()) {
              enhancedPrompt = sanitizeSafeImagePrompt(bridgeResp.text.trim(), 24);
            }
          } catch {
            // Keep sanitized prompt
          }
        } else {
          // Single fast non-blocking Gemini native generation check when Owner configured a paid key
          const nativeGenModel =
            preferredModel === 'gemini-3.1-flash-image-preview'
              ? 'gemini-3.1-flash-image-preview'
              : 'gemini-2.5-flash-image';
          try {
            const response = await ai.models.generateContent({
              model: nativeGenModel,
              contents: enhancedPrompt,
              config: {
                responseModalities: ['IMAGE', 'TEXT'],
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
            // Fall through cleanly to keyless multi-provider fallback engine
          }
        }
      }

      // Step 3: Multi-Provider Free Fallback Waterfall with 3 Automatic Retry Rounds
      const encodedPrompt = encodeURIComponent(enhancedPrompt);
      const pollinationsModels: Array<'flux' | 'turbo' | 'dreamshaper'> = ['flux', 'turbo', 'dreamshaper'];
      const MAX_SERVER_ATTEMPTS = 3;
      const failureReasons: string[] = [];

      for (let attempt = 1; attempt <= MAX_SERVER_ATTEMPTS; attempt++) {
        // 3A. Pollinations AI multi-model cycle (flux -> turbo -> dreamshaper) with valid 32-bit random seed
        for (const polyModel of pollinationsModels) {
          const polyUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${dims.w}&height=${dims.h}&seed=${randomImageSeed()}&model=${polyModel}&nologo=true`;
          const polyRes = await fetchKeylessImageAsDataUrl(polyUrl, 13000);
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
          failureReasons.push(`pollinations-${polyModel}#${attempt}: ${polyRes.reason}`);
          // If IP-level rate limit (402 / 429) hit, move immediately to other independent providers this round
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
        failureReasons.push(`flux-space#${attempt}: ${fluxSpaceRes.reason}`);

        // 3C. Keyless AI Horde with fast anonymous dimensions (scales down cleanly on retries)
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
        failureReasons.push(`ai-horde#${attempt}: ${hordeRes.reason}`);

        if (attempt < MAX_SERVER_ATTEMPTS) {
          await sleep(attempt === 1 ? 900 : 1800);
        }
      }

      res.status(503).json({
        error: `Image synthesis servers are momentarily busy after ${MAX_SERVER_ATTEMPTS} retry attempts (${failureReasons.slice(-3).join('; ')}). Please try again.`,
        code: 'IMAGE_UNAVAILABLE',
      });
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : String(err);
      const exactMessage = extractReadableErrorMessage(rawMessage) || rawMessage;
      res.status(500).json({
        error: `Image generation error: ${exactMessage}`,
      });
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
