<h1 align="center">@unblind/provider-kit</h1>

<p align="center">
  <img src="https://img.shields.io/npm/v/@unblind/provider-kit?color=blue" alt="npm">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="license">
  <img src="https://img.shields.io/badge/dependencies-0-zero?labelColor=white" alt="zero deps">
  <img src="https://img.shields.io/badge/TypeScript-5.x-blue" alt="TypeScript">
</p>
<p align="center">
  <em>协议驱动的 LLM Provider 抽象。零依赖。</em>
</p>

---

[English](#english) | 中文

## 这是什么

`@unblind/provider-kit` 把 LLM Vision API 的调用抽象成两层：**协议**（怎么说话）和**Provider**（跟谁说话）。从 [unblind](https://github.com/Santazuki/unblind) 的工程实践中提取，经过 7 个 Provider、3 个协议族的生产验证。

大多数项目解决多 Provider 问题的方式是每个 Provider 写一个适配器类——Provider 数量 × API 版本 = 爆炸的组合。provider-kit 把协议定义一次，同一协议族的 Provider 只需一行配置。

```
Protocol (怎么调用 API 族)  ←  同一协议共享
Provider (哪个端点 + 哪个 Key)  ←  一行声明
```

## 安装

```bash
npm install @unblind/provider-kit
```

## 快速开始

```typescript
import { GenericProvider, PROTOCOLS } from "@unblind/provider-kit";

const provider = new GenericProvider({
  name: "openai",
  protocol: PROTOCOLS["openai-chat-completions"],
  baseUrl: "https://api.openai.com/v1",
  apiKey: process.env.OPENAI_API_KEY!,
  model: "gpt-4o",
});

const result = await provider.execute({
  inputs: [
    { type: "image", data: "data:image/png;base64,...", mimeType: "image/png" }
  ],
  prompt: "这张图里有什么？",
});

console.log(result.content);      // → "一只猫坐在窗台上..."
console.log(result.processingTimeMs);  // → 1234
```

## 核心概念

### 三种内置协议

| 协议 | 标识符 | 适用 API |
|------|--------|------|
| Anthropic Messages | `anthropic-messages` | Mimo |
| OpenAI Chat Completions | `openai-chat-completions` | OpenAI, Groq, Together, Fireworks, Ollama |
| Google Generative AI | `google-generative-ai` | Gemini |

每个协议封装了 6 个纯函数：`endpoint`、`auth`、`buildContent`、`buildBody`、`extractContent`、`parseError`。

### 多 Provider 链式调用

```typescript
import { loadProviders } from "@unblind/provider-kit";

const chain = loadProviders("mimo,openai,groq", {
  model: "gpt-4o",
  timeoutMs: 15_000,
});

for (const { provider } of chain) {
  try {
    return await provider.execute({ inputs, prompt });
  } catch (err) {
    if (err.category === "auth") throw err;  // 不重试
    continue;  // 尝试下一个 Provider
  }
}
```

### overrides 机制

同一协议族内不同 Provider 的微小差异（如 Groq 的 max_tokens 上限不同）通过 `overrides` 声明，不污染协议定义：

```typescript
{
  name: "groq",
  protocol: "openai-chat-completions",
  overrides: {
    buildBody(proto, model, content, opts) {
      const body = proto.buildBody(model, content, opts);
      body.max_tokens = Math.min(body.max_tokens, 4096);
      return body;
    },
  },
}
```

仅允许覆盖 `buildBody` 和 `parseError`。

### 错误归一化

不管调用 Anthropic、OpenAI 还是 Google 的 API，错误都会被归一化为四类：

```
auth → ClientError（不重试）
rate_limit → ServerError（重试）
server → ServerError（重试）
client → ClientError（不重试）
```

## API

### `GenericProvider`

```typescript
new GenericProvider({
  name: string;          // Provider 标识
  protocol: Protocol;    // 协议对象，从 PROTOCOLS 取
  baseUrl: string;       // API 基地址
  apiKey: string;        // API Key
  model: string;         // 模型名
  timeoutMs?: number;    // 超时，默认 30000
  overrides?: {          // 方法覆盖（仅 buildBody / parseError）
    buildBody?: (proto, model, content, opts) => object;
    parseError?: (proto, data, status) => { category, message? };
  };
})

provider.execute({ inputs, prompt, options? }): Promise<AnalyzeResult>
provider.healthCheck(): Promise<boolean>
```

### `loadProviders`

```typescript
loadProviders(order: string, opts?: {
  model?: string;
  timeoutMs?: number;
  baseUrls?: Record<string, string>;
}): Array<{ provider: GenericProvider; name: string }>
```

从 `REGISTRY` 中读取已配置的 Provider（通过环境变量启用），按 `order` 指定的顺序返回。

## 工程

- **零依赖**：纯 TypeScript，Node.js >= 18 内置模块
- **300 LOC**：5 个文件，每个职责单一
- **协议纯函数**：`buildContent`、`extractContent` 等零副作用，可直接单测
- **生产验证**：在 unblind 中跑过 7 个 Provider、171 个测试

## License

MIT

---

## English

`@unblind/provider-kit` separates **protocol** (how to call an API family) from **provider** (which endpoint + key). Extracted from [unblind](https://github.com/Santazuki/unblind), battle-tested across 7 providers and 3 protocol families.

### Install

```bash
npm install @unblind/provider-kit
```

### Quick Start

```typescript
import { GenericProvider, PROTOCOLS } from "@unblind/provider-kit";

const provider = new GenericProvider({
  name: "openai",
  protocol: PROTOCOLS["openai-chat-completions"],
  baseUrl: "https://api.openai.com/v1",
  apiKey: process.env.OPENAI_API_KEY!,
  model: "gpt-4o",
});

const result = await provider.execute({
  inputs: [{ type: "image", data: "data:image/png;base64,...", mimeType: "image/png" }],
  prompt: "What's in this image?",
});
```

### Key Concepts

- **3 built-in protocols**: Anthropic Messages, OpenAI Chat Completions, Google Generative AI
- **GenericProvider**: Single class, zero subclasses. Dispatches protocol functions.
- **Overrides**: Handle per-provider quirks (Groq's max_tokens cap) without polluting protocol definitions
- **Error normalization**: All provider errors → `auth | rate_limit | server | client`
- **Zero dependencies**: TypeScript, Node.js >= 18 built-in modules, ~300 LOC

### License

MIT
