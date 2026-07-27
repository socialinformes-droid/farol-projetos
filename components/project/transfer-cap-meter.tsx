'use client';

import { formatBRL } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { AlertStatus } from '@/lib/domain/budget';

type TransferCapMeterProps = {
  transferred: number;
  transferCap: number;
  capUsagePct: number;
  warningThresholdPct: number;
  status: AlertStatus;
};

const STATUS_FILL: Record<AlertStatus, string> = {
  ok: 'bg-money-up',
  aviso: 'bg-amber-500',
  violacao: 'bg-destructive',
};

export function TransferCapMeter({
  transferred,
  transferCap,
  capUsagePct,
  warningThresholdPct,
  status,
}: TransferCapMeterProps) {
  const fillPct = Math.min(100, Math.max(0, capUsagePct));
  const markerPct = Math.min(100, Math.max(0, warningThresholdPct));

  return (
    <div className="flex flex-col gap-2">
      <div className="relative h-3 w-full rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-all', STATUS_FILL[status])}
          style={{ width: `${fillPct}%` }}
        />
        <div
          className="absolute top-1/2 h-4 w-px -translate-y-1/2 bg-foreground/50"
          style={{ left: `${markerPct}%` }}
          title={`Limite de aviso: ${warningThresholdPct}%`}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        {formatBRL(transferred)} remanejados de {formatBRL(transferCap)} permitidos (
        {Math.round(capUsagePct)}% do teto)
      </p>
    </div>
  );
}
