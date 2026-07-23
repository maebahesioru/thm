import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createTicker, deactivateTicker } from "@/lib/ticker";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const tickers = await prisma.ticker.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  return NextResponse.json({ tickers });
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as
    | { text?: string; kind?: "info" | "breaking"; ttlSec?: number }
    | null;
  if (!body?.text?.trim()) return NextResponse.json({ error: "text is required" }, { status: 400 });
  const ticker = await createTicker(body.text.trim(), body.kind ?? "info", body.ttlSec);
  return NextResponse.json({ ticker });
}

export async function DELETE(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  await deactivateTicker(id);
  return NextResponse.json({ ok: true });
}
