export type QboFaultDetail = {
  code: string;
  message: string;
  detail: string;
  element: string;
};

/** Shareable Intuit failure. Tokens and request bodies are never included. */
export type QboErrorLog = {
  occurredAt: string;
  intuitTid: string;
  httpStatus: number;
  method: string;
  endpoint: string;
  realmId: string;
  faultType: string;
  intuitTime: string;
  errors: QboFaultDetail[];
  shareable: string;
};

export class QboApiError extends Error {
  readonly log: QboErrorLog;

  constructor(log: QboErrorLog) {
    super(summarizeQboError(log));
    this.name = "QboApiError";
    this.log = log;
  }
}

const SECRET = /(?:bearer\s+)[a-z0-9\-._~+/]+=*|eyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}|(?:access_token|refresh_token|client_secret|id_token|authorization)["']?\s*[:=]\s*["']?[^"',\s}]+/gi;

export function redactQboText(value: string) {
  return value.replace(SECRET, "[redacted]").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
}

export function qboLogOf(error: unknown): QboErrorLog | undefined {
  if (!error || typeof error !== "object" || !("log" in error)) return undefined;
  const log = (error as { log?: unknown }).log;
  if (!log || typeof log !== "object") return undefined;
  const record = log as Partial<QboErrorLog>;
  if (typeof record.intuitTid !== "string" || typeof record.httpStatus !== "number" || !Array.isArray(record.errors)) return undefined;
  return record as QboErrorLog;
}

export function intuitTidFrom(headers: { get(name: string): string | null }, payload: unknown) {
  const header = headers.get("intuit_tid") || headers.get("intuit-tid") || "";
  const body = payload && typeof payload === "object"
    ? (payload as { intuit_tid?: unknown; intuitTid?: unknown }).intuit_tid
      || (payload as { intuitTid?: unknown }).intuitTid
    : "";
  return asText(header || body, 200);
}

export function qboEndpointLabel(path: string) {
  const resource = path.split("?")[0].split("#")[0].replace(/^\/+/, "").replace(/\/+$/, "");
  const collapsed = resource.replace(/\/\d+/g, "/{id}");
  const safe = collapsed.replace(/[^a-zA-Z0-9_./{}-]/g, "");
  return safe.slice(0, 160) || "request";
}

export function qboMethod(value: string | undefined) {
  const method = (value || "GET").toUpperCase();
  return method === "POST" || method === "PUT" || method === "DELETE" || method === "PATCH" || method === "GET" ? method : "GET";
}

export function buildQboErrorLog(input: {
  occurredAt?: string;
  intuitTid?: string;
  httpStatus: number;
  method: string;
  endpoint: string;
  realmId?: string;
  payload: unknown;
}): QboErrorLog {
  const parsed = errorsFromPayload(input.payload);
  const errors = parsed.errors.length
    ? parsed.errors
    : [{ code: "", message: input.httpStatus ? `QuickBooks returned ${input.httpStatus}.` : "QuickBooks could not be reached.", detail: "", element: "" }];
  const log: QboErrorLog = {
    occurredAt: input.occurredAt || new Date().toISOString(),
    intuitTid: asText(input.intuitTid || parsed.bodyTid, 200),
    httpStatus: input.httpStatus,
    method: qboMethod(input.method),
    endpoint: qboEndpointLabel(input.endpoint),
    realmId: asText(input.realmId, 40),
    faultType: parsed.faultType,
    intuitTime: parsed.intuitTime,
    errors,
    shareable: "",
  };
  log.shareable = formatQboErrorLog(log);
  return log;
}

export function summarizeQboError(log: QboErrorLog) {
  const first = log.errors[0];
  const detail = [first?.code ? `code ${first.code}` : "", first?.message || ""].filter(Boolean).join(" ");
  const status = log.httpStatus ? `QuickBooks returned ${log.httpStatus}` : "QuickBooks could not be reached";
  const body = detail ? `${status}: ${detail}` : `${status}.`;
  const tid = log.intuitTid ? ` intuit_tid ${log.intuitTid}` : "";
  return `${body}${tid}`.replace(/\s+/g, " ").trim().slice(0, 400);
}

export function formatQboErrorLog(log: QboErrorLog) {
  const lines = [
    "QuickBooks Online error",
    `occurred_at: ${log.occurredAt}`,
    `intuit_tid: ${log.intuitTid || "(not returned)"}`,
    `http_status: ${log.httpStatus || 0}`,
    `method: ${log.method}`,
    `endpoint: ${log.endpoint}`,
    `realm_id: ${log.realmId || ""}`,
    `fault_type: ${log.faultType || ""}`,
    `intuit_time: ${log.intuitTime || ""}`,
    "errors:",
  ];
  for (const [index, item] of log.errors.entries()) {
    lines.push(`  ${index + 1}. code: ${item.code}`);
    lines.push(`     message: ${item.message}`);
    lines.push(`     detail: ${item.detail}`);
    lines.push(`     element: ${item.element}`);
  }
  return lines.join("\n").slice(0, 8000);
}

export async function reportQboFailure(input: {
  status: number;
  intuitTid: string;
  method: string;
  endpoint: string;
  realmId?: string;
  payload: unknown;
  recordError?: (log: QboErrorLog) => Promise<void> | void;
}) {
  const log = buildQboErrorLog({
    intuitTid: input.intuitTid,
    httpStatus: input.status,
    method: input.method,
    endpoint: input.endpoint,
    realmId: input.realmId,
    payload: input.payload,
  });
  console.error(`[qbo] Intuit error\n${log.shareable}`);
  try {
    await input.recordError?.(log);
  } catch (error) {
    const message = error instanceof Error ? redactQboText(error.message) : "store failed";
    console.error("[qbo] error log was not stored", message.slice(0, 300));
  }
  return log;
}

export function tidInText(value: string) {
  return /intuit_tid[:\s]+([A-Za-z0-9][A-Za-z0-9._:-]{0,120})/i.exec(value)?.[1] || "";
}

function errorsFromPayload(payload: unknown) {
  const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const fault = record.Fault || record.fault;
  const bodyTid = asText(record.intuit_tid || record.intuitTid, 200);
  const intuitTime = asText(record.time, 80);
  if (fault && typeof fault === "object") {
    const body = fault as Record<string, unknown>;
    const rawErrors = body.Error || body.error || [];
    const list = Array.isArray(rawErrors) ? rawErrors : [rawErrors];
    return {
      faultType: asText(body.type, 80),
      intuitTime,
      bodyTid,
      errors: list.map(faultDetail).filter(hasContent).slice(0, 20),
    };
  }
  const oauthError = asText(record.error, 80);
  const oauthDetail = asText(record.error_description, 2000);
  if (oauthError || oauthDetail) {
    return {
      faultType: "oauth",
      intuitTime,
      bodyTid,
      errors: [{ code: oauthError === "network" ? "" : oauthError, message: oauthDetail || oauthError, detail: "", element: "" }].filter(hasContent),
    };
  }
  const raw = asText(record.raw, 1500);
  if (raw) {
    return {
      faultType: "",
      intuitTime,
      bodyTid,
      errors: [{ code: "", message: "QuickBooks returned a non-JSON error.", detail: raw, element: "" }],
    };
  }
  return { faultType: "", intuitTime, bodyTid, errors: [] as QboFaultDetail[] };
}

function faultDetail(value: unknown): QboFaultDetail {
  const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    code: asText(item.code ?? item.Code, 40),
    message: asText(item.Message ?? item.message, 2000),
    detail: asText(item.Detail ?? item.detail, 2000),
    element: asText(item.element ?? item.Element, 200),
  };
}

function hasContent(error: QboFaultDetail) {
  return Boolean(error.code || error.message || error.detail || error.element);
}

function asText(value: unknown, max: number) {
  const text = typeof value === "number" && Number.isFinite(value)
    ? String(value)
    : typeof value === "string"
      ? value
      : "";
  return redactQboText(text).replace(/\s+/g, " ").trim().slice(0, max);
}
