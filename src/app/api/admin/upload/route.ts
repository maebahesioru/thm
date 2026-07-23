import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { UPLOAD_DIR } from "@/lib/config";

export const dynamic = "force-dynamic";

// mp4アップロード -> 放送キュー登録
// formData: file(mp4), title, triggerType(after_current|after_program), programId?
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "invalid form" }, { status: 400 });
  const file = form.get("file");
  const title = String(form.get("title") || "").trim();
  const triggerType = String(form.get("triggerType") || "after_current");
  const programId = form.get("programId") ? String(form.get("programId")) : null;
  const note = form.get("note") ? String(form.get("note")) : null;

  if (!(file instanceof File)) return NextResponse.json({ error: "file is required" }, { status: 400 });
  if (!/\.(mp4|m4v|mov|mkv|webm)$/i.test(file.name)) {
    return NextResponse.json({ error: "動画ファイル(mp4等)を選択してください" }, { status: 400 });
  }

  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const safeName = file.name.replace(/[^\w.一-龯ぁ-んァ-ヶー-]+/g, "_").slice(-80);
  const fileName = `${Date.now()}_${safeName}`;
  const filePath = path.join(UPLOAD_DIR, fileName);
  const buf = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(filePath, buf);

  const item = await prisma.queueItem.create({
    data: {
      title: title || file.name,
      filePath,
      triggerType: triggerType === "after_program" ? "after_program" : "after_current",
      programId: triggerType === "after_program" ? programId : null,
      note,
    },
  });
  return NextResponse.json({ item: { ...item, filePath: undefined } });
}
