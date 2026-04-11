import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatTokens, formatDateShort } from "@/lib/utils";

interface DailyPoint {
  date: string;
  tokens: number;
}

export function TokenUsageChart({ data }: { data: DailyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="tokenGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="date"
          tickFormatter={formatDateShort}
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tickFormatter={formatTokens}
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={48}
        />
        <Tooltip
          formatter={(v: number) => [formatTokens(v), "Token"]}
          labelFormatter={(l) => formatDateShort(l)}
        />
        <Area
          type="monotone"
          dataKey="tokens"
          stroke="#3b82f6"
          strokeWidth={2}
          fill="url(#tokenGrad)"
          dot={false}
          activeDot={{ r: 4 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
