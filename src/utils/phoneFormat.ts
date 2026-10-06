export function formatPhoneNumber(raw: string): string {
  const value = String(raw || '').trim();
  const digits = value.replace(/\D/g, '');
  const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;

  if (local.length === 10) {
    return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
  }
  return value;
}

export function formatPhoneInput(raw: string): string {
  const value = String(raw || '').trim();
  const hasLeadingPlus = value.startsWith('+');
  const digits = value.replace(/\D/g, '').slice(0, 15);
  if (!digits) return hasLeadingPlus ? '+' : '';

  // Preserve international numbers as E.164-style input and never discard
  // significant digits from longer national numbers.
  if (hasLeadingPlus) return `+${digits}`;
  if (digits.length !== 10) return digits;

  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function normalizePhoneE164(raw: string): string {
  const value = String(raw || '').trim();
  if (!value) return '';
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  if (value.startsWith('+')) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}

export function isValidE164(value: string): boolean {
  return /^\+[1-9]\d{1,14}$/.test(value);
}

export function normalizePhoneLookup(raw: string): string {
  return String(raw || '').replace(/\D/g, '').slice(-10);
}
