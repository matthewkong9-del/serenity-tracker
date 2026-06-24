import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export type Stance = "Bullish" | "Bearish" | "Neutral" | null;

export function parseStance(summary: string | null): Stance {
  if (!summary) return null;
  const match = summary.match(
    /\*\*Current Stance\*\*[:\s]*\*?(Bullish|Bearish|Neutral)\*?/i
  );
  return match ? (match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase()) as Stance : null;
}

export const STANCE_COLORS: Record<NonNullable<Stance>, string> = {
  Bullish: "text-green-400 border-green-400/30 bg-green-400/10",
  Bearish: "text-red-400 border-red-400/30 bg-red-400/10",
  Neutral: "text-yellow-400 border-yellow-400/30 bg-yellow-400/10",
};

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export function timeAgo(date: Date | string): string {
  const now = new Date();
  const d = new Date(date);
  const seconds = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}
