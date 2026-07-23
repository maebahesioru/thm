import { NextResponse } from "next/server";
import { checkPassword, adminToken, ADMIN_COOKIE } from "@/lib/auth";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { password?: string } | null;
  if (!body?.password || !checkPassword(body.password)) {
    return NextResponse.json({ error: "パスワードが違います" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, adminToken(), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
