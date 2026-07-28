'use client';

import { formatBRL } from '@/lib/format';
import { cn } from '@/lib/utils';

type BudgetExecutionMeterProps = {
  realized: number;
  totalBudget: number;
  available: number;
  executionPct: number;
  overBudget: boolean;
};

/**
 * Quanto do orçamento total já foi executado.
 *
 * Não confundir com o TransferCapMeter, que mede o consumo do teto de
 * remanejamento entre rubricas. São coisas independentes: um projeto pode
 * estar com 90% do orçamento gasto e o teto intacto, se nenhuma rubrica
 * estourou o próprio valor.
 */
export function BudgetExecutionMeter({
  realized,
  totalBudget,
  available,
  executionPct,
  overBudget,
}: BudgetExecutionMeterProps) {
  const fillPct = Math.min(100, Math.max(0, executionPct));

  return (
    <div className="flex flex-col gap-2">
      <div className="relative h-3 w-full rounded-full bg-muted">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            overBudget ? 'bg-destructive' : 'bg-primary',
          )}
          style={{ width: `${fillPct}%` }}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        {formatBRL(realized)} executados de {formatBRL(totalBudget)} ({Math.round(executionPct)}% do
        orçamento){' '}
        {overBudget ? (
          <span className="text-destructive">
            — excedido em {formatBRL(Math.abs(available))}
          </span>
        ) : (
          <>— restam {formatBRL(available)}</>
        )}
      </p>
    </div>
  );
}
