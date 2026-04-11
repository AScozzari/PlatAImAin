import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function formatCost(eur: number, decimals = 4): string {
  return `€${eur.toFixed(decimals)}`;
}

export function formatDate(date: string | Date): string {
  return format(new Date(date), "dd MMM yyyy HH:mm", { locale: it });
}

export function formatDateShort(date: string | Date): string {
  return format(new Date(date), "dd/MM", { locale: it });
}

export function formatRelative(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: it });
}

export function planBadgeColor(plan: string): string {
  return {
    starter: "bg-gray-100 text-gray-700",
    business: "bg-blue-100 text-blue-700",
    enterprise: "bg-purple-100 text-purple-700",
  }[plan] ?? "bg-gray-100 text-gray-700";
}

export function statusColor(status: string): string {
  return {
    healthy: "text-green-600",
    degraded: "text-yellow-600",
    unhealthy: "text-red-600",
    loading: "text-blue-600",
    not_started: "text-gray-400",
  }[status] ?? "text-gray-400";
}
