import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { formatCost } from "@/lib/utils";

interface CategoryPoint {
  category: string;
  cost: number;
}

const COLORS: Record<string, string> = {
  llm: "#3b82f6",
  reasoning: "#8b5cf6",
  coding: "#06b6d4",
  vision: "#10b981",
  stt: "#f59e0b",
  tts: "#f97316",
  embedding: "#6b7280",
};

export function CostChart({ data }: { data: CategoryPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
        <XAxis dataKey="category" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis
          tickFormatter={(v) => formatCost(v)}
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={60}
        />
        <Tooltip formatter={(v: number) => [formatCost(v), "Cost"]} />
        <Bar dataKey="cost" radius={[4, 4, 0, 0]}>
          {data.map((entry) => (
            <rect key={entry.category} fill={COLORS[entry.category] ?? "#6b7280"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
