# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Commands

```bash
npm run build          # Compile TypeScript to dist/
npm run typecheck      # Type-check only, no emit
npm test               # Run tests (test framework TBD)
```

There is no `npm install` needed beyond `typescript` as devDependency — this is a zero-dependency library.

## Architecture

zeshi is a **protocol-driven, zero-dependency LLM provider abstraction layer** (~385 LOC core). The central insight is that **Protocol (how to call an API family) and Provider (which endpoint + key) are independent concerns** — they form an N:M relationship.

### Two-layer separation

```
Protocol (pure functions, zero state)     Provider (pure data, 1 REGISTRY line)
  └── How to speak OpenAI format            └── DeepSeek's URL + key + model name
```

A single Protocol is reused by many Providers. Adding a new OpenAI-compatible Provider requires **one line in REGISTRY**, not a new class.

### Core types and files

- **`types.ts`** — `Protocol` interface (6 pure functions), `Input` discriminated union, `ProviderEntry`, error types. The Protocol is the contract: `endpoint`, `auth`, `buildContent`, `buildBody`, `extractContent`, `parseError`.
- **`protocols.ts`** — Three built-in Protocol implementations: `anthropic-messages`, `openai-chat-completions`, `google-generative-ai`. Each is ~40-60 lines of pure functions. No classes.
- **`generic-provider.ts`** — `GenericProvider`, the **only class in the codebase**. Zero subclasses. Wires Provider config through Protocol functions, with `overrides` support for per-Provider quirks. `apiRequest` is injectable for testing.
- **`registry.ts`** — `REGISTRY` array (7 Providers) and `loadProviders()` factory that reads env vars, resolves Protocols, and returns initialized `GenericProvider` instances in priority order.
- **`index.ts`** — Public API surface. ESM-only, `sideEffects: false`, exports-fenced (`"."` entry only).

### Key design decisions (from research across 74 projects)

1. **Zero dependencies is the category definition.** Adding the first dependency reduces zeshi's distinction from "different architecture" to "less code" — and less code is not a moat.
2. **Core ≤ 500 LOC hard cap.** If a capability needs more space, it becomes a separate user-space package (e.g., `@zeshi/core-scheduler`, `@zeshi/core-validate`).
3. **Protocol maxes out at 8 functions** (6 currently, `stream?` +1, `countTokens?` +1 reserved). Needing a 9th capability means a new Protocol family, not a bigger interface.
4. **Scheduler does NOT go in Core.** `ProviderPool` exposes health status (`healthy|degraded|down`) as events. The Scheduler consumes those events but knows nothing about Protocol internals. Provider knows nothing about Scheduler.
5. **Streaming is optional** (`Protocol.stream?`) with automatic fallback — if a Protocol doesn't implement streaming, `GenericProvider` accumulates and emits once.
6. **Overrides are declarative**, not subclass-based. Only `buildBody` and `parseError` can be overridden — this covers per-Provider quirks without polluting the shared Protocol.
7. **TypeScript-first, Rust later.** The Rust `trait` system can compile-time verify Protocol implementation. When at least one framework (Mastra/Continue/BeeAI) adopts zeshi, extract the core traits to Rust with napi-rs bindings.

### Overrides mechanism

Same Protocol, different Provider quirks. Example: Groq uses OpenAI protocol but caps `max_tokens` at 4096. The `overrides` field on a `ProviderEntry` lets you hook into `buildBody`/`parseError` without touching the shared Protocol:

```typescript
overrides: {
  buildBody(proto, model, content, opts) {
    const body = proto.buildBody(model, content, opts);
    body.max_tokens = Math.min(body.max_tokens, 4096);
    return body;
  },
}
```

### Error normalization

Regardless of which Provider is called, errors are normalized to four categories: `auth` | `rate_limit` | `server` | `client`. The `ProviderError` class carries `category` and `statusCode` for upstream retry/circuit-breaker logic.

### Target users

Not end-developers — TypeScript framework authors (Mastra, BeeAI, Continue) who are maintaining 700+ lines of adapter code and don't want to be locked into LiteLLM's Python ecosystem. ~10 target teams.
