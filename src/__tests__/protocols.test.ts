import { describe, it, expect } from "vitest";
import { PROTOCOLS } from "../protocols.js";
import type { Input } from "../types.js";

const textInput: Input = { type: "text", data: "Hello" };
const imageInput: Input = {
  type: "image",
  data: "data:image/png;base64,iVBORw0KGgo=",
  mimeType: "image/png",
};

// ── Anthropic Messages ──

describe("anthropic-messages protocol", () => {
  const proto = PROTOCOLS["anthropic-messages"]!;

  describe("endpoint", () => {
    it("returns static endpoint string", () => {
      expect(proto.endpoint).toBe("/v1/messages");
    });
  });

  describe("auth", () => {
    it("returns x-api-key and anthropic-version headers", () => {
      const headers = proto.auth("sk-ant-test123");
      expect(headers["x-api-key"]).toBe("sk-ant-test123");
      expect(headers["anthropic-version"]).toBe("2023-06-01");
    });
  });

  describe("buildContent", () => {
    it("builds text + prompt content array", () => {
      const content = proto.buildContent([textInput], "Describe");
      expect(content).toHaveLength(2);
      expect(content[1]).toEqual({ type: "text", text: "Describe" });
    });

    it("builds image content with base64 source", () => {
      const content = proto.buildContent([imageInput], "What is this?");
      expect(content).toHaveLength(2);
      const img = content[0] as { type: string; source?: { data: string } };
      expect(img.type).toBe("image");
      expect(img.source?.data).toBe("iVBORw0KGgo=");
    });

    it("throws for unsupported input type", () => {
      expect(() => proto.buildContent([{ type: "audio", data: "x" } as Input], "p"))
        .toThrow("Anthropic protocol does not support input type: audio");
    });
  });

  describe("buildBody", () => {
    it("builds body with model and max_tokens", () => {
      const body = proto.buildBody("claude-sonnet", [], {}) as Record<string, unknown>;
      expect(body.model).toBe("claude-sonnet");
      expect(body.max_tokens).toBe(2048);
      expect(body.messages).toEqual([{ role: "user", content: [] }]);
    });

    it("includes temperature when provided", () => {
      const body = proto.buildBody("x", [], { temperature: 0.7 }) as Record<string, unknown>;
      expect(body.temperature).toBe(0.7);
    });

    it("includes stop_sequences when provided", () => {
      const body = proto.buildBody("x", [], { stopSequences: ["END"] }) as Record<string, unknown>;
      expect(body.stop_sequences).toEqual(["END"]);
    });
  });

  describe("extractContent", () => {
    it("extracts text from valid response", () => {
      const text = proto.extractContent({
        content: [{ type: "text", text: "Hello World" }],
      });
      expect(text).toBe("Hello World");
    });

    it("throws when no text content found", () => {
      expect(() => proto.extractContent({}))
        .toThrow();
    });
  });

  describe("parseError", () => {
    it("returns auth for 401", () => {
      expect(proto.parseError({}, 401).category).toBe("auth");
    });
    it("returns auth for 403", () => {
      expect(proto.parseError({}, 403).category).toBe("auth");
    });
    it("returns rate_limit for 429", () => {
      expect(proto.parseError({}, 429).category).toBe("rate_limit");
    });
    it("returns server for 500+", () => {
      expect(proto.parseError({}, 500).category).toBe("server");
    });
    it("returns client for 4xx", () => {
      expect(proto.parseError({}, 404).category).toBe("client");
    });
  });

  describe("stream", () => {
    it("is undefined (triggers auto-fallback)", () => {
      expect(proto.stream).toBeUndefined();
    });
  });
});

// ── OpenAI Chat Completions ──

describe("openai-chat-completions protocol", () => {
  const proto = PROTOCOLS["openai-chat-completions"]!;

  describe("auth", () => {
    it("returns Bearer authorization header", () => {
      const headers = proto.auth("sk-test");
      expect(headers.Authorization).toBe("Bearer sk-test");
    });
  });

  describe("buildContent", () => {
    it("builds image_url content for images", () => {
      const content = proto.buildContent([imageInput], "prompt");
      const img = content[0] as { type: string; image_url?: { url: string } };
      expect(img.type).toBe("image_url");
      expect(img.image_url?.url).toBe(imageInput.data);
    });

    it("throws for unsupported input type", () => {
      expect(() => proto.buildContent([{ type: "audio", data: "x" } as Input], "p"))
        .toThrow("OpenAI protocol does not support input type: audio");
    });
  });

  describe("buildBody", () => {
    it("uses 'stop' key for stop sequences (not 'stop_sequences')", () => {
      const body = proto.buildBody("x", [], { stopSequences: ["STOP"] }) as Record<string, unknown>;
      expect(body.stop).toEqual(["STOP"]);
      expect(body.stop_sequences).toBeUndefined();
    });
  });

  describe("extractContent", () => {
    it("extracts text from choices[0].message.content", () => {
      const text = proto.extractContent({
        choices: [{ message: { content: "GPT response" } }],
      });
      expect(text).toBe("GPT response");
    });

    it("throws when no choices", () => {
      expect(() => proto.extractContent({ choices: [] }))
        .toThrow("OpenAI: no choices in response");
    });
  });

  describe("parseError", () => {
    it("returns auth for 401", () => {
      expect(proto.parseError({}, 401).category).toBe("auth");
    });
    it("returns rate_limit for 429", () => {
      expect(proto.parseError({}, 429).category).toBe("rate_limit");
    });
    it("returns server for 500+", () => {
      expect(proto.parseError({}, 502).category).toBe("server");
    });
    it("includes error message from response body", () => {
      const err = proto.parseError({ error: { message: "Bad request" } }, 400);
      expect(err.category).toBe("client");
      expect(err.message).toBe("Bad request");
    });
  });

  describe("stream", () => {
    it("is undefined (triggers auto-fallback)", () => {
      expect(proto.stream).toBeUndefined();
    });
  });
});

// ── Google Generative AI ──

describe("google-generative-ai protocol", () => {
  const proto = PROTOCOLS["google-generative-ai"]!;

  describe("endpoint", () => {
    it("uses model in dynamic endpoint path", () => {
      expect(typeof proto.endpoint).toBe("function");
      expect((proto.endpoint as (m: string) => string)("gemini-2.5-flash"))
        .toBe("/v1beta/models/gemini-2.5-flash:generateContent");
    });
  });

  describe("auth", () => {
    it("returns x-goog-api-key header", () => {
      expect(proto.auth("key123")["x-goog-api-key"]).toBe("key123");
    });
  });

  describe("buildContent", () => {
    it("builds inline_data for images", () => {
      const content = proto.buildContent([imageInput], "prompt");
      const part = content[0] as { inline_data?: { mime_type: string; data: string } };
      expect(part.inline_data?.mime_type).toBe("image/png");
      expect(part.inline_data?.data).toBe("iVBORw0KGgo=");
    });

    it("throws for unsupported input type", () => {
      expect(() => proto.buildContent([{ type: "audio", data: "x" } as Input], "p"))
        .toThrow("Gemini protocol does not support input type: audio");
    });
  });

  describe("buildBody", () => {
    it("wraps content in contents/parts", () => {
      const body = proto.buildBody("gemini", [], {}) as Record<string, unknown>;
      expect(body.contents).toEqual([{ parts: [] }]);
    });

    it("uses maxOutputTokens (not max_tokens)", () => {
      const body = proto.buildBody("x", [], { maxTokens: 100 }) as Record<string, unknown>;
      const gen = body.generationConfig as Record<string, unknown>;
      expect(gen.maxOutputTokens).toBe(100);
    });
  });

  describe("extractContent", () => {
    it("extracts text from candidates[0].content.parts[0].text", () => {
      const text = proto.extractContent({
        candidates: [{ content: { parts: [{ text: "Gemini response" }] } }],
      });
      expect(text).toBe("Gemini response");
    });

    it("throws when no candidates", () => {
      expect(() => proto.extractContent({ candidates: [] }))
        .toThrow("Gemini: no candidates in response");
    });
  });

  describe("parseError", () => {
    it("detects UNAUTHENTICATED status in body", () => {
      expect(proto.parseError({ error: { status: "UNAUTHENTICATED" } }, 200).category).toBe("auth");
    });

    it("detects RESOURCE_EXHAUSTED as rate_limit", () => {
      expect(proto.parseError({ error: { status: "RESOURCE_EXHAUSTED" } }, 200).category).toBe("rate_limit");
    });

    it("detects UNAVAILABLE as server error", () => {
      expect(proto.parseError({ error: { status: "UNAVAILABLE" } }, 200).category).toBe("server");
    });
  });

  describe("stream", () => {
    it("is undefined (triggers auto-fallback)", () => {
      expect(proto.stream).toBeUndefined();
    });
  });
});
