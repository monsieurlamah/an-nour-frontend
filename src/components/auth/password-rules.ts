// Pure password-policy helpers, kept in their own module so the component
// file (password.tsx) only exports components — required for React Fast
// Refresh, and lets non-UI code (validation, tests) import the rules too.
//
// Mirrors the backend policy in
// app/security/password.py::validate_password_strength.

export const PASSWORD_RULES: { key: string; ok: (p: string) => boolean }[] = [
  { key: "auth.pwdReqLength", ok: (p) => p.length >= 8 },
  { key: "auth.pwdReqLower", ok: (p) => /[a-z]/.test(p) },
  { key: "auth.pwdReqUpper", ok: (p) => /[A-Z]/.test(p) },
  { key: "auth.pwdReqDigit", ok: (p) => /[0-9]/.test(p) },
  { key: "auth.pwdReqSymbol", ok: (p) => /[^A-Za-z0-9]/.test(p) },
];

export function passwordIsStrong(password: string): boolean {
  return PASSWORD_RULES.every((r) => r.ok(password)) && !/\s/.test(password);
}

/** Number of satisfied rules — for the strength meter. */
export function passwordScore(password: string): number {
  return PASSWORD_RULES.filter((r) => r.ok(password)).length;
}
