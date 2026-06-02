# Pi vs Zeshim：Provider 层架构对比

> 2026-06-02。Pi Agent（badlogic/pi-mono）是当前 TypeScript Agent 框架中 Provider 层设计最成熟的代表。本文对比两者的设计方案，提取 zeshim 可借鉴的设计模式。

## 架构哲学对比

| | Pi | zeshim |
|------|------|------|
| **定位** | Agent 框架的 LLM 层 | 通用 Provider 基座 |
| **哲学** | "可穿透抽象"——统一接口 + 可降级到厂商原生 API | 协议纯函数 + Provider 数据行——N+M 分离 |
| **协议数** | 6 种 | 3 种 |
| **Provider 差异** | `compat` 能力标记系统 | `overrides` 机制（仅 buildBody/parseError） |
| **双通道** | `stream`/`complete`（原生）+ `streamSimple`/`completeSimple`（统一） | 无——纯执行层 |
| **模型目录** | 2000+ 自动生成（含定价） | 7 行硬编码注册表 |
| **流式** | ✅ 全协议支持 | ❌ 路线图 v0.2 |

---

## 三条值得引入的设计模式

### 1. 可穿透抽象（Penetrable Abstraction）

**Pi 的做法**：提供 `streamSimple`/`completeSimple` 统一接口，同时允许 `import from "pi-ai/anthropic"` 调用厂商原生 API 参数。不完全封闭——用户永远可以从抽象层"穿透"到原生层。

**当前 zeshim 的限制**：协议对象是封闭的——用户无法透传 Anthropic 的 `prompt caching` 配置或 Google 的 `safetySettings`。如果需要这些能力，只能绕过 zeshim 直接调 API。

**建议**：`buildBody` 加一个可选字段 `extra?: Record<string, unknown>`——厂商特定参数放在 `extra` 里透传，不被协议约束过滤。

```typescript
// 当前
buildBody(model, content, options) // options 只有 maxTokens/temperature/thinking

// 建议
buildBody(model, content, options)
// options = { maxTokens, temperature, thinking, extra?: {...} }
// extra 直接 Object.assign 到请求体上
```

**适用场景**：框架使用者需要某个 Provider 的独家能力（如 Anthropic prompt caching），不需要 zeshim 升级。

### 2. 能力标记（Compat/Capabilities）

**Pi 的做法**：每个 Provider 声明 `compat` 字段，标记该 Provider 支持什么特性（`supportsStrictMode`、`supportsEagerToolInputStreaming` 等）。上游调度器根据标记选择 Provider。

**当前 zeshim**：REGISTRY 已有 `limits`（rpm/tpm rate limits）。可以加一个 `capabilities` 字段：

```typescript
{ name: 'groq',
  protocol: 'openai-chat-completions',
  capabilities: { streaming: true, thinking: false, toolUse: false }
}
```

**不需要现在实现这些功能**——只标记哪些 Provider 能做。上游框架根据标记决定"能走流式的走 A，不能的走 B"。文档化比自动化更有价值。

**适用场景**：框架作者（Mastra、BeeAI）选 Provider 时不需要逐个查 API 文档，看注册表即可。

### 3. 流式支持（Streaming）

**Pi 的做法**：6 种协议全部实现 `StreamFunction`，每个协议的流式事件映射到统一的 `text_delta | thinking_delta | toolcall_delta` 类型。

**当前 zeshim**：协议接口是同步的，`execute()` 等待完整响应才返回。

**建议**：协议对象加可选方法 `stream?`。GenericProvider 检测：有 `stream` → 流式返回；没有 → 降级到 `execute` accumulate 返回。和 Pi 的 `completeSimple` 降级逻辑一致。

```typescript
interface Protocol {
  // 现有 6 个方法
  ...
  // v0.2 新增
  stream?: (url, headers, body, signal) => AsyncIterable<StreamEvent>;
}
```

**适用场景**：CLI 和聊天类 Agent 需要逐字输出体验，不阻塞 UI。

---

## 两条故意不跟的设计

| Pi 的设计 | 为什么不跟 |
|------|------|
| **2000+ 模型自动目录** | 框架层职责。zeshim 是基座——提供接入规范，不是模型百科。模型目录可以独立包（`@zeshim/models`） |
| **双通道（raw/simple）** | 过度抽象。zeshim 的消费者是框架作者，不是终端开发者。框架作者需要的是干净的协议层，不是"用户友好的 SDK" |

---

## 实施优先级

| 改进 | 复杂度 | 建议版本 |
|------|:---:|------|
| `buildBody` 加 `extra` 透传 | 低（改一行类型 + 一行赋值） | v0.1.3 |
| `capabilities` 字段 | 低（加一个可选字段，不影响现有代码） | v0.1.3 |
| `stream?` 可选方法 | 中（每个协议族实现不同流式映射） | v0.2 |

---

## 参考

- [Pi Agent — badlogic/pi-mono](https://github.com/badlogic/pi-mono)
- [Pi Adding LLM Providers](https://deepwiki.com/badlogic/pi-mono/7.3-adding-llm-providers)
- [Pi pi-ai: LLM API Library](https://deepwiki.com/badlogic/pi-mono/2-pi-ai:-llm-api-library)
