export function logInfo(scope: string, message: string, fields?: Record<string, unknown>): void {
  writeLog("INFO", scope, message, fields);
}

export function logWarn(scope: string, message: string, fields?: Record<string, unknown>): void {
  writeLog("WARN", scope, message, fields);
}

export function logError(scope: string, message: string, fields?: Record<string, unknown>): void {
  writeLog("ERROR", scope, message, fields);
}

function writeLog(
  level: "INFO" | "WARN" | "ERROR",
  scope: string,
  message: string,
  fields?: Record<string, unknown>,
): void {
  const line = [
    `[${new Date().toISOString()}]`,
    `[${level}]`,
    `[${scope}]`,
    message,
    formatFields(fields),
  ]
    .filter(Boolean)
    .join(" ");

  if (level === "ERROR") {
    console.error(line);
    return;
  }

  console.log(line);
}

function formatFields(fields: Record<string, unknown> | undefined): string {
  if (!fields) {
    return "";
  }

  const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    return "";
  }

  return entries
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join(" ");
}
