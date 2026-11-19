/** Strip formatting and hidden direction marks, then keep the last 10 NANP digits. */
export function phoneKey(value: string): string {
  const stripped = value.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff\u00ad]/g, "");
  const digits = stripped.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  if (digits.length > 11) return digits.slice(-10);
  return digits;
}

export function phonesMatch(left: string, right: string): boolean {
  const a = phoneKey(left);
  const b = phoneKey(right);
  return a.length >= 10 && a === b;
}
