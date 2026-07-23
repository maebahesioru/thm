import { prisma } from "./db";

export async function getActiveTickers() {
  const now = new Date();
  // 期限切れを自動で無効化
  await prisma.ticker.updateMany({
    where: { active: true, expiresAt: { lt: now } },
    data: { active: false },
  });
  return prisma.ticker.findMany({ where: { active: true }, orderBy: { createdAt: "desc" } });
}

export async function createTicker(text: string, kind: "info" | "breaking" = "info", ttlSec?: number) {
  return prisma.ticker.create({
    data: {
      text,
      kind,
      expiresAt: ttlSec ? new Date(Date.now() + ttlSec * 1000) : null,
    },
  });
}

// THMニュース速報テロップ (割り込み時に数秒表示)
export async function breakingNews(channelLabel: string, title: string, ttlSec = 15) {
  return createTicker(`【緊急速報】ただいま${channelLabel}で新着動画「${title}」が公開されました`, "breaking", ttlSec);
}

export async function deactivateTicker(id: string) {
  return prisma.ticker.update({ where: { id }, data: { active: false } });
}
