export const PASSWORD_RULE =
  "At least 8 characters, including one uppercase letter, one lowercase letter and one special character.";

export function validatePassword(pw: string): string | null {
  if (pw.length < 8) return "Password must be at least 8 characters.";
  if (!/[a-z]/.test(pw)) return "Password must include a lowercase letter.";
  if (!/[A-Z]/.test(pw)) return "Password must include an uppercase letter.";
  if (!/[^A-Za-z0-9]/.test(pw))
    return "Password must include at least one special character.";
  return null;
}
