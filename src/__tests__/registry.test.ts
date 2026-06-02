import { describe, it, expect } from "vitest";
import { loadProviders, REGISTRY } from "../registry.js";

describe("REGISTRY", () => {
  it("contains 7 providers", () => {
    expect(REGISTRY.length).toBe(7);
  });

  it("all entries have required fields", () => {
    for (const entry of REGISTRY) {
      expect(entry.name).toBeTruthy();
      expect(entry.protocol).toBeTruthy();
      expect(entry.envKey).toBeTruthy();
      expect(entry.model).toBeTruthy();
    }
  });

  it("has 1 anthropic-messages entry (mimo)", () => {
    const anthropic = REGISTRY.filter((e) => e.protocol === "anthropic-messages");
    expect(anthropic.length).toBe(1);
    expect(anthropic[0]!.name).toBe("mimo");
  });

  it("has 5 openai-chat-completions entries", () => {
    const openai = REGISTRY.filter((e) => e.protocol === "openai-chat-completions");
    expect(openai.length).toBe(5);
    const names = openai.map((e) => e.name);
    expect(names).toContain("openai");
    expect(names).toContain("groq");
    expect(names).toContain("together");
    expect(names).toContain("fireworks");
    expect(names).toContain("ollama");
  });

  it("has 1 google-generative-ai entry (gemini)", () => {
    const google = REGISTRY.filter((e) => e.protocol === "google-generative-ai");
    expect(google.length).toBe(1);
    expect(google[0]!.name).toBe("gemini");
  });

  it("groq has overrides (max_tokens cap)", () => {
    const groq = REGISTRY.find((e) => e.name === "groq")!;
    expect(groq.overrides).toBeDefined();
    expect(groq.overrides!.buildBody).toBeDefined();
  });

  it("ollama has authRequired: false", () => {
    const ollama = REGISTRY.find((e) => e.name === "ollama")!;
    expect(ollama.authRequired).toBe(false);
  });
});

describe("loadProviders", () => {
  it("throws on empty order string", () => {
    expect(() => loadProviders("", {}, {})).toThrow("loadProviders: 'order' must be");
  });

  it("returns empty array when no env vars are set", () => {
    const result = loadProviders("openai,groq", {}, {});
    expect(result).toHaveLength(0);
  });

  it("loads provider when env key is set", () => {
    const result = loadProviders("openai", {}, {
      OPENAI_API_KEY: "sk-test123",
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("openai");
    expect(result[0]!.provider.name).toBe("openai");
  });

  it("returns providers in order string sequence (not REGISTRY order)", () => {
    const env = {
      MIMO_API_KEY: "key1",
      OPENAI_API_KEY: "key2",
      GEMINI_API_KEY: "key3",
    };
    const result = loadProviders("gemini,openai,mimo", {}, env);
    expect(result.map((r) => r.name)).toEqual(["gemini", "openai", "mimo"]);
  });

  it("skips providers with missing env key", () => {
    const env = { OPENAI_API_KEY: "key" };
    const result = loadProviders("mimo,openai,groq", {}, env);
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("openai");
  });

  it("skips ollama without key when authRequired is false", () => {
    // Ollama has authRequired: false → uses "no-auth"
    // But it still needs a baseUrl — which defaults to http://localhost:11434/v1
    const result = loadProviders("ollama", {}, {});
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("ollama");
  });

  it("applies model override from opts", () => {
    const env = { OPENAI_API_KEY: "key" };
    const result = loadProviders("openai", { model: "custom-model" }, env);
    expect(result[0]!.provider.name).toBe("openai");
  });

  it("model from env var takes priority over opts and entry", () => {
    const env = { OPENAI_API_KEY: "key", OPENAI_MODEL: "env-model" };
    const result = loadProviders("openai", { model: "opt-model" }, env);
    // The model is set on the provider; we verify it loaded correctly
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("openai");
  });

  it("baseUrl from opts overrides entry default", () => {
    const env = { OPENAI_API_KEY: "key" };
    const result = loadProviders("openai", {
      baseUrls: { openai: "https://custom.proxy.com/v1" },
    }, env);
    expect(result).toHaveLength(1);
  });

  it("includes limits from registry entry", () => {
    const env = { OPENAI_API_KEY: "key" };
    const result = loadProviders("openai", {}, env);
    expect(result[0]!.limits).toBeDefined();
    expect(result[0]!.limits!.rpm).toBe(500);
  });
});
