import { memo, useMemo, useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
  isLight?: boolean;
}

interface CodeBlockSegment {
  type: 'code';
  language: string;
  code: string;
}

interface TextSegment {
  type: 'text';
  text: string;
}

type Segment = CodeBlockSegment | TextSegment;

// Handles both closed code fences AND in-progress streaming fences immediately
function parseSegments(markdown: string): Segment[] {
  const segments: Segment[] = [];
  const fenceRegex = /```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = fenceRegex.exec(markdown)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        text: markdown.slice(lastIndex, match.index),
      });
    }
    segments.push({
      type: 'code',
      language: match[1] || 'code',
      code: match[2].replace(/\n$/, ''),
    });
    lastIndex = fenceRegex.lastIndex;
  }

  if (lastIndex < markdown.length) {
    const tail = markdown.slice(lastIndex);
    const openFenceMatch = /^([\s\S]*?)```([a-zA-Z0-9_+-]*)\n([\s\S]*)$/.exec(tail);
    if (openFenceMatch) {
      if (openFenceMatch[1]) {
        segments.push({ type: 'text', text: openFenceMatch[1] });
      }
      segments.push({
        type: 'code',
        language: openFenceMatch[2] || 'code',
        code: openFenceMatch[3],
      });
    } else {
      segments.push({ type: 'text', text: tail });
    }
  }

  return segments;
}

const KEYWORDS = new Set([
  'import', 'export', 'from', 'default', 'const', 'let', 'var', 'function', 'return',
  'async', 'await', 'if', 'else', 'for', 'while', 'switch', 'case', 'break', 'continue',
  'try', 'catch', 'finally', 'throw', 'new', 'class', 'extends', 'implements', 'interface',
  'type', 'enum', 'public', 'private', 'protected', 'readonly', 'true', 'false', 'null',
  'undefined', 'def', 'print', 'elif', 'in', 'not', 'and', 'or', 'pass', 'with', 'as',
  'SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE',
  'CREATE', 'TABLE', 'JOIN', 'ON', 'GROUP', 'BY', 'ORDER', 'LIMIT', 'package', 'struct',
  'fn', 'pub', 'impl', 'match', 'use', 'mod', 'void', 'int', 'string', 'boolean', 'number',
]);

function highlightCodeLine(line: string) {
  const trimmed = line.trimStart();
  if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('--')) {
    return <span className="text-[#64748b] italic">{line}</span>;
  }

  const tokenRegex =
    /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][A-Za-z0-9_]*\b|\/\/.*$)/g;

  const nodes: Array<string | React.JSX.Element> = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;

  while ((match = tokenRegex.exec(line)) !== null) {
    if (match.index > lastIdx) {
      nodes.push(line.slice(lastIdx, match.index));
    }

    const token = match[0];
    keyIdx += 1;

    if (token.startsWith('//')) {
      nodes.push(
        <span key={keyIdx} className="text-[#64748b] italic">
          {token}
        </span>
      );
    } else if (token.startsWith('"') || token.startsWith("'") || token.startsWith('`')) {
      nodes.push(
        <span key={keyIdx} className="text-[#ffd700]">
          {token}
        </span>
      );
    } else if (/^\d/.test(token)) {
      nodes.push(
        <span key={keyIdx} className="text-[#fb923c]">
          {token}
        </span>
      );
    } else if (KEYWORDS.has(token)) {
      nodes.push(
        <span key={keyIdx} className="text-[#00d4ff] font-medium">
          {token}
        </span>
      );
    } else if (/^[A-Z][A-Za-z0-9_]*$/.test(token)) {
      nodes.push(
        <span key={keyIdx} className="text-[#c084fc]">
          {token}
        </span>
      );
    } else {
      nodes.push(token);
    }

    lastIdx = tokenRegex.lastIndex;
  }

  if (lastIdx < line.length) {
    nodes.push(line.slice(lastIdx));
  }

  return nodes.length > 0 ? nodes : ' ';
}

const CodeBlock = memo(function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  const lines = useMemo(() => code.split('\n'), [code]);

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-[#1f293d] bg-[#090b10]">
      <div className="flex items-center justify-between px-3.5 py-2 bg-[#0f1420] border-b border-[#1f293d]">
        <span className="text-[11px] font-mono-code uppercase tracking-wider text-[#94a3b8]">
          {language}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-[11px] font-medium text-[#cbd5e1] hover:text-[#00d4ff] transition-colors cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3.5 overflow-x-auto text-[13px] leading-[1.6] font-mono-code text-slate-200">
        <code>
          {lines.map((line, i) => (
            <div key={i} className="min-h-[1.25em]">
              {highlightCodeLine(line)}
            </div>
          ))}
        </code>
      </pre>
    </div>
  );
});

function renderInlineFormatting(text: string, isLight: boolean): Array<string | React.JSX.Element> {
  const inlineRegex =
    /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\((?:[^()\s]+|\([^()\s]*\))+\)|https?:\/\/[^\s<>()]+(?:\([^\s<>()]*\)[^\s<>()]*)*)/gi;
  const result: Array<string | React.JSX.Element> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = inlineRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      result.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    key += 1;

    if (token.startsWith('`') && token.endsWith('`')) {
      result.push(
        <code
          key={key}
          className={`px-1.5 py-0.5 mx-0.5 rounded border font-mono-code text-[12.5px] ${
            isLight
              ? 'bg-slate-100 border-slate-300 text-sky-700'
              : 'bg-[#090b10] border-[#1f293d] text-[#00d4ff]'
          }`}
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('**') && token.endsWith('**')) {
      result.push(
        <strong key={key} className={`font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>
          {renderInlineFormatting(token.slice(2, -2), isLight)}
        </strong>
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      result.push(
        <em key={key} className={`italic ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>
          {renderInlineFormatting(token.slice(1, -1), isLight)}
        </em>
      );
    } else if (token.startsWith('[')) {
      const linkMatch = /^\[([^\]]+)\]\((.+)\)$/.exec(token);
      if (linkMatch) {
        const [, label, rawHref] = linkMatch;
        const href = rawHref.trim();
        if (/^https?:\/\//i.test(href)) {
          result.push(
            <a
              key={key}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={`underline underline-offset-2 break-words transition-colors ${
                isLight
                  ? 'text-sky-700 hover:text-amber-600'
                  : 'text-[#00d4ff] hover:text-[#ffd700]'
              }`}
            >
              {label}
            </a>
          );
        } else {
          result.push(label);
        }
      } else {
        result.push(token);
      }
    } else if (/^https?:\/\//i.test(token)) {
      const trimmedUrl = token.replace(/[.,;:!?)'"]+$/, '');
      const trailingPunct = token.slice(trimmedUrl.length);
      if (/^https?:\/\/\S+/i.test(trimmedUrl)) {
        result.push(
          <a
            key={key}
            href={trimmedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`underline underline-offset-2 break-all transition-colors ${
              isLight
                ? 'text-sky-700 hover:text-amber-600'
                : 'text-[#00d4ff] hover:text-[#ffd700]'
            }`}
          >
            {trimmedUrl}
          </a>
        );
        if (trailingPunct) {
          result.push(trailingPunct);
        }
      } else {
        result.push(token);
      }
    } else {
      result.push(token);
    }

    lastIndex = inlineRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    result.push(text.slice(lastIndex));
  }

  return result;
}

const TextBlock = memo(function TextBlock({ text, isLight }: { text: string; isLight: boolean }) {
  const lines = text.split('\n');
  const elements: React.JSX.Element[] = [];
  let listItems: Array<{ ordered: boolean; content: string }> = [];
  let keyCounter = 0;

  const flushList = () => {
    if (listItems.length === 0) return;
    keyCounter += 1;
    const isOrdered = listItems[0].ordered;
    const Tag = isOrdered ? 'ol' : 'ul';
    elements.push(
      <Tag
        key={`list_${keyCounter}`}
        dir="auto"
        className={`my-2 space-y-1.5 ps-5 text-[14.5px] leading-[1.65] ${
          isLight ? 'text-slate-800' : 'text-slate-200'
        } ${isOrdered ? 'list-decimal' : 'list-disc'}`}
      >
        {listItems.map((item, idx) => (
          <li key={idx} className={isLight ? 'marker:text-sky-600' : 'marker:text-[#00d4ff]'}>
            {renderInlineFormatting(item.content, isLight)}
          </li>
        ))}
      </Tag>
    );
    listItems = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      continue;
    }

    const bulletMatch = /^[-*•]\s+(.*)$/.exec(trimmed);
    const orderedMatch = /^\d+\.\s+(.*)$/.exec(trimmed);

    if (bulletMatch) {
      if (listItems.length > 0 && listItems[0].ordered) flushList();
      listItems.push({ ordered: false, content: bulletMatch[1] });
      continue;
    }

    if (orderedMatch) {
      if (listItems.length > 0 && !listItems[0].ordered) flushList();
      listItems.push({ ordered: true, content: orderedMatch[1] });
      continue;
    }

    flushList();
    keyCounter += 1;

    if (trimmed.startsWith('### ')) {
      elements.push(
        <h3
          key={`h3_${keyCounter}`}
          dir="auto"
          className={`mt-4 mb-1.5 font-display text-[15.5px] font-bold ${
            isLight ? 'text-amber-700' : 'text-[#ffd700]'
          }`}
        >
          {renderInlineFormatting(trimmed.slice(4), isLight)}
        </h3>
      );
    } else if (trimmed.startsWith('## ')) {
      elements.push(
        <h2
          key={`h2_${keyCounter}`}
          dir="auto"
          className={`mt-4 mb-2 font-display text-[17px] font-bold ${
            isLight ? 'text-slate-900' : 'text-white'
          }`}
        >
          {renderInlineFormatting(trimmed.slice(3), isLight)}
        </h2>
      );
    } else if (trimmed.startsWith('# ')) {
      elements.push(
        <h1
          key={`h1_${keyCounter}`}
          dir="auto"
          className={`mt-4 mb-2 font-display text-[19px] font-bold ${
            isLight ? 'text-slate-900' : 'text-white'
          }`}
        >
          {renderInlineFormatting(trimmed.slice(2), isLight)}
        </h1>
      );
    } else if (trimmed === '---' || trimmed === '***') {
      elements.push(
        <hr
          key={`hr_${keyCounter}`}
          className={`my-3 ${isLight ? 'border-slate-200' : 'border-[#1f293d]'}`}
        />
      );
    } else if (trimmed.startsWith('> ')) {
      elements.push(
        <blockquote
          key={`bq_${keyCounter}`}
          dir="auto"
          className={`my-2 px-3.5 py-2 rounded-lg border text-[14px] italic ${
            isLight
              ? 'bg-slate-50 border-slate-200 text-slate-700'
              : 'bg-[#090b10] border-[#1f293d] text-slate-300'
          }`}
        >
          {renderInlineFormatting(trimmed.slice(2), isLight)}
        </blockquote>
      );
    } else {
      elements.push(
        <p
          key={`p_${keyCounter}`}
          dir="auto"
          className={`my-1.5 text-[14.5px] leading-[1.68] ${
            isLight ? 'text-slate-800' : 'text-slate-200'
          }`}
        >
          {renderInlineFormatting(trimmed, isLight)}
        </p>
      );
    }
  }

  flushList();
  return <>{elements}</>;
});

export const MarkdownRenderer = memo(function MarkdownRenderer({
  content,
  isLight = false,
}: MarkdownRendererProps) {
  const segments = useMemo(() => parseSegments(content), [content]);

  return (
    <div className="space-y-1 break-words">
      {segments.map((seg, idx) =>
        seg.type === 'code' ? (
          <CodeBlock key={idx} language={seg.language} code={seg.code} />
        ) : (
          <TextBlock key={idx} text={seg.text} isLight={isLight} />
        )
      )}
    </div>
  );
});
