import { z } from "zod";

export const loginSchema = z.object({
  email: z.email("이메일 형식이 아닙니다."),
  password: z.string().min(1, "비밀번호를 입력해 주세요."),
  next: z.string().optional(),
});

/** Only allow same-site relative redirects after login. */
export function safeNextPath(next: string | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/scheduler";
  return next;
}
