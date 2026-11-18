// Public error categories only. Provider details and credentials stay on the server.
export type ServiceErrorCode = "configuration" | "access" | "credits" | "rateLimit" | "busy" | "timeout" | "unavailable" | "invalidReply";

export const SERVICE_MESSAGES: Record<ServiceErrorCode, string> = {
  configuration: "The AI service is not configured. Please try again later.",
  access: "The AI service cannot access its provider. Please try again later.",
  credits: "The AI service has reached its credit limit. Please try again later.",
  rateLimit: "Too many AI requests. Please wait a moment before retrying.",
  busy: "The AI provider is busy. Please try again shortly.",
  timeout: "The AI took too long. Retry to ask again.",
  unavailable: "Could not reach the AI service. Check your connection and try again.",
  invalidReply: "The AI service did not return a usable answer.",
};

export class ModelServiceError extends Error {
  constructor(readonly code: ServiceErrorCode, readonly retryable: boolean, readonly retryAfterMs = 0) {
    super(SERVICE_MESSAGES[code]);
    this.name = "ModelServiceError";
  }
}

export function isServiceErrorCode(value: unknown): value is ServiceErrorCode {
  return typeof value === "string" && Object.hasOwn(SERVICE_MESSAGES, value);
}
