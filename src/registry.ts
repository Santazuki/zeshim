import { GenericProvider } from "./generic-provider.js";
import { PROTOCOLS } from "./protocols.js";
import type { ProviderEntry, ProviderConfig, LoadProvidersOptions, LoadedProvider } from "./types.js";

/**
 * Provider 注册表。
 * 新增 OpenAI 兼容 Provider → 加一行。
 * 新增协议家族 → PROTOCOLS 加一个对象 + 这里加一行。
 */
export const REGISTRY: readonly ProviderEntry[] = [
  // ── Anthropic 协议家族 ──
  {
    name: "mimo",
    protocol: "anthropic-messages",
    envKey: "MIMO_API_KEY",
    baseUrl: "https://api.xiaomimimo.com/anthropic",
    model: "mimo-v2.5",
    limits: { rpm: 60, rpd: 1000, tpm: 100_000 },
    expectedLatencyMs: 2000,
  },

  // ── OpenAI 协议家族 ──
  {
    name: "openai",
    protocol: "openai-chat-completions",
    envKey: "OPENAI_API_KEY",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o",
    limits: { rpm: 500, tpm: 2_000_000 },
    expectedLatencyMs: 2500,
  },
  {
    name: "groq",
    protocol: "openai-chat-completions",
    envKey: "GROQ_API_KEY",
    baseUrl: "https://api.groq.com/openai/v1",
    model: "llama-4-vision",
    limits: { rpm: 30, tpm: 30_000 },
    expectedLatencyMs: 800,
    overrides: {
      buildBody(proto, model, content, opts) {
        const body = proto.buildBody(model, content, opts) as { max_tokens: number };
        body.max_tokens = Math.min(body.max_tokens, 4096);
        return body;
      },
    },
  },
  {
    name: "together",
    protocol: "openai-chat-completions",
    envKey: "TOGETHER_API_KEY",
    baseUrl: "https://api.together.xyz/v1",
    model: "Llama-4-Maverick",
    limits: { rpm: 60, tpm: 60_000 },
    expectedLatencyMs: 1500,
  },
  {
    name: "fireworks",
    protocol: "openai-chat-completions",
    envKey: "FIREWORKS_API_KEY",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    model: "llama-v4",
    limits: { rpm: 60, tpm: 60_000 },
    expectedLatencyMs: 1200,
  },
  {
    name: "ollama",
    protocol: "openai-chat-completions",
    envKey: "OLLAMA_BASE_URL",
    baseUrl: "http://localhost:11434/v1",
    model: "llama3.2-vision",
    authRequired: false,
    limits: {},
    expectedLatencyMs: 500,
  },

  // ── Google 协议家族 ──
  {
    name: "gemini",
    protocol: "google-generative-ai",
    envKey: "GEMINI_API_KEY",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    model: "gemini-2.5-flash",
    limits: { rpm: 15, rpd: 1500, tpm: 1_000_000 },
    expectedLatencyMs: 1500,
  },
];

/**
 * 从注册表加载已配置的 Provider。
 *
 * @param order — "openai,groq,mimo"，按优先级从高到低
 * @param opts — 全局覆盖 + debug
 * @param env — 环境变量源（默认 process.env，测试可注入）
 * @returns 按 order 排序的 Provider 列表。debug 模式下打印跳过原因到 stderr
 */
export function loadProviders(
  order: string,
  opts: LoadProvidersOptions = {},
  env: Record<string, string | undefined> = process.env,
): LoadedProvider[] {
  if (!order || order.trim().length === 0) {
    throw new Error("loadProviders: 'order' must be a comma-separated list of provider names");
  }

  const { model, timeoutMs, baseUrls = {}, debug } = opts;
  const available = new Map<string, LoadedProvider>();
  const errors: Array<{ name: string; reason: string }> = [];

  for (const entry of REGISTRY) {
    // Lazy env read — 不在模块顶层取值
    const envBaseUrl = env[entry.name.toUpperCase() + "_BASE_URL"];
    const envModel = env[entry.name.toUpperCase() + "_MODEL"];

    const apiKey = entry.authRequired === false
      ? "no-auth"
      : (env[entry.envKey as keyof typeof env] || "");
    if (!apiKey) {
      errors.push({ name: entry.name, reason: `missing env: ${entry.envKey}` });
      continue;
    }

    const proto = PROTOCOLS[entry.protocol as keyof typeof PROTOCOLS];
    if (!proto) {
      errors.push({ name: entry.name, reason: `unknown protocol: ${entry.protocol}` });
      continue;
    }

    const baseUrl = (baseUrls[entry.name] as string | undefined)
      ?? envBaseUrl
      ?? entry.baseUrl;
    if (!baseUrl) {
      errors.push({ name: entry.name, reason: "no baseUrl configured" });
      continue;
    }

    const config: ProviderConfig = {
      name: entry.name,
      protocol: proto,
      baseUrl,
      apiKey,
      model: (envModel as string | undefined) ?? model ?? entry.model,
      timeoutMs,
      overrides: entry.overrides,
    };

    try {
      available.set(entry.name, {
        provider: new GenericProvider(config),
        name: entry.name,
        limits: entry.limits,
      });
    } catch (err) {
      errors.push({ name: entry.name, reason: `init failed: ${(err as Error).message}` });
    }
  }

  if (debug && errors.length > 0) {
    for (const e of errors) {
      process.stderr.write(`[provider-kit] SKIP ${e.name}: ${e.reason}\n`);
    }
  }

  const result: LoadedProvider[] = [];
  for (const name of order.split(",").map((s) => s.trim())) {
    const p = available.get(name);
    if (p) result.push(p);
  }
  return result;
}
