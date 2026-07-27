'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { LineResult } from '@/lib/domain/budget';
import { formatBRL } from '@/lib/format';

type ChartRow = {
  name: string;
  orcado: number;
  realizado: number;
};

/**
 * Uma barra por rubrica de controle (budgeted !== null), em qualquer nível da
 * árvore, mais folhas sem orçamento que receberam lançamento — essas entram
 * com Orçado zerado, para deixar visível o gasto sem cobertura orçamentária.
 * Nós de agrupamento sem orçamento próprio (cujo `realized` só reflete a soma
 * dos filhos) ficam de fora para não duplicar o gasto no gráfico.
 */
function collectRows(lines: LineResult[]): ChartRow[] {
  const rows: ChartRow[] = [];
  for (const line of lines) {
    const isLeaf = line.children.length === 0;
    if (line.isControl || (isLeaf && line.realized > 0)) {
      rows.push({
        name: line.code ? `${line.code}` : line.name,
        orcado: line.budgeted ?? 0,
        realizado: line.realized,
      });
    }
    rows.push(...collectRows(line.children));
  }
  return rows;
}

export function BudgetVsActualChart({ lines }: { lines: LineResult[] }) {
  const data = collectRows(lines);

  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma rubrica de controle cadastrada ainda.
      </p>
    );
  }

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11 }}
            className="fill-muted-foreground"
            interval={0}
            angle={-20}
            textAnchor="end"
            height={50}
          />
          <YAxis
            tickFormatter={(value: number) => formatBRL(value)}
            tick={{ fontSize: 11 }}
            className="fill-muted-foreground"
            width={90}
          />
          <Tooltip
            formatter={(value) => formatBRL(Number(value))}
            contentStyle={{
              background: 'var(--popover)',
              color: 'var(--popover-foreground)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="orcado" name="Orçado" fill="var(--color-chart-4)" radius={[3, 3, 0, 0]} />
          <Bar
            dataKey="realizado"
            name="Realizado"
            fill="var(--color-primary)"
            radius={[3, 3, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
