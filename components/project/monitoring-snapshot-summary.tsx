import type { MonitoringSnapshot } from '@/lib/domain/monitoring-snapshot';
import { formatBRL, formatDateBR } from '@/lib/format';
import { Card, CardContent } from '@/components/ui/card';

/**
 * Resumo numérico do registro coletado — usado na tela "Novo monitoramento"
 * (antes de criar) e na tela de detalhe (o que foi persistido). Números, não
 * prosa: é o que o gestor confere antes de copiar ou gerar qualquer texto.
 */
export function MonitoringSnapshotSummary({ snapshot }: { snapshot: MonitoringSnapshot }) {
  const { before, after } = snapshot.physicalProgress;
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <p className="eyebrow">Registro coletado</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Concluídas no período" value={String(snapshot.concludedActivities.length)} />
          <Stat label="Em andamento" value={String(snapshot.inProgressActivities.length)} />
          <Stat label="Atrasadas" value={String(snapshot.delayedActivities.length)} />
          <Stat label="Entregas fechadas" value={String(snapshot.concludedDeliverables.length)} />
        </div>
        <p className="text-sm text-muted-foreground">
          Progresso físico: {before.concluded}/{before.total} antes do período → {after.concluded}/
          {after.total} até {formatDateBR(snapshot.period.end)}.
        </p>
        <p className="text-sm text-muted-foreground">
          Financeiro do período: {snapshot.financial.periodEntries.length} lançamento(s),{' '}
          {formatBRL(snapshot.financial.periodTotal)}. Acumulado do projeto:{' '}
          {formatBRL(snapshot.financial.summary.realized)} de{' '}
          {formatBRL(snapshot.financial.summary.totalBudget)}.
        </p>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg bg-muted px-3 py-2">
      <span className="text-lg font-medium tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
