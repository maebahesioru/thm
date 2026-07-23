import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await prisma.setting.upsert({
    where: { key: "engineCommand" },
    update: { value: "skip" },
    create: { key: "engineCommand", value: "skip" },
  });
  return NextResponse.json({ ok: true });
}
