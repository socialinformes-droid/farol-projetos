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
  /** Rótulo do eixo: nome da rubrica, encurtado para caber. */
  name: string;
  /** Nome completo, exibido no tooltip. */
  fullName: string;
  /** Código contábil, exibido junto do nome no tooltip. */
  code: string | null;
  orcado: number;
  realizado: number;
};

const MAX_LABEL = 24;

/**
 * O eixo mostra o NOME da rubrica, não o código contábil: "Passagens
 * Nacionais" se lê, "31010401001" não. O código continua acessível no
 * tooltip, para conferir contra o razão sem poluir o gráfico.
 */
function axisLabel(name: string): string {
  return name.length > MAX_LABEL ? `${name.slice(0, MAX_LABEL - 1).trimEnd()}…` : name;
}

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
        name: axisLabel(line.name),
        fullName: line.name,
        code: line.code,
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
            angle={-25}
            textAnchor="end"
            height={72}
          />
          <YAxis
            tickFormatter={(value: number) => formatBRL(value)}
            tick={{ fontSize: 11 }}
            className="fill-muted-foreground"
            width={90}
          />
          <Tooltip
            formatter={(value) => formatBRL(Number(value))}
            // O eixo mostra o nome encurtado; aqui vai o nome inteiro com o
            // código contábil ao lado, que é o que permite conferir a linha
            // contra o razão.
            labelFormatter={(_label, payload) => {
              const row = payload?.[0]?.payload as ChartRow | undefined;
              if (!row) return '';
              return row.code ? `${row.fullName} (${row.code})` : row.fullName;
            }}
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
