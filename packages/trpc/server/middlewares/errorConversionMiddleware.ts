import { convertErrorWithCodeToTRPCError } from "../lib/toTRPCError";
import { middleware } from "../trpc";

/** Converts domain errors returned by downstream tRPC layers to TRPCError. */
export const errorConversionMiddleware = middleware(async ({ next }) => {
  const result = await next();

  if (!result.ok) {
    throw convertErrorWithCodeToTRPCError(result.error);
  }

  return result;
});
