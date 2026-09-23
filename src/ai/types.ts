// ai/types.ts - the shapes every Claude call in 2.0 speaks. Ported from 1.0's
// ai/types.ts, trimmed to what 2.0 actually has a caller for (text, tool-use,
// extended thinking) - the vision and streaming families are deliberately NOT
// ported: nothing in 2.0 calls them yet, and an unused type family is a
// maintenance cost with no test behind it.
//
// WHY A LOCAL INTERFACE AND NOT @anthropic-ai/sdk's TYPES (1.0's reasoning,
// still true): the Messages API is one JSON POST and one JSON response, so
// this package carries ZERO new runtime dependency, and every test can mock
// `AnthropicLike` with a plain object literal.
//
// Field names are camelCase throughout (repo convention - Ctx, Db, ...), even
// though Anthropic's wire format is snake_case (max_tokens/input_tokens/
// budget_tokens): anthropic-client.ts is the ONE place that translates.

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * EXTENDED THINKING (new in 2.0 - 1.0's client had no support for it, and the
 * Strategy Brain's whole premise is a model that actually reasons before it
 * answers). `budgetTokens` is the ceiling on the model's own thinking tokens
 * and must be less than the request's `maxTokens`.
 *
 * Wire shape is `{ type: 'enabled', budget_tokens: N }`; anthropic-client.ts
 * translates. When thinking is enabled the API requires temperature to be
 * unset, so the client OMITS temperature on such a request rather than making
 * every caller remember to.
 */
export interface ClaudeThinkingConfig {
  type: 'enabled';
  budgetTokens: number;
}

/** The plain (non-tool) request shape. */
export interface ClaudeRequest {
  model: string;
  system?: string;
  messages: ClaudeMessage[];
  maxTokens: number;
  temperature?: number;
  thinking?: ClaudeThinkingConfig;
}

export interface ClaudeUsage {
  /** The TRUE total input tokens - fresh + cache-read + cache-write summed (anthropic-client.ts's totalInputTokens). Pricing (ai/pricing.ts's estimateCostGbp) needs the split below to price the cached portions correctly; this field alone is what a caller with no cache awareness has always seen. */
  inputTokens: number;
  outputTokens: number;
  /** The portion of `inputTokens` that was a prompt-cache READ (Anthropic's `cache_read_input_tokens`), billed at ai/pricing.ts's CACHE_READ_MULTIPLIER of the base rate. Omitted (not zero) when the wire response carried none, so a strict `toEqual` on a non-cached response is unaffected by this field's addition. */
  cachedTokens?: number;
  /** The portion of `inputTokens` that was a prompt-cache WRITE (Anthropic's `cache_creation_input_tokens`), billed at CACHE_WRITE_MULTIPLIER. Same omit-when-zero convention as `cachedTokens`. */
  cacheWriteTokens?: number;
}

export interface ClaudeResponse {
  /** Concatenated text of every `text` content block. */
  text: string;
  /** The raw content blocks Anthropic returned. */
  content: unknown;
  usage: ClaudeUsage;
  stopReason: string | null;
  id: string;
  model: string;
}

/**
 * The single seam every Claude call crosses. `getAnthropic()` /
 * `getAnthropicWithTools()` (anthropic-client.ts) return the real fetch-based
 * implementations; every test injects its own mock satisfying this same
 * interface - metered-call.ts never imports those getters itself, so no test
 * needs ANTHROPIC_API_KEY set.
 *
 * Generic in both directions so the tool-use conversation shapes below flow
 * through the SAME metering chokepoint as a plain text call.
 */
export interface AnthropicLike<TRequest = ClaudeRequest, TResponse = ClaudeResponse> {
  messages: {
    create(request: TRequest): Promise<TResponse>;
  };
}

// --- Tool-use conversation shapes -------------------------------------------

export interface ClaudeTextBlock {
  type: 'text';
  text: string;
}

/**
 * A block of the model's own reasoning, returned only when `thinking` is
 * enabled on the request. It MUST be replayed back verbatim (including its
 * opaque `signature`) in the assistant turn of a tool-use loop - Anthropic
 * rejects a follow-up turn that drops it. That is the entire reason this block
 * is modelled at all rather than discarded like 1.0's client discarded it.
 */
export interface ClaudeThinkingBlock {
  type: 'thinking';
  thinking: string;
  signature: string;
}

/** The encrypted form of the above, returned when Anthropic's own safety systems redact the reasoning. Replayed back verbatim for exactly the same reason. */
export interface ClaudeRedactedThinkingBlock {
  type: 'redacted_thinking';
  data: string;
}

/** A tool the model chose to invoke - only ever appears in a MODEL's response, never something a caller writes into a request message. */
export interface ClaudeToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/** Every content block a model's response can contain. */
export type ClaudeContentBlock =
  | ClaudeTextBlock
  | ClaudeThinkingBlock
  | ClaudeRedactedThinkingBlock
  | ClaudeToolUseBlock;

/** The RESULT of one tool call, sent back in the NEXT user turn. `toolUseId` must match the `id` of the ClaudeToolUseBlock it answers; `isError: true` tells the model the call itself failed so it can adapt rather than treat `content` as a normal result. */
export interface ClaudeToolResultBlock {
  type: 'tool_result';
  toolUseId: string;
  content: string;
  isError?: boolean;
}

/**
 * One turn in a tool-use conversation. A plain string for an ordinary text
 * turn; an array of blocks once tool-use has started - an assistant turn that
 * called a tool is replayed back with its OWN blocks (thinking + text +
 * tool_use, same ids), and the user turn after it carries one tool_result per
 * call made in that assistant turn.
 */
export interface ClaudeToolMessage {
  role: 'user' | 'assistant';
  content: string | (ClaudeContentBlock | ClaudeToolResultBlock)[];
}

/** One tool definition offered to the model - `inputSchema` is Anthropic's `input_schema` wire field (a JSON Schema object). */
export interface ClaudeToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** The tool-use-capable request shape. `tools` is omitted on the FINAL forced-answer turn of a bounded loop (runtime.ts) to stop the model calling any more tools once the iteration cap is reached. */
export interface ClaudeToolRequest {
  model: string;
  system?: string;
  /**
   * PROMPT CACHING (2026-09-04). An OPTIONAL trailing system block sent
   * UNCACHED, straight after `system`'s own cached one — for content that is
   * genuinely different on every call (Ask sends the current London wall-clock
   * time here) and would otherwise sit inside the cached block and bust the
   * whole cached prefix on every single request. anthropic-client.ts is the
   * only place this is translated to the wire's multi-block `system` array;
   * every caller that omits it gets EXACTLY the one-block behaviour this field
   * did not exist before.
   */
  systemVolatile?: string;
  messages: ClaudeToolMessage[];
  maxTokens: number;
  temperature?: number;
  thinking?: ClaudeThinkingConfig;
  tools?: ClaudeToolDefinition[];
}

/** The tool-use-capable response shape - `content` is the TYPED block array so a caller can branch on `type === 'tool_use'` without a cast. */
export interface ClaudeToolResponse {
  text: string;
  content: ClaudeContentBlock[];
  usage: ClaudeUsage;
  stopReason: string | null;
  id: string;
  model: string;
}

// --- Streaming (added 2026-09-03, the Ask surface) ---------------------------
// 1.0's streaming type family was deliberately NOT ported ("nothing in 2.0
// calls them yet"). Ask calls them: an answer that appears a word at a time is
// the difference between "quick" and "it hung". These shapes are the MINIMUM
// that makes that true and no more - the wire's twelve event types are collapsed
// into the four a caller can actually do something with.

/**
 * ONE event off a streamed Messages call.
 *
 * `message` is TERMINAL and always last: it carries the fully re-assembled
 * response, identical in shape to the non-streamed `ClaudeToolResponse`, so a
 * caller can drive a tool loop off a stream without a second parser. The deltas
 * before it are for the SCREEN; the terminal event is for the LOGIC. Never build
 * the answer out of the deltas - a redacted or corrected final text (the numeric
 * egress check) has to be able to win.
 */
export type ClaudeStreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'thinking_delta'; text: string }
  /** Emitted when the model STARTS a tool call - before its arguments have finished streaming, which is the whole point: the screen can say "looking at the invoices…" a second before the call is even complete. */
  | { type: 'tool_use_start'; id: string; name: string }
  | { type: 'message'; response: ClaudeToolResponse };

/**
 * The streaming sibling of `AnthropicLike`. A SEPARATE interface, not a third
 * method on that one, for the same reason the tool client is a separate
 * singleton: a mock in a test implements exactly what the code under test uses,
 * and nothing that only makes plain calls should have to stub a stream.
 */
export interface AnthropicStreamLike<TRequest = ClaudeToolRequest> {
  messages: {
    stream(request: TRequest): AsyncIterable<ClaudeStreamEvent>;
  };
}
