import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";

const SECRET_KEY =
  /(?:authorization|cookie|password|secret|token|api[_-]?key|connection[_-]?string)/iu;
const SECRET_VALUE =
  /(?:bearer\s+[a-z0-9._-]+|postgres(?:ql)?:\/\/[^\s@]+@)/giu;

export const AuditEventSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  timestamp: z.string().datetime(),
  question: z.string().min(1),
  resolvedEntities: z.array(z.string()),
  resolvedMetrics: z.array(z.string()),
  generatedSql: z.string().optional(),
  validation: z.enum(["accepted", "rejected", "not_run"]),
  dataSource: z.string(),
  durationMs: z.number().nonnegative(),
  rowCount: z.number().int().nonnegative(),
  provider: z
    .object({
      name: z.string(),
      model: z.string(),
      tokenUsage: z.number().optional(),
    })
    .optional(),
  success: z.boolean(),
  error: z.string().optional(),
});

export type AuditEvent = z.infer<typeof AuditEventSchema>;

export function redactSecrets(value: unknown): unknown {
  if (typeof value === "string")
    return value.replace(SECRET_VALUE, "[REDACTED]");
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        SECRET_KEY.test(key) ? "[REDACTED]" : redactSecrets(entry),
      ]),
    );
  }
  return value;
}

export function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return String(redactSecrets(message)).slice(0, 500);
}

export interface AuditStore {
  append(event: AuditEvent): Promise<void>;
  list(): Promise<AuditEvent[]>;
}

export class InMemoryAuditStore implements AuditStore {
  private readonly events: AuditEvent[] = [];

  async append(event: AuditEvent): Promise<void> {
    this.events.push(AuditEventSchema.parse(redactSecrets(event)));
  }

  async list(): Promise<AuditEvent[]> {
    return [...this.events];
  }
}

export class JsonlAuditStore implements AuditStore {
  constructor(private readonly path: string) {}

  async append(event: AuditEvent): Promise<void> {
    const sanitized = AuditEventSchema.parse(redactSecrets(event));
    await mkdir(dirname(this.path), { recursive: true });
    await appendFile(this.path, `${JSON.stringify(sanitized)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
  }

  async list(): Promise<AuditEvent[]> {
    throw new Error(
      "JSONL audit history is append-only; use an external indexed reader",
    );
  }
}
