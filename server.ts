import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

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

function getAiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in environment secrets.');
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

function formatGeminiError(err: unknown): { status: number; message: string } {
  const rawMessage = err instanceof Error ? err.message : String(err);
  const lower = rawMessage.toLowerCase();

  if (
    lower.includes('permission_denied') ||
    lower.includes('api_key_invalid') ||
    lower.includes('403') ||
    lower.includes('401')
  ) {
    return {
      status: 401,
      message: 'We could not validate the API key. Please check GEMINI_API_KEY in Settings > Secrets.',
    };
  }
  if (lower.includes('gemini_api_key is not configured')) {
    return {
      status: 500,
      message: 'GEMINI_API_KEY is not configured yet. Please add it in Settings > Secrets.',
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

// Concise, token-optimized system prompt for rapid TTFT while preserving the ultra-polite Study Tutor persona
function buildStudyTutorInstruction(options: {
  language?: string;
  userName?: string;
  isLiveVoice?: boolean;
}) {
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
    `You are Roosters AI by SandSoft${userName ? `, warmly assisting ${userName}` : ''}.`,
    'Always be deeply polite, warm, respectful, and encouraging like a patient master teacher.',
    'For study topics: explain in clear numbered steps with simple examples, crisp study notes, and 1–2 helpful practice questions.',
    'Format code in fenced markdown blocks with language tags. Analyze attached images/screens politely and thoroughly.',
    langRule,
  ].join(' ');
}

interface IncomingHistoryItem {
  role: 'user' | 'assistant';
  content: string;
  attachment?: {
    base64: string;
    mimeType: string;
  };
}

function buildContents(messages: IncomingHistoryItem[]) {
  return messages.slice(-16).map((msg) => {
    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
    if (msg.attachment?.base64 && msg.attachment?.mimeType) {
      parts.push({
        inlineData: {
          mimeType: msg.attachment.mimeType,
          data: msg.attachment.base64,
        },
      });
    }
    parts.push({
      text: msg.content?.trim() || (msg.attachment ? 'Please analyze this image kindly.' : ''),
    });
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
  }
) {
  const ai = getAiClient();
  let lastErr: unknown = null;
  let succeeded = false;

  for (let i = 0; i < FAST_CHAT_MODELS.length; i++) {
    const candidate = FAST_CHAT_MODELS[i];
    let emittedAnyChunk = false;

    try {
      const stream = await ai.models.generateContentStream({
        model: candidate.model,
        contents: params.contents,
        config: {
          systemInstruction: params.systemInstruction,
          thinkingConfig: candidate.thinkingConfig,
        },
      });

      for await (const chunk of stream) {
        const text = chunk.text;
        if (text) {
          emittedAnyChunk = true;
          res.write(`data: ${JSON.stringify({ type: 'chunk', text })}\n\n`);
        }
      }

      succeeded = true;
      break;
    } catch (err) {
      lastErr = err;
      if (!emittedAnyChunk && isRetryableOrFallbackError(err) && i < FAST_CHAT_MODELS.length - 1) {
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
    res.write(`data: ${JSON.stringify({ type: 'error', error: formatted.message })}\n\n`);
    res.end();
    return;
  }

  res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
  res.end();
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'Roosters AI by SandSoft' });
  });

  // Real-Time Streaming Multimodal Chat Endpoint (SSE)
  app.post('/api/chat', async (req, res) => {
    try {
      const { messages, language, userName } = req.body as {
        messages: IncomingHistoryItem[];
        language?: string;
        userName?: string;
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
        systemInstruction: buildStudyTutorInstruction({ language, userName, isLiveVoice: false }),
      });
    } catch (err) {
      const formatted = formatGeminiError(err);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: formatted.message })}\n\n`);
        res.end();
      } else {
        res.status(formatted.status).json({ error: formatted.message });
      }
    }
  });

  // Streaming SSE Live Talk Endpoint so first sentence speaks immediately
  app.post('/api/chat-live-stream', async (req, res) => {
    try {
      const { messages, language, userName } = req.body as {
        messages: IncomingHistoryItem[];
        language?: string;
        userName?: string;
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
        systemInstruction: buildStudyTutorInstruction({ language, userName, isLiveVoice: true }),
      });
    } catch (err) {
      const formatted = formatGeminiError(err);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: formatted.message })}\n\n`);
        res.end();
      } else {
        res.status(formatted.status).json({ error: formatted.message });
      }
    }
  });

  // Non-streaming Live Talk endpoint kept for compatibility
  app.post('/api/chat-live', async (req, res) => {
    try {
      const { messages, language, userName } = req.body as {
        messages: IncomingHistoryItem[];
        language?: string;
        userName?: string;
      };

      if (!Array.isArray(messages) || messages.length === 0) {
        res.status(400).json({ error: 'Messages array is required.' });
        return;
      }

      const ai = getAiClient();
      const systemInstruction = buildStudyTutorInstruction({ language, userName, isLiveVoice: true });
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
            },
          });
          const text = (response.text ?? '').trim();
          res.json({ text: text || 'I am right here with you. Could you please repeat that?' });
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
      res.status(formatted.status).json({ error: formatted.message });
    } catch (err) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // Bespoke Vector Artwork Generator Endpoint (with fast fallback)
  app.post('/api/generate-image', async (req, res) => {
    try {
      const { prompt, aspectRatio = '1:1', language } = req.body as {
        prompt: string;
        aspectRatio?: '1:1' | '16:9' | '4:3';
        language?: string;
      };

      if (!prompt || !prompt.trim()) {
        res.status(400).json({ error: 'Image prompt is required.' });
        return;
      }

      const ai = getAiClient();
      const dims =
        aspectRatio === '16:9'
          ? { w: 1280, h: 720 }
          : aspectRatio === '4:3'
            ? { w: 1024, h: 768 }
            : { w: 1024, h: 1024 };

      const langNote =
        language && language !== 'Auto-Detect'
          ? `Write the title and description in ${language}.`
          : 'Write the title and description in the same language as the prompt.';

      let lastErr: unknown = null;
      for (let i = 0; i < FAST_CHAT_MODELS.length; i++) {
        const candidate = FAST_CHAT_MODELS[i];
        try {
          const response = await ai.models.generateContent({
            model: candidate.model,
            contents: [
              `Create a richly layered SVG illustration for: "${prompt.trim()}".`,
              `viewBox="0 0 ${dims.w} ${dims.h}" width="${dims.w}" height="${dims.h}".`,
              'Use <defs> linearGradient/radialGradient, crisp vector paths, and atmospheric lighting. No external URLs, <script>, or foreignObject.',
              langNote,
            ].join('\n'),
            config: {
              thinkingConfig: candidate.thinkingConfig,
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  description: { type: Type.STRING },
                  svgCode: { type: Type.STRING },
                },
                required: ['title', 'description', 'svgCode'],
              },
            },
          });

          const parsed = JSON.parse((response.text ?? '{}').trim()) as {
            title?: string;
            description?: string;
            svgCode?: string;
          };

          if (!parsed.svgCode || !parsed.svgCode.includes('<svg')) {
            res.status(500).json({ error: 'Unable to synthesize artwork SVG. Please try a different prompt.' });
            return;
          }

          const cleanSvg = parsed.svgCode
            .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
            .replace(/\son\w+="[^"]*"/gi, '');

          res.json({
            title: parsed.title || 'Generated Artwork',
            description: parsed.description || prompt.trim(),
            svgCode: cleanSvg,
            aspectRatio,
            width: dims.w,
            height: dims.h,
          });
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
      res.status(formatted.status).json({ error: formatted.message });
    } catch (err) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // Multilingual Voice Transcription Endpoint
  app.post('/api/transcribe', async (req, res) => {
    try {
      const { audioBase64, mimeType, language } = req.body as {
        audioBase64: string;
        mimeType?: string;
        language?: string;
      };

      if (!audioBase64) {
        res.status(400).json({ error: 'Audio data is required.' });
        return;
      }

      const ai = getAiClient();
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
      const { text, language } = req.body as {
        text: string;
        language?: string;
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

      const ai = getAiClient();
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

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Roosters AI server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Roosters AI server:', err);
  process.exit(1);
});
