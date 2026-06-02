# CHANGELOG

## [0.2.2] — 2026-06-02

### Fixed
- 排除 `src/__tests__/` 进入 dist/ 构建产物，npm tarball 从 34 文件/103kB 精简至 22 文件/57kB

## [0.2.1] — 2026-06-02 *(deprecated)*

内部修复版本，未解决 tarball 包含测试文件的问题。见 [[0.2.2]](#022--2026-06-02)。

## [0.2.0] — 2026-06-02 *(deprecated)*

### Added
- `Protocol.stream?` 可选流式函数 —— 未实现则触发自动回退
- `GenericProvider.sendStream()` —— 返回 `AsyncIterable<StreamChunk>`
- `StreamChunk` 类型 —— `{ type: "text", content }` | `{ type: "done", usage? }`
- `GenericProviderLike.sendStream` —— 公共接口完整，`loadProviders()` 消费者可直接使用流式
- 67 个 vitest 测试（Protocol 纯函数 39、GenericProvider mock 11、Registry 17）

### Changed
- `ProtocolOverrides.extractContent` —— 此前被静默忽略（缺失分发器），已修复
- Anthropic/OpenAI 的 `parseError` 提取为共享 `defaultParseError`
- `ensureArray` 改为泛型，消除调用侧的 `as` cast
- `loadProviders` 现在只构建请求的服务商（此前遍历全部 REGISTRY）

### Fixed
- README: LOC `~300` → `480`，overrides `2` → `5` 个全可覆盖
- README: 新增 `sendStream` 使用示例

## [0.1.3] — 2026-05-31

### Changed
- Keywords 从 `skill/claude-code` 调整为 `architecture`

### Fixed
- gitignore 补充 `docs/design`，移除过期的 `AGENTS.md`

## [0.1.2] — 2026-05-31

### Changed
- 项目名 `zeshi` → `zeshim`（npm 发布名同步）
- 包名 `@unblind/zeshim` → `zeshim`（独立，去 scope）
- README 描述更新 —— N+M 架构说明、中英双版

## [0.1.1] — 2026-05-31

### Fixed
- package-lock 名称同步 `zeshi` → `zeshim`

## [0.1.0] — 2026-05-30

### Added
- 初始发布 —— 协议驱动的零依赖 LLM Provider 抽象层
- `Protocol` 接口：6 个纯函数（endpoint, auth, buildContent, buildBody, extractContent, parseError）
- 3 个内置 Protocol：`anthropic-messages`、`openai-chat-completions`、`google-generative-ai`
- `GenericProvider` —— 唯一类，零子类，`apiRequest` 可注入
- `REGISTRY` 声明式注册表（7 个服务商）+ `loadProviders()` 工厂
- `ProtocolOverrides` 机制 —— 5 个 Protocol 函数均可覆盖
- 错误归一化：`auth | rate_limit | server | client`
- ESM-only，`sideEffects: false`，零依赖
