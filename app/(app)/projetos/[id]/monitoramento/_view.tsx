'use client';

import Link from 'next/link';
import { PlusIcon, SendIcon } from 'lucide-react';

import type { ProjectRow, MonitoringRow } from '@/lib/supabase/types';
import { formatDateBR } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { BackLink } from '@/components/layout/back-link';
import { DimensionTabs } from '@/components/layout/dimension-tabs';

function periodLabel(m: MonitoringRow): string {
  if (m.reference_label) return m.reference_label;
  return `${formatDateBR(m.period_start)} a ${formatDateBR(m.period_end)}`;
}

/**
 * Lista dos monitoramentos já criados para o projeto — período, status
 * (rascunho/enviado) e se já foi gerado com IA, mais recente primeiro
 * (mesma ordem de `listMonitorings`).
 */
export function MonitoramentoListView({
  project,
  monitorings,
}: {
  project: ProjectRow;
  monitorings: MonitoringRow[];
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <BackLink href={`/projetos/${project.id}`} label={project.name} />
        <DimensionTabs projectId={project.id} active="monitoramento" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl">Monitoramento</h1>
            <p className="text-sm text-muted-foreground">
              {project.code} — {project.name}
            </p>
          </div>
          <Button nativeButton={false} render={<Link href={`/projetos/${project.id}/monitoramento/novo`} />}>
            <PlusIcon className="size-4" />
            Novo monitoramento
          </Button>
        </div>
      </div>

      {monitorings.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <p className="text-sm font-medium">Nenhum monitoramento registrado ainda</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Reúna o que aconteceu no período — financeiro e físico — e rascunhe o texto dos cinco
            campos do formulário do PMO DR/AL antes de preenchê-lo.
          </p>
          <Button nativeButton={false} render={<Link href={`/projetos/${project.id}/monitoramento/novo`} />}>
            <PlusIcon className="size-4" />
            Criar primeiro monitoramento
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {monitorings.map((m) => (
            <Link key={m.id} href={`/projetos/${project.id}/monitoramento/${m.id}`}>
              <Card size="sm" className="transition-colors hover:bg-muted/50">
                <CardContent className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{periodLabel(m)}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateBR(m.period_start)} a {formatDateBR(m.period_end)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {m.generated_at && <Badge variant="outline">Gerado com IA</Badge>}
                    {m.submitted_at ? (
                      <Badge className="gap-1">
                        <SendIcon className="size-3" />
                        Enviado em {formatDateBR(m.submitted_at)}
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Rascunho</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
