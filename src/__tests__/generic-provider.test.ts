import { describe, it, expect, vi } from "vitest";
import { GenericProvider, ProviderError } from "../generic-provider.js";
import { PROTOCOLS } from "../protocols.js";
import type { ApiRequestFn, ExecuteOptions, Input } from "../types.js";

function mockResponse(json: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => json,
    headers: new Headers(),
  } as Response;
}

function makeProvider(apiReq?: ApiRequestFn): GenericProvider {
  return new GenericProvider(
    {
      name: "test-openai",
      protocol: PROTOCOLS["openai-chat-completions"]!,
      baseUrl: "https://api.test.com/v1",
      apiKey: "sk-test",
      model: "gpt-4o",
    },
    apiReq,
  );
}

const textInput: Input = { type: "text", data: "Hello" };

// ── execute() ──

describe("GenericProvider.execute", () => {
  it("returns content from API response", async () => {
    const mockFn = vi.fn<ApiRequestFn>().mockResolvedValue(
      mockResponse({ choices: [{ message: { content: "OK" } }] }),
    );
    const result = await makeProvider(mockFn).execute({
      inputs: [textInput],
      prompt: "Say hello",
    });
    expect(result.content).toBe("OK");
    expect(result.model).toBe("gpt-4o");
    expect(result.provider).toBe("test-openai");
    expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("calls apiRequest with correct URL and headers", async () => {
    const mockFn = vi.fn<ApiRequestFn>().mockResolvedValue(
      mockResponse({ choices: [{ message: { content: "OK" } }] }),
    );
    await makeProvider(mockFn).execute({ inputs: [textInput], prompt: "p" });
    const [url, opts] = mockFn.mock.calls[0]!;
    expect(url).toBe("https://api.test.com/v1/chat/completions");
    expect(opts.headers.Authorization).toBe("Bearer sk-test");
    expect(opts.providerName).toBe("test-openai");
    expect(opts.body).toBeDefined();
  });

  it("passes ExecuteOptions through to body", async () => {
    const mockFn = vi.fn<ApiRequestFn>().mockResolvedValue(
      mockResponse({ choices: [{ message: { content: "OK" } }] }),
    );
    await makeProvider(mockFn).execute({
      inputs: [textInput],
      prompt: "p",
      options: { temperature: 0.5, maxTokens: 100 },
    });
    const body = mockFn.mock.calls[0]![1].body as Record<string, unknown>;
    expect(body.temperature).toBe(0.5);
    expect(body.max_tokens).toBe(100);
  });

  it("throws ProviderError on non-200 response", async () => {
    const mockFn = vi.fn<ApiRequestFn>().mockRejectedValue(
      new ProviderError("Unauthorized", "auth", 401),
    );
    await expect(
      makeProvider(mockFn).execute({ inputs: [textInput], prompt: "p" }),
    ).rejects.toThrow(ProviderError);
    await expect(
      makeProvider(mockFn).execute({ inputs: [textInput], prompt: "p" }),
    ).rejects.toMatchObject({ category: "auth", statusCode: 401 });
  });
});

// ── sendStream() ──

describe("GenericProvider.sendStream", () => {
  it("auto-falls back to execute() when protocol has no stream", async () => {
    const mockFn = vi.fn<ApiRequestFn>().mockResolvedValue(
      mockResponse({ choices: [{ message: { content: "stream-fallback" } }] }),
    );
    const chunks: unknown[] = [];
    for await (const chunk of makeProvider(mockFn).sendStream({
      inputs: [textInput],
      prompt: "p",
    })) {
      chunks.push(chunk);
    }
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toEqual({ type: "text", content: "stream-fallback" });
    expect(chunks[1]).toEqual({ type: "done" });
  });

  it("delegates to protocol.stream when defined", async () => {
    const mockStream = async function* () {
      yield { type: "text" as const, content: "chunk1" };
      yield { type: "text" as const, content: "chunk2" };
      yield { type: "done" as const };
    };
    const protocolWithStream = { ...PROTOCOLS["openai-chat-completions"]!, stream: mockStream };
    const mockFn = vi.fn<ApiRequestFn>().mockResolvedValue(
      mockResponse({ choices: [{ message: { content: "should-not-be-called" } }] }),
    );
    const provider = new GenericProvider(
      { name: "test", protocol: protocolWithStream, baseUrl: "https://x.com", apiKey: "k", model: "m" },
      mockFn,
    );
    const chunks: unknown[] = [];
    for await (const chunk of provider.sendStream({ inputs: [textInput], prompt: "p" })) {
      chunks.push(chunk);
    }
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toEqual({ type: "text", content: "chunk1" });
    expect(chunks[1]).toEqual({ type: "text", content: "chunk2" });
    expect(chunks[2]).toEqual({ type: "done" });
    // apiRequest should NOT be called when stream is native
    expect(mockFn).not.toHaveBeenCalled();
  });

  it("propagates error from execute() during auto-fallback", async () => {
    const mockFn = vi.fn<ApiRequestFn>().mockRejectedValue(
      new ProviderError("Server error", "server", 500),
    );
    const stream = makeProvider(mockFn).sendStream({ inputs: [textInput], prompt: "p" });
    await expect(async () => {
      for await (const _ of stream) { /* drain */ }
    }).rejects.toThrow(ProviderError);
  });
});

// ── healthCheck() ──

describe("GenericProvider.healthCheck", () => {
  it("returns true when API responds with OK", async () => {
    const mockFn = vi.fn<ApiRequestFn>().mockResolvedValue(
      mockResponse({ choices: [{ message: { content: "OK" } }] }),
    );
    expect(await makeProvider(mockFn).healthCheck()).toBe(true);
  });

  it("returns false on error", async () => {
    const mockFn = vi.fn<ApiRequestFn>().mockRejectedValue(new Error("Network error"));
    expect(await makeProvider(mockFn).healthCheck()).toBe(false);
  });
});

// ── ProviderError ──

describe("ProviderError", () => {
  it("carries category and statusCode", () => {
    const err = new ProviderError("Bad request", "client", 400);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ProviderError");
    expect(err.category).toBe("client");
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe("Bad request");
  });
});

// ── Overrides ──

describe("GenericProvider with overrides", () => {
  it("applies buildBody override (e.g. Groq max_tokens cap)", async () => {
    const mockFn = vi.fn<ApiRequestFn>().mockResolvedValue(
      mockResponse({ choices: [{ message: { content: "OK" } }] }),
    );
    const provider = new GenericProvider(
      {
        name: "groq",
        protocol: PROTOCOLS["openai-chat-completions"]!,
        baseUrl: "https://api.groq.com/openai/v1",
        apiKey: "key",
        model: "llama-4",
        overrides: {
          buildBody(proto, model, content, opts) {
            const body = proto.buildBody(model, content, opts) as { max_tokens: number };
            body.max_tokens = Math.min(body.max_tokens, 4096);
            return body;
          },
        },
      },
      mockFn,
    );
    await provider.execute({
      inputs: [textInput],
      prompt: "p",
      options: { maxTokens: 16_384 },
    });
    const body = mockFn.mock.calls[0]![1].body as Record<string, unknown>;
    expect(body.max_tokens).toBe(4096); // capped
  });
});
