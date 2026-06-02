import type { Protocol, Input, ExecuteOptions, ParsedError } from "./types.js";

function b64raw(data: string): string {
  const i = data.indexOf(";base64,");
  return i >= 0 ? data.slice(i + 8) : data;
}

function uerror(data: Record<string, unknown>): { type?: string; message?: string } {
  const raw = data.error && typeof data.error === "object" ? data.error : data;
  return raw;
}

function ensureArray<T = unknown>(v: unknown, label: string): T[] {
  if (!Array.isArray(v)) throw new Error(`${label}: expected array`);
  return v as T[];
}

function defaultParseError(data: Record<string, unknown>, status: number): ParsedError {
  const err = uerror(data);
  if (status === 401 || status === 403) return { category: "auth" };
  if (status === 429) return { category: "rate_limit" };
  if (status >= 500) return { category: "server", message: err.message || "Server error" };
  return { category: "client", message: err.message || "Client error" };
}

export const PROTOCOLS: Record<string, Protocol> = {
  // ── Anthropic Messages API ──
  "anthropic-messages": {
    endpoint: "/v1/messages",

    auth(apiKey) {
      return { "x-api-key": apiKey, "anthropic-version": "2023-06-01" };
    },

    buildContent(inputs: Input[], prompt: string): unknown[] {
      const content: unknown[] = [];
      for (const inp of inputs) {
        switch (inp.type) {
          case "image":
            content.push({
              type: "image",
              source: { type: "base64", media_type: inp.mimeType, data: b64raw(inp.data) },
            });
            break;
          case "text":
            content.push({ type: "text", text: inp.data });
            break;
          default:
            throw new Error(`Anthropic protocol does not support input type: ${inp.type}`);
        }
      }
      content.push({ type: "text", text: prompt });
      return content;
    },

    buildBody(model, content, opts) {
      return {
        model,
        max_tokens: opts.maxTokens || 2048,
        ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
        ...(opts.stopSequences ? { stop_sequences: opts.stopSequences } : {}),
        messages: [{ role: "user", content }],
      };
    },

    extractContent(data) {
      const arr = ensureArray<{ type: string; text?: string }>(data.content, "Anthropic");
      const text = arr.find((c) => c.type === "text")?.text;
      if (!text) throw new Error("No text content in Anthropic response");
      return text;
    },

    parseError: defaultParseError,

    // stream?: undefined — triggers auto-fallback in sendStream()
  },

  // ── OpenAI Chat Completions API ──
  "openai-chat-completions": {
    endpoint: "/chat/completions",

    auth(apiKey) {
      return { Authorization: `Bearer ${apiKey}` };
    },

    buildContent(inputs: Input[], prompt: string): unknown[] {
      const content: unknown[] = [];
      for (const inp of inputs) {
        switch (inp.type) {
          case "image":
            content.push({ type: "image_url", image_url: { url: inp.data } });
            break;
          case "text":
            content.push({ type: "text", text: inp.data });
            break;
          default:
            throw new Error(`OpenAI protocol does not support input type: ${inp.type}`);
        }
      }
      content.push({ type: "text", text: prompt });
      return content;
    },

    buildBody(model, content, opts) {
      return {
        model,
        max_tokens: opts.maxTokens || 2048,
        ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
        ...(opts.stopSequences ? { stop: opts.stopSequences } : {}),
        messages: [{ role: "user", content }],
      };
    },

    extractContent(data) {
      const choices = ensureArray<{ message?: { content?: string } }>(data.choices, "OpenAI");
      if (choices.length === 0) throw new Error("OpenAI: no choices in response");
      const text = choices[0]?.message?.content;
      if (!text) throw new Error("No text content in OpenAI response");
      return text;
    },

    parseError: defaultParseError,

    // stream?: undefined — triggers auto-fallback in sendStream()
  },

  // ── Google Generative AI API ──
  "google-generative-ai": {
    endpoint(model) {
      return `/v1beta/models/${model}:generateContent`;
    },

    auth(apiKey) {
      return { "x-goog-api-key": apiKey };
    },

    buildContent(inputs: Input[], prompt: string): unknown[] {
      const parts: unknown[] = [];
      for (const inp of inputs) {
        switch (inp.type) {
          case "image":
            parts.push({ inline_data: { mime_type: inp.mimeType, data: b64raw(inp.data) } });
            break;
          case "text":
            parts.push({ text: inp.data });
            break;
          default:
            throw new Error(`Gemini protocol does not support input type: ${inp.type}`);
        }
      }
      parts.push({ text: prompt });
      return parts;
    },

    buildBody(_model, content, opts) {
      const body: Record<string, unknown> = { contents: [{ parts: content }] };
      if (opts.maxTokens || opts.temperature != null) {
        body.generationConfig = {
          ...(opts.maxTokens ? { maxOutputTokens: opts.maxTokens } : {}),
          ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
          ...(opts.stopSequences ? { stopSequences: opts.stopSequences } : {}),
        };
      }
      return body;
    },

    extractContent(data) {
      const candidates = ensureArray<{
        content?: { parts?: Array<{ text?: string }> };
      }>(data.candidates, "Gemini");
      if (candidates.length === 0) throw new Error("Gemini: no candidates in response");
      const text = candidates[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("No text content in Gemini response");
      return text;
    },

    parseError(data, status): ParsedError {
      const err = (data.error || data) as { status?: string; message?: string };
      if (status === 401 || status === 403 || err.status === "UNAUTHENTICATED") return { category: "auth" };
      if (status === 429 || err.status === "RESOURCE_EXHAUSTED") return { category: "rate_limit" };
      if (status >= 500 || err.status === "UNAVAILABLE") return { category: "server", message: err.message || "Server error" };
      return { category: "client", message: err.message || "Client error" };
    },

    // stream?: undefined — triggers auto-fallback in sendStream()
  },
};
