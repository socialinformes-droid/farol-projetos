'use client';

import { formatBRL } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { FundingModel } from '@/lib/domain/budget';

type CashPositionProps = {
  fundingModel: FundingModel;
  contributions: number;
  realized: number;
  cashBalance: number;
};

/**
 * Posição de caixa do projeto: quanto entrou, quanto saiu, e o que a diferença
 * significa — que depende da modalidade de financiamento.
 *
 * Em `adiantamento` o recurso chega antes, então saldo positivo é dinheiro
 * ainda disponível e negativo é gasto além do que entrou. Em `reembolso` a
 * ordem se inverte: gasta-se primeiro e o negativo é o valor a ressarcir, que
 * é o número que interessa acompanhar. Projeto `interno` não passa por aqui —
 * `cashBalance` é null e o dashboard não renderiza este bloco.
 */
export function CashPosition({
  fundingModel,
  contributions,
  realized,
  cashBalance,
}: CashPositionProps) {
  const adiantamento = fundingModel === 'adiantamento';

  const label = adiantamento
    ? cashBalance < 0
      ? 'Gasto além do recebido'
      : 'Saldo em caixa'
    : cashBalance < 0
      ? 'A ressarcir'
      : 'Recebido além do gasto';

  // No reembolso o negativo é o estado normal do fluxo (gastou, ainda não
  // recebeu de volta) — alarmar seria ruído. No adiantamento, negativo
  // significa ter gasto recurso que não entrou, e aí sim merece destaque.
  const alarme = adiantamento && cashBalance < 0;

  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Recebido</dt>
        <dd className="text-right tabular-nums">{formatBRL(contributions)}</dd>
        <dt className="text-muted-foreground">Gasto</dt>
        <dd className="text-right tabular-nums">{formatBRL(realized)}</dd>
      </dl>
      <div className="flex items-baseline justify-between border-t border-border pt-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span
          className={cn(
            'font-display text-xl tabular-nums',
            alarme && 'text-destructive',
          )}
        >
          {formatBRL(Math.abs(cashBalance))}
        </span>
      </div>
    </div>
  );
}
