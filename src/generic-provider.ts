import type { ProviderConfig, ProtocolOverrides, Input, ExecuteOptions, ExecuteResult, ApiRequestFn, ParsedError, StreamChunk } from "./types.js";

/** Provider 级错误，带 category 便于上游做重试/熔断判断 */
export class ProviderError extends Error {
  readonly category: string;
  readonly statusCode?: number;

  constructor(message: string, category: string, statusCode?: number) {
    super(message);
    this.name = "ProviderError";
    this.category = category;
    this.statusCode = statusCode;
  }
}

/**
 * 协议驱动的通用 Provider。
 *
 * 零子类。不包含任何协议特定逻辑。
 * 调度 protocol 对象的函数完成请求。
 * `apiRequest` 可注入（生产用带重试的 httpClient，测试用 mock）。
 */
export class GenericProvider {
  readonly name: string;
  private readonly _proto: ProviderConfig["protocol"];
  private readonly _baseUrl: string;
  private readonly _apiKey: string;
  private readonly _model: string;
  private readonly _timeoutMs: number;
  private readonly _overrides: Partial<ProtocolOverrides>;
  private readonly _apiRequest: ApiRequestFn;

  constructor(config: ProviderConfig, apiRequest?: ApiRequestFn) {
    this.name = config.name;
    this._proto = config.protocol;
    this._baseUrl = config.baseUrl;
    this._apiKey = config.apiKey;
    this._model = config.model;
    this._timeoutMs = config.timeoutMs || 30_000;
    this._overrides = config.overrides || {};
    this._apiRequest = apiRequest || defaultApiRequest;
  }

  // ── Override-aware protocol dispatch helpers ──

  private _auth(apiKey: string): Record<string, string> {
    const override = this._overrides.auth;
    if (override) return override(this._proto, apiKey);
    return this._proto.auth(apiKey);
  }

  private _buildContent(inputs: Input[], prompt: string): unknown[] {
    const override = this._overrides.buildContent;
    if (override) return override(this._proto, inputs, prompt);
    return this._proto.buildContent(inputs, prompt);
  }

  private _buildBody(model: string, content: unknown, opts: ExecuteOptions): unknown {
    const override = this._overrides.buildBody;
    if (override) return override(this._proto, model, content, opts);
    return this._proto.buildBody(model, content, opts);
  }

  private _extractContent(data: Record<string, unknown>): string {
    const override = this._overrides.extractContent;
    if (override) return override(this._proto, data);
    return this._proto.extractContent(data);
  }

  private _parseError(data: Record<string, unknown>, status: number): ParsedError {
    const override = this._overrides.parseError;
    if (override) return override(this._proto, data, status);
    return this._proto.parseError(data, status);
  }

  // ── Public API ──

  async execute({ inputs, prompt, options = {} }: {
    inputs: Input[];
    prompt: string;
    options?: ExecuteOptions;
  }): Promise<ExecuteResult> {
    const startTime = Date.now();

    const content = this._buildContent(inputs, prompt);
    const body = this._buildBody(this._model, content, options);
    const headers = this._auth(this._apiKey);

    const ep = typeof this._proto.endpoint === "function"
      ? this._proto.endpoint(this._model)
      : this._proto.endpoint;

    const res = await this._apiRequest(`${this._baseUrl}${ep}`, {
      body,
      headers,
      timeoutMs: this._timeoutMs,
      providerName: this.name,
      parseError: (data, status) => this._parseError(data, status),
    });

    const data = await res.json() as Record<string, unknown>;
    const text = this._extractContent(data);

    return {
      content: text,
      model: this._model,
      processingTimeMs: Date.now() - startTime,
      provider: this.name,
    };
  }

  /** 流式调用——Protocol 有原生 stream 则代理，无则自动回退到 execute() 后一次性 emit */
  async *sendStream({ inputs, prompt, options = {}, signal }: {
    inputs: Input[];
    prompt: string;
    options?: ExecuteOptions;
    signal?: AbortSignal;
  }): AsyncIterable<StreamChunk> {
    if (this._proto.stream) {
      const content = this._buildContent(inputs, prompt);
      yield* this._proto.stream(this._model, content, options, signal);
    } else {
      // Auto-fallback: accumulate via execute()
      const result = await this.execute({ inputs, prompt, options });
      yield { type: "text", content: result.content };
      yield { type: "done" };
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const miniPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
      const result = await this.execute({
        inputs: [{ type: "image", data: miniPng, mimeType: "image/png" }],
        prompt: 'Reply with exactly "OK".',
        options: { maxTokens: 10 },
      });
      return result.content.trim().toUpperCase() === "OK";
    } catch {
      return false;
    }
  }
}

// ── Default API request (可注入替换) ──

async function defaultApiRequest(url: string, opts: {
  body: unknown;
  headers: Record<string, string>;
  timeoutMs: number;
  providerName: string;
  parseError: (data: Record<string, unknown>, status: number) => ParsedError;
}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...opts.headers },
      body: JSON.stringify(opts.body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as Record<string, unknown>;
      const parsed = opts.parseError(data, res.status);
      throw new ProviderError(
        parsed.message || `${parsed.category} error (${res.status})`,
        parsed.category,
        res.status,
      );
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}
