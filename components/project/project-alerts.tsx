import type { ReactNode } from 'react';
import Link from 'next/link';
import { TriangleAlertIcon, OctagonXIcon } from 'lucide-react';

import type { ProjectSummary } from '@/lib/domain/budget';
import { formatBRL } from '@/lib/format';
import { cn } from '@/lib/utils';

type AlertSeverity = 'vermelho' | 'ambar';

type AlertItem = {
  key: string;
  severity: AlertSeverity;
  message: ReactNode;
};

const SEVERITY_STYLE: Record<AlertSeverity, string> = {
  vermelho: 'border-destructive/30 bg-destructive/10 text-destructive',
  ambar: 'border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-400',
};

export function ProjectAlerts({
  projectId,
  summary,
}: {
  projectId: string;
  summary: ProjectSummary;
}) {
  const alerts: AlertItem[] = [];

  if (summary.overBudget) {
    alerts.push({
      key: 'over-budget',
      severity: 'vermelho',
      message: `Orçamento estourado: realizado de ${formatBRL(summary.realized)} contra total de ${formatBRL(summary.totalBudget)}.`,
    });
  }

  if (summary.transferred > summary.transferCap) {
    alerts.push({
      key: 'cap-exceeded',
      severity: 'vermelho',
      message: `Teto de remanejamento excedido: ${formatBRL(summary.transferred)} contra o limite de ${formatBRL(summary.transferCap)}.`,
    });
  }

  if (summary.status === 'aviso') {
    if (summary.budgetControl === 'global') {
      // Sem teto de remanejamento, o aviso é sobre a execução do total —
      // falar de remanejamento aqui descreveria um controle que não existe
      // neste projeto.
      alerts.push({
        key: 'execution-warning',
        severity: 'ambar',
        message: `Orçamento em ${Math.round(summary.executionPct)}% de execução — restam ${formatBRL(summary.available)}.`,
      });
    } else {
      const remaining = summary.transferCap - summary.transferred;
      alerts.push({
        key: 'cap-warning',
        severity: 'ambar',
        message: `Remanejamento em ${Math.round(summary.capUsagePct)}% do teto — restam ${formatBRL(remaining)}.`,
      });
    }
  }

  if (summary.linesWithoutBudget > 0) {
    const n = summary.linesWithoutBudget;
    alerts.push({
      key: 'lines-without-budget',
      severity: 'ambar',
      message: (
        <>
          {n} rubrica{n === 1 ? '' : 's'} com gasto e sem orçamento definido. O cálculo do teto
          está incompleto.{' '}
          <Link
            href={`/projetos/${projectId}/financeiro/rubricas`}
            className="underline underline-offset-2"
          >
            Ver rubricas
          </Link>
        </>
      ),
    });
  }

  if (summary.unclassifiedTotal !== 0) {
    alerts.push({
      key: 'unclassified',
      severity: 'ambar',
      message: (
        <>
          {formatBRL(summary.unclassifiedTotal)} em lançamentos sem rubrica.{' '}
          <Link
            href={`/projetos/${projectId}/financeiro/lancamentos?rubrica=sem`}
            className="underline underline-offset-2"
          >
            Ver lançamentos
          </Link>
        </>
      ),
    });
  }

  if (alerts.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {alerts.map((alert) => (
        <div
          key={alert.key}
          className={cn(
            'flex items-start gap-2 rounded-lg border px-3 py-2 text-sm',
            SEVERITY_STYLE[alert.severity],
          )}
        >
          {alert.severity === 'vermelho' ? (
            <OctagonXIcon className="mt-0.5 size-4 shrink-0" />
          ) : (
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
          )}
          <span>{alert.message}</span>
        </div>
      ))}
    </div>
  );
}
