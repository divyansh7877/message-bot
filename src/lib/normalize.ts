export function normalizeChatIdentifier(value: string): string {
  const trimmed = value.trim();
  const parts = trimmed.split(";");
  return parts[parts.length - 1]?.toLowerCase() ?? trimmed.toLowerCase();
}

export function normalizePersonIdentifier(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = normalizeChatIdentifier(value).replace(/[^\da-z@.]/gi, "");
  return normalized || null;
}

export function normalizeTitle(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
