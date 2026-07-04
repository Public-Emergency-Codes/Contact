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
  const digits = String(raw || '').replace(/\D/g, '');
  const local = digits.length > 10 && digits.startsWith('1') ? digits.slice(1, 11) : digits.slice(0, 10);

  if (local.length === 0) return '';
  if (local.length < 4) return local;
  if (local.length < 7) return `(${local.slice(0, 3)}) ${local.slice(3)}`;
  return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
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
