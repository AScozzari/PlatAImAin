import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { formatTokens } from "@/lib/utils";

interface ModelPoint {
  model: string;
  tokens: number;
}

const PALETTE = [
  "#3b82f6", "#8b5cf6", "#06b6d4", "#10b981",
  "#f59e0b", "#f97316", "#ef4444", "#6b7280",
];

export function ModelUsageChart({ data }: { data: ModelPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data}
          dataKey="tokens"
          nameKey="model"
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={85}
          paddingAngle={2}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(v: number) => [formatTokens(v), "Token"]} />
        <Legend
          formatter={(v) => <span className="text-xs">{v}</span>}
          iconSize={10}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
