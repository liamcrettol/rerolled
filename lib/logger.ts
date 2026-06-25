import { Logger } from "next-axiom";
import { NextRequest } from "next/server";

export interface AppLogger {
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
  debug(message: string, fields?: Record<string, unknown>): void;
  flush(): Promise<void>;
}

export function createLogger(req: NextRequest, userId?: string): AppLogger {
  const context: Record<string, unknown> = {
    traceId: req.headers.get("x-trace-id") ?? "no-trace",
    path: req.nextUrl.pathname,
    method: req.method,
  };
  if (userId) context.userId = userId;

  const logger = new Logger();
  return logger.with(context) as AppLogger;
}
