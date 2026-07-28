'use client';

import Link from 'next/link';
import { toast } from 'sonner';
import { CopyIcon, ArrowRightIcon } from 'lucide-react';

import type { ProjectRow } from '@/lib/supabase/types';
import type { PhysicalSchedule } from '@/lib/domain/physical-queries';
import { buildPhysicalDashboard, type QueueItem } from '@/lib/domain/physical-dashboard';
import { formatDateBR } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { BackLink } from '@/components/layout/back-link';
import { DimensionTabs } from '@/components/layout/dimension-tabs';

const STATUS_LABEL: Record<string, string> = {
  planejamento: 'Planejamento',
  ativo: 'Ativo',
  encerrado: 'Encerrado',
};

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('Data copiada.');
  } catch {
    toast.error('Não foi possível copiar.');
  }
}

/**
 * Dashboard do módulo físico. A fila de pendências vem primeiro de propósito
 * — é o produto desta tela, não o cronograma em si (ver contexto do
 * módulo: o Farol existe pra guardar quando o gestor registrou o progresso,
 * antes de ele lembrar de digitar no SGF).
 */
export function FisicoView({
  project,
  schedule,
}: {
  project: ProjectRow;
  schedule: PhysicalSchedule;
}) {
  const dashboard = buildPhysicalDashboard(schedule.deliverables, schedule.activities);
  const hasData = schedule.deliverables.length > 0;
  const pct = dashboard.total > 0 ? Math.round((dashboard.concluded / dashboard.total) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <BackLink href={`/projetos/${project.id}`} label={project.name} />
        <DimensionTabs projectId={project.id} active="fisico" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-2xl">Físico</h1>
              <Badge variant="outline">{STATUS_LABEL[project.status]}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {project.code} — {project.name}
            </p>
          </div>
          {hasData && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href={`/projetos/${project.id}/fisico/entregas`} />}
              >
                Entregas
              </Button>
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href={`/projetos/${project.id}/fisico/importar`} />}
              >
                Importar
              </Button>
            </div>
          )}
        </div>
      </div>

      {!hasData ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <p className="text-sm font-medium">Cronograma físico ainda não importado</p>
          <p className="max-w-md text-sm text-muted-foreground">
            O cronograma físico (entregas e atividades) vem da exportação do SGF. Importe o
            arquivo para começar a acompanhar o progresso e gerar a fila de lançamento.
          </p>
          <Button
            nativeButton={false}
            render={<Link href={`/projetos/${project.id}/fisico/importar`} />}
          >
            Importar cronograma
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <p className="eyebrow">Pendentes de lançamento no SGF</p>
            {dashboard.queue.length === 0 ? (
              <Card>
                <CardContent className="py-4 text-sm text-muted-foreground">
                  Nada pendente — todas as datas reais registradas aqui já estão no SGF.
                </CardContent>
              </Card>
            ) : (
              <div className="flex flex-col gap-2">
                {dashboard.queue.map((item) => (
                  <QueueRow key={item.activity.id} item={item} />
                ))}
              </div>
            )}
          </div>

          <Card>
            <CardContent className="flex flex-col gap-3">
              <p className="eyebrow">Execução física</p>
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium">
                  {dashboard.concluded} de {dashboard.total} atividades
                </span>
                <span className="text-muted-foreground">{pct}%</span>
              </div>
              <Progress value={pct} />
            </CardContent>
          </Card>

          <div className="flex flex-col gap-2">
            <p className="eyebrow">Entregas</p>
            <div className="flex flex-col gap-2">
              {dashboard.deliverableProgress.map((d) => {
                const dPct = d.total > 0 ? Math.round((d.concluded / d.total) * 100) : 0;
                return (
                  <Card key={d.deliverable.id} size="sm">
                    <CardContent className="flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium">{d.deliverable.name}</span>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {d.concluded} de {d.total} · {dPct}%
                        </span>
                      </div>
                      <Progress value={dPct} />
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            <Link
              href={`/projetos/${project.id}/fisico/entregas`}
              className="inline-flex w-fit items-center gap-1 self-end text-sm font-medium text-primary hover:underline"
            >
              Ver cronograma completo
              <ArrowRightIcon className="size-3.5" />
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

function QueueRow({ item }: { item: QueueItem }) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <p className="text-xs text-muted-foreground">{item.deliverableName}</p>
          <p className="text-sm font-medium">{item.activity.name}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {item.pendingStart && (
            <PendingDateChip label="Início real" value={item.pendingStart} />
          )}
          {item.pendingEnd && <PendingDateChip label="Fim real" value={item.pendingEnd} />}
        </div>
      </CardContent>
    </Card>
  );
}

function PendingDateChip({ label, value }: { label: string; value: string }) {
  const formatted = formatDateBR(value);
  return (
    <div className="flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-mono text-sm">{formatted}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        title="Copiar data"
        onClick={() => copyToClipboard(formatted)}
      >
        <CopyIcon className="size-3.5" />
        <span className="sr-only">Copiar data</span>
      </Button>
    </div>
  );
}
