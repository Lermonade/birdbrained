import { ApiError } from "../../api/client";

/** What to tell the reader when a question to the analyst fails. */
export function askErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 503) {
    return "The analyst is busy right now. Try again in a minute.";
  }
  return error instanceof Error ? error.message : "Something went wrong.";
}
