// ── Input discriminated union ──

export interface TextInput {
  readonly type: "text";
  readonly data: string;
}

export interface ImageInput {
  readonly type: "image";
  readonly data: string; // base64 data URI
  readonly mimeType: string;
}

export interface AudioInput {
  readonly type: "audio";
  readonly data: string;
  readonly mimeType?: string;
}

export interface DocumentInput {
  readonly type: "document";
  readonly data: string;
  readonly mimeType?: string;
}

export type Input = TextInput | ImageInput | AudioInput | DocumentInput;

// ── Options ──

export interface ExecuteOptions {
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly topP?: number;
  readonly stopSequences?: string[];
}

// ── Protocol definition ──

export interface Protocol {
  readonly endpoint: string | ((model: string) => string);
  readonly auth: (apiKey: string) => Record<string, string>;
  readonly buildContent: (inputs: Input[], prompt: string) => unknown[];
  readonly buildBody: (model: string, content: unknown, opts: ExecuteOptions) => unknown;
  readonly extractContent: (data: Record<string, unknown>) => string;
  readonly parseError: (data: Record<string, unknown>, status: number) => ParsedError;
}

// ── Error types ──

export type ParsedError =
  | { readonly category: "auth"; readonly message?: string }
  | { readonly category: "rate_limit"; readonly message?: string }
  | { readonly category: "server"; readonly message: string }
  | { readonly category: "client"; readonly message: string };

// ── Provider registry ──

export interface ProviderLimits {
  readonly rpm?: number;
  readonly rpd?: number;
  readonly tpm?: number;
}

export interface ProtocolOverrides {
  readonly auth?: (proto: Protocol, apiKey: string) => Record<string, string>;
  readonly buildContent?: (proto: Protocol, inputs: Input[], prompt: string) => unknown[];
  readonly buildBody?: (proto: Protocol, model: string, content: unknown, opts: ExecuteOptions) => unknown;
  readonly extractContent?: (proto: Protocol, data: Record<string, unknown>) => string;
  readonly parseError?: (proto: Protocol, data: Record<string, unknown>, status: number) => ParsedError;
}

export interface ProviderCapabilities {
  readonly supports?: {
    readonly vision?: boolean;
    readonly streaming?: boolean;
    readonly multiImage?: boolean;
    readonly functionCalling?: boolean;
  };
  readonly strengths?: Record<string, number>;
}

export interface ProviderEntry {
  readonly name: string;
  readonly protocol: string;
  readonly envKey: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly authRequired?: boolean;
  readonly limits?: ProviderLimits;
  readonly overrides?: Partial<ProtocolOverrides>;
  readonly capabilities?: ProviderCapabilities;
  readonly expectedLatencyMs?: number;
}

// ── GenericProvider ──

export interface ProviderConfig {
  readonly name: string;
  readonly protocol: Protocol;
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  readonly timeoutMs?: number;
  readonly overrides?: Partial<ProtocolOverrides>;
}

export interface ExecuteResult {
  readonly content: string;
  readonly model: string;
  readonly processingTimeMs: number;
  readonly provider: string;
}

// ── loadProviders ──

export interface LoadProvidersOptions {
  readonly model?: string;
  readonly timeoutMs?: number;
  readonly baseUrls?: Record<string, string>;
  readonly debug?: boolean;
}

export interface LoadedProvider {
  readonly provider: GenericProviderLike;
  readonly name: string;
  readonly limits?: ProviderLimits;
}

export interface GenericProviderLike {
  readonly name: string;
  execute(params: { inputs: Input[]; prompt: string; options?: ExecuteOptions }): Promise<ExecuteResult>;
  healthCheck(): Promise<boolean>;
}

// ── API Request ──

export type ApiRequestFn = (
  url: string,
  opts: {
    body: unknown;
    headers: Record<string, string>;
    timeoutMs: number;
    providerName: string;
    parseError: (data: Record<string, unknown>, status: number) => ParsedError;
  }
) => Promise<Response>;

// ── Errors (unused exhaustive check helper) ──

export function assertNever(value: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(value)}`);
}
