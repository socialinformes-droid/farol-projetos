'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMonthBR, addMonthsToISO } from '@/lib/format';

export type PivotRow = {
  type: 'income' | 'expense';
  category: string;
  amount: number;
  expense_month: string | null;
  billing_month: string | null;
};

type PivotProps = {
  data: PivotRow[];
  monthAxis?: 'expense' | 'billing';
  startMonth?: string;
  monthsCount?: number;
};

type Hover = { row: string | null; col: string | null };

export function PivotTable({
  data,
  monthAxis: initialAxis = 'expense',
  startMonth = '2026-01-01',
  monthsCount = 12,
}: PivotProps) {
  const [monthAxis, setMonthAxis] = useState<'expense' | 'billing'>(initialAxis);
  const [hover, setHover] = useState<Hover>({ row: null, col: null });

  const months = useMemo(
    () => Array.from({ length: monthsCount }, (_, i) => addMonthsToISO(startMonth, i)),
    [startMonth, monthsCount],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, Map<string, Map<string, number>>>();
    let outOfRange = 0;
    for (const row of data) {
      const m = monthAxis === 'expense' ? row.expense_month : row.billing_month;
      if (!m) continue;
      if (!months.includes(m)) {
        outOfRange += row.amount;
        continue;
      }
      let tBucket = map.get(row.type);
      if (!tBucket) {
        tBucket = new Map();
        map.set(row.type, tBucket);
      }
      let cBucket = tBucket.get(row.category);
      if (!cBucket) {
        cBucket = new Map();
        tBucket.set(row.category, cBucket);
      }
      cBucket.set(m, (cBucket.get(m) ?? 0) + row.amount);
    }
    return { map, outOfRange };
  }, [data, monthAxis, months]);

  const expenseSection = buildSection(grouped.map.get('expense'), months);
  const incomeSection = buildSection(grouped.map.get('income'), months);

  const totalsByMonth = months.map((m) => {
    const exp = expenseSection.totalsByMonth.get(m) ?? 0;
    const inc = incomeSection.totalsByMonth.get(m) ?? 0;
    return exp + inc;
  });
  const totalGeral = totalsByMonth.reduce((a, b) => a + b, 0);

  const todayKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;

  const clearHover = () => setHover({ row: null, col: null });
  const isColHover = (m: string) => hover.col === m;
  const isRowHover = (rowId: string) => hover.row === rowId;

  return (
    <div className="rounded-md border border-rule/70 bg-card overflow-hidden">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-3.5 border-b-2 border-double border-rule/80 bg-paper-dark/40">
        <div>
          <p className="eyebrow">
            {monthAxis === 'expense' ? 'Cruzamento por mês de competência' : 'Cruzamento por mês de débito'}
          </p>
          <p className="text-xs text-muted-foreground italic mt-0.5">
            {formatMonthBR(months[0])} → {formatMonthBR(months[months.length - 1])}
          </p>
        </div>
        <div className="flex gap-1 rounded-full bg-paper-dark/60 p-0.5 text-[11px] self-start border border-rule/60">
          <button
            onClick={() => setMonthAxis('expense')}
            className={cn(
              'px-3 py-1 rounded-full transition-colors',
              monthAxis === 'expense'
                ? 'bg-card text-foreground font-medium shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Mês gasto
          </button>
          <button
            onClick={() => setMonthAxis('billing')}
            className={cn(
              'px-3 py-1 rounded-full transition-colors',
              monthAxis === 'billing'
                ? 'bg-card text-foreground font-medium shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Mês fatura
          </button>
        </div>
      </header>

      <div className="overflow-x-auto" onMouseLeave={clearHover}>
        <table className="w-full text-xs font-mono border-separate border-spacing-0">
          <thead>
            <tr>
              <th
                className="sticky left-0 z-20 bg-paper-dark px-4 py-2.5 text-left font-medium border-b-2 border-rule/80 min-w-[200px] text-foreground"
              >
                <span className="eyebrow">Motivo</span>
              </th>
              {months.map((m) => (
                <th
                  key={m}
                  className={cn(
                    'px-2 py-2.5 text-right font-medium whitespace-nowrap border-b-2 border-rule/80 text-foreground transition-colors',
                    m === todayKey && 'bg-accent/30',
                    isColHover(m) && 'bg-accent/40 text-foreground',
                  )}
                >
                  <span className="font-display italic font-medium not-italic">
                    {formatMonthBR(m)}
                  </span>
                </th>
              ))}
              <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap bg-paper-dark/60 border-b-2 border-rule/80 text-foreground">
                <span className="eyebrow">Total</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {expenseSection.rows.length > 0 && (
              <Section
                label="Saídas"
                sectionId="expense"
                color="red"
                rows={expenseSection.rows}
                totalsByMonth={expenseSection.totalsByMonth}
                grandTotal={expenseSection.grandTotal}
                months={months}
                todayKey={todayKey}
                hover={hover}
                setHover={setHover}
              />
            )}

            {incomeSection.rows.length > 0 && (
              <Section
                label="Entradas"
                sectionId="income"
                color="green"
                rows={incomeSection.rows}
                totalsByMonth={incomeSection.totalsByMonth}
                grandTotal={incomeSection.grandTotal}
                months={months}
                todayKey={todayKey}
                hover={hover}
                setHover={setHover}
              />
            )}

            <tr
              className={cn(
                'bg-paper-dark/50 font-medium border-double',
                isRowHover('total') && 'bg-paper-dark/70',
              )}
              onMouseEnter={() => setHover((h) => ({ ...h, row: 'total' }))}
            >
              <td className="sticky left-0 z-10 bg-paper-dark px-4 py-3 border-t-2 border-double border-rule">
                <span className="font-display text-sm italic">Calculado</span>
              </td>
              {totalsByMonth.map((v, i) => (
                <td
                  key={months[i]}
                  onMouseEnter={() => setHover({ row: 'total', col: months[i] })}
                  className={cn(
                    'px-2 py-3 text-right tabular-nums border-t-2 border-double border-rule font-medium text-sm transition-colors',
                    months[i] === todayKey && 'bg-accent/40',
                    isColHover(months[i]) && 'bg-accent/30',
                    v > 0 ? 'text-money-up' : v < 0 ? 'text-money-down' : 'text-muted-foreground/50',
                  )}
                >
                  {v === 0 ? '—' : formatNumber(v)}
                </td>
              ))}
              <td
                className={cn(
                  'px-3 py-3 text-right tabular-nums bg-paper-dark/80 border-t-2 border-double border-rule font-semibold text-sm',
                  totalGeral > 0 ? 'text-money-up' : totalGeral < 0 ? 'text-money-down' : '',
                )}
              >
                {formatNumber(totalGeral)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {grouped.outOfRange !== 0 && (
        <p className="px-5 py-2 text-[11px] text-muted-foreground/80 italic border-t border-rule/40">
          {formatNumber(grouped.outOfRange)} fora da janela
        </p>
      )}
    </div>
  );
}

type SectionData = {
  rows: { category: string; byMonth: Map<string, number>; total: number }[];
  totalsByMonth: Map<string, number>;
  grandTotal: number;
};

function buildSection(
  bucket: Map<string, Map<string, number>> | undefined,
  months: string[],
): SectionData {
  if (!bucket) return { rows: [], totalsByMonth: new Map(), grandTotal: 0 };
  const rows = [...bucket.entries()]
    .map(([category, byMonth]) => {
      const total = [...byMonth.values()].reduce((a, b) => a + b, 0);
      return { category, byMonth, total };
    })
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  const totalsByMonth = new Map<string, number>();
  for (const m of months) {
    const sum = rows.reduce((acc, r) => acc + (r.byMonth.get(m) ?? 0), 0);
    totalsByMonth.set(m, sum);
  }
  const grandTotal = rows.reduce((acc, r) => acc + r.total, 0);
  return { rows, totalsByMonth, grandTotal };
}

function Section({
  label,
  sectionId,
  color,
  rows,
  totalsByMonth,
  grandTotal,
  months,
  todayKey,
  hover,
  setHover,
}: {
  label: string;
  sectionId: string;
  color: 'red' | 'green';
  rows: SectionData['rows'];
  totalsByMonth: SectionData['totalsByMonth'];
  grandTotal: number;
  months: string[];
  todayKey: string;
  hover: Hover;
  setHover: React.Dispatch<React.SetStateAction<Hover>>;
}) {
  const [open, setOpen] = useState(true);
  const colorClass = color === 'red' ? 'text-money-down' : 'text-money-up';
  const arrow = color === 'red' ? '↑' : '↓';
  const headerRowId = `${sectionId}-header`;
  const isColHover = (m: string) => hover.col === m;
  const isRowHover = (rowId: string) => hover.row === rowId;

  return (
    <>
      <tr
        className={cn(
          'bg-paper-dark/40 hover:bg-paper-dark/60 cursor-pointer transition-colors',
          isRowHover(headerRowId) && 'bg-paper-dark/60',
        )}
        onClick={() => setOpen(!open)}
        onMouseEnter={() => setHover((h) => ({ ...h, row: headerRowId }))}
      >
        <td className="sticky left-0 z-10 bg-paper-dark px-4 py-2 font-medium">
          <span className="flex items-center gap-2">
            {open ? (
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            )}
            <span className={cn('font-display italic text-sm', colorClass)}>
              {arrow} {label}
            </span>
          </span>
        </td>
        {months.map((m) => {
          const v = totalsByMonth.get(m) ?? 0;
          return (
            <td
              key={m}
              onMouseEnter={() => setHover({ row: headerRowId, col: m })}
              className={cn(
                'px-2 py-2 text-right tabular-nums font-medium transition-colors',
                m === todayKey && 'bg-accent/30',
                isColHover(m) && 'bg-accent/30',
                v === 0 ? 'text-muted-foreground/40' : colorClass,
              )}
            >
              {v === 0 ? '—' : formatNumber(v)}
            </td>
          );
        })}
        <td className={cn('px-3 py-2 text-right tabular-nums font-semibold bg-paper-dark/60', colorClass)}>
          {formatNumber(grandTotal)}
        </td>
      </tr>

      {open &&
        rows.map((row) => {
          const rowId = `${sectionId}-${row.category}`;
          return (
            <tr
              key={`${label}-${row.category}`}
              className={cn(
                'transition-colors',
                isRowHover(rowId) ? 'bg-paper-dark/30' : 'hover:bg-paper-dark/15',
              )}
              onMouseEnter={() => setHover((h) => ({ ...h, row: rowId }))}
            >
              <td
                className={cn(
                  'sticky left-0 z-10 bg-card px-4 py-2 pl-9 transition-colors',
                  isRowHover(rowId) && 'bg-paper-dark',
                )}
              >
                <span className="inline-flex items-center gap-2.5">
                  <span className="inline-block h-1.5 w-1.5 rounded-full shrink-0 bg-muted-foreground/50" />
                  <span className="text-foreground/80">{row.category}</span>
                </span>
              </td>
              {months.map((m) => {
                const v = row.byMonth.get(m) ?? 0;
                const isCross = isColHover(m) || isRowHover(rowId);
                const isIntersection = isColHover(m) && isRowHover(rowId);
                return (
                  <td
                    key={m}
                    onMouseEnter={() => setHover({ row: rowId, col: m })}
                    className={cn(
                      'px-2 py-2 text-right tabular-nums transition-colors',
                      m === todayKey && 'bg-accent/20',
                      isCross && !isIntersection && 'bg-accent/20',
                      isIntersection && 'bg-accent/50 text-foreground font-medium',
                      v === 0
                        ? 'text-muted-foreground/30'
                        : v < 0
                          ? 'text-money-down/85'
                          : 'text-money-up/85',
                    )}
                  >
                    {v === 0 ? '·' : formatNumber(v)}
                  </td>
                );
              })}
              <td
                className={cn(
                  'px-3 py-2 text-right tabular-nums bg-paper-dark/30 font-medium transition-colors',
                  colorClass,
                  isRowHover(rowId) && 'bg-paper-dark/50',
                )}
              >
                {formatNumber(row.total)}
              </td>
            </tr>
          );
        })}
    </>
  );
}

function formatNumber(v: number): string {
  if (v === 0) return '—';
  const abs = Math.abs(v);
  const formatted = abs.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return v < 0 ? `(${formatted})` : formatted;
}
