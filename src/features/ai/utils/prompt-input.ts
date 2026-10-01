/** User text going into a prompt: no control characters, single spaces, bounded length. */
export function sanitizeForPrompt(text: string | null, max: number): string {
  if (!text) return "";
  return text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}
