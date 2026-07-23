import { NextResponse } from "next/server";
import fs from "fs";
import { isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const items = await prisma.queueItem.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  return NextResponse.json({ items: items.map((i) => ({ ...i, filePath: undefined })) });
}

export async function DELETE(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const item = await prisma.queueItem.findUnique({ where: { id } });
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (item.status === "queued") {
    await prisma.queueItem.update({ where: { id }, data: { status: "canceled" } });
    try {
      fs.unlinkSync(item.filePath);
    } catch {}
  }
  return NextResponse.json({ ok: true });
}
