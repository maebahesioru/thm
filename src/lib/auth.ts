import crypto from "crypto";
import { cookies } from "next/headers";
import { config } from "./config";

export const ADMIN_COOKIE = "thm_admin";

function sign(payload: string): string {
  return crypto.createHmac("sha256", config.authSecret).update(payload).digest("hex");
}

export function adminToken(): string {
  return sign("thm-admin");
}

export function checkPassword(password: string): boolean {
  const a = Buffer.from(password);
  const b = Buffer.from(config.adminPassword);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  return store.get(ADMIN_COOKIE)?.value === adminToken();
}

export function isAdminToken(token: string | undefined): boolean {
  return !!token && token === adminToken();
}
