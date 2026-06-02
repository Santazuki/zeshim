<h1 align="center">Zeshim</h1>
<p align="center"><em>复杂度从 N×M 降到 N+M —— 协议驱动 + 零依赖的 LLM Provider 基座</em></p>
<p align="center">
  <a href="#english">English</a> | 中文
</p>

<p align="center">
  <img src="https://img.shields.io/npm/v/zeshim?color=blue" alt="npm">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="license">
  <img src="https://img.shields.io/badge/dependencies-0-zero?labelColor=white" alt="zero deps">
  <img src="https://img.shields.io/badge/TypeScript-5.x-blue" alt="TypeScript">
</p>

---

## 这是什么

LLM API 只有 3 种协议，但走同一种协议的服务商可以有无数个。把 **协议**（怎么发请求）和 **Provider**（连到哪）拆开——复杂度从 N×M 子类爆炸变成 N 行数据 + M 个协议对象。

启发自 [unblind](https://github.com/Santazuki/unblind) 的 Provider 层设计，经过 7 个 Provider、3 个协议族的生产验证。

```
协议（纯函数，写一次）  ←  3 个对象，各自独立演化
Provider（纯数据，一行一个）  ←  厂商 + 协议 = 一条注册表条目
模型（字段值，不占条目）  ←  环境变量切换，不碰注册表
```

**换模型不改代码。加厂商不加协议。加协议不改注册表。** 三个维度独立。

## 安装

```bash
npm install zeshim
```

## 快速开始

```typescript
import { GenericProvider, PROTOCOLS } from "zeshim";

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

console.log(result.content);           // → "一只猫坐在窗台上..."
console.log(result.processingTimeMs);  // → 1234
```

## 核心概念

### N×M → N+M

子类方案：每个 Provider 一个类，每家厂商 × 每个协议 = 一个子类。7 个 Provider 三个协议族 = 7 个子类 + build 函数。

协议方案：协议是纯函数对象（M 个），Provider 是注册表数据（N 行）。同一厂商双协议接入？加一行，不写代码。

| | 子类方案 | 协议方案 |
|------|:---:|:---:|
| 同协议加厂商 | 写 build 函数 | 加一行数据 |
| 同厂商加协议 | 写新子类 | 加一行数据 |
| 换模型 | 改字段 ✅ | 改字段 ✅ |
| 协议逻辑单测 | ❌ 需 Key | ✅ 纯函数 |


```typescript
import { loadProviders } from "zeshim";

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

同一协议族内不同 Provider 的微小差异通过 `overrides` 声明，不污染协议定义。仅允许覆盖 `buildBody` 和 `parseError`。

### 错误归一化

不管调用哪个 API，错误统一为四类：`auth` → `rate_limit` → `server` → `client`

## API

`GenericProvider` — 唯一类，零子类。调度协议函数完成请求。

`loadProviders(order, opts?)` — 从 `REGISTRY` 读取已配置的 Provider，按 `order` 顺序返回。

## 工程

- **零依赖**：纯 TypeScript，Node.js >= 18 内置模块
- **~300 LOC**：5 个文件，每个职责单一
- **协议纯函数**：`buildContent`、`extractContent` 等零副作用，可直接单测
- **生产验证**：在 unblind 中跑过 7 个 Provider、171 个测试

---

<span id="english"></span>

## English

`zeshim` separates **protocol** (how to call an API family) from **provider** (which endpoint + key). Complexity drops from N×M to N+M — 3 protocol objects + N registry rows = all providers. Switch models by changing a field, add providers by adding a row, add protocols by adding an object. All three dimensions independent.

Inspired by the provider layer design of [unblind](https://github.com/Santazuki/unblind), battle-tested across 7 providers and 3 protocol families.

```bash
npm install zeshim
```

```typescript
import { GenericProvider, PROTOCOLS } from "zeshim";

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

**Key Concepts**: N+M architecture · 3 built-in protocols · GenericProvider (single class, zero subclasses) · Overrides for per-provider quirks · Error normalization (auth|rate_limit|server|client) · Zero dependencies, ~300 LOC.

## 参与贡献

欢迎提 Issue 和 PR。

### 开发环境

```bash
git clone https://github.com/Santazuki/zeshim.git
npm install       # 仅 TypeScript 编译器
npm run build     # 编译到 dist/
```

### 运行测试

```bash
npm test
```

### License

MIT
