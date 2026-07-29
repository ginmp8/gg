export function normalizeEmail(email: string | null | undefined): string | null {
  const normalized = email?.trim().toLowerCase();
  return normalized ? normalized : null;
}

export function normalizeIdentityKey(name: string, email: string): string {
  const normalizedEmail = normalizeEmail(email);
  if (normalizedEmail) {
    return `email:${normalizedEmail}`;
  }

  return `name:${name.trim().toLowerCase()}`;
}

export function chooseDisplayName(name: string, email: string): string {
  const trimmedName = name.trim();
  if (trimmedName) {
    return trimmedName;
  }

  const normalizedEmail = normalizeEmail(email);
  return normalizedEmail ?? "Unknown contributor";
}
