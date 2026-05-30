# @unblind/provider-kit

> Protocol-driven LLM provider abstraction. Zero dependencies. Built from the engineering patterns behind [unblind](https://github.com/Santazuki/unblind).

## Why

Every AI agent tool that calls external APIs faces the same problems: different API protocols (Anthropic vs OpenAI vs Google), inconsistent error formats, missing retry strategies, no circuit breaker. Most projects solve this by writing an adapter class per provider — leading to N×M explosion as providers multiply.

**provider-kit** separates **protocol** (how to call an API family) from **provider** (which endpoint + key to use). New provider in the same protocol family = 1 line of config. New protocol family = 1 protocol object.

## Install

```bash
npm install @unblind/provider-kit
```

## Quick Start

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

console.log(result.content);
// → "A cat sitting on a windowsill..."
console.log(result.processingTimeMs);
// → 1234
```

## Multi-Provider Chain

```typescript
import { loadProviders } from "@unblind/provider-kit";

const chain = loadProviders("mimo,openai,groq", {
  model: "gpt-4o",  // override all models
  timeoutMs: 15_000,
});

for (const { provider } of chain) {
  try {
    return await provider.execute({ inputs, prompt });
  } catch (err) {
    if (err.category === "auth") throw err; // don't retry
    continue; // try next provider
  }
}
```

## Built-in Protocols

| Protocol | Provider Count | Example APIs |
|----------|:---:|------|
| `anthropic-messages` | 1 | Mimo |
| `openai-chat-completions` | 5 | OpenAI, Groq, Together, Fireworks, Ollama |
| `google-generative-ai` | 1 | Gemini |

## License

MIT
