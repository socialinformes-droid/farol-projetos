'use client';

import Link from 'next/link';
import {
  ArrowRightIcon,
  DownloadIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
} from 'lucide-react';

import type { ProjectRow, MonitoringRow } from '@/lib/supabase/types';
import type { ProjectSummary } from '@/lib/domain/budget';
import type { PhysicalDashboard } from '@/lib/domain/physical-dashboard';
import type { ProjectChatContext } from '@/lib/domain/chat-context';
import { formatBRL, formatDateBR } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLinkItem,
} from '@/components/ui/dropdown-menu';
import { BackLink } from '@/components/layout/back-link';
import { ProjectChatSheet } from '@/components/project/project-chat-sheet';

const STATUS_LABEL: Record<string, string> = {
  planejamento: 'Planejamento',
  ativo: 'Ativo',
  encerrado: 'Encerrado',
};

/**
 * Tela de entrada do projeto — compacta de propósito. Não repete o que já
 * mora no dashboard financeiro (KPIs, tabela de rubricas, gráfico); mostra
 * só o suficiente de cada dimensão para o usuário escolher para onde ir.
 */
export function ProjectOverviewView({
  project,
  summary,
  physical,
  hasPhysicalData,
  latestMonitoring,
  chatContext,
}: {
  project: ProjectRow;
  summary: ProjectSummary;
  physical: PhysicalDashboard;
  hasPhysicalData: boolean;
  latestMonitoring: MonitoringRow | null;
  chatContext: ProjectChatContext;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <BackLink href="/" label="Projetos" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-2xl">{project.name}</h1>
              <Badge variant="outline">{STATUS_LABEL[project.status]}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {project.code}
              {project.sgf_number ? ` · SGF ${project.sgf_number}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ProjectChatSheet context={chatContext} />
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={`/projetos/${project.id}/editar`} />}
            >
              Editar
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" />}>
                <DownloadIcon className="size-4" />
                Exportar
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLinkItem
                  href={`/api/export?projeto=${project.id}&formato=xlsx`}
                  download
                >
                  <FileSpreadsheetIcon />
                  Excel (.xlsx)
                </DropdownMenuLinkItem>
                <DropdownMenuLinkItem
                  href={`/api/export?projeto=${project.id}&formato=csv`}
                  download
                >
                  <FileTextIcon />
                  CSV
                </DropdownMenuLinkItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <FinanceiroCard projectId={project.id} summary={summary} />
        <FisicoCard projectId={project.id} physical={physical} hasPhysicalData={hasPhysicalData} />
        <MonitoramentoCard projectId={project.id} latestMonitoring={latestMonitoring} />
      </div>
    </div>
  );
}

function DimensionCardLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 self-end text-sm font-medium text-primary hover:underline"
    >
      Abrir
      <ArrowRightIcon className="size-3.5" />
    </Link>
  );
}

function FinanceiroCard({
  projectId,
  summary,
}: {
  projectId: string;
  summary: ProjectSummary;
}) {
  const pct = summary.totalBudget > 0 ? (summary.realized / summary.totalBudget) * 100 : 0;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <p className="eyebrow">Financeiro</p>
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-medium">{formatBRL(summary.realized)}</span>
          <span className="text-muted-foreground">de {formatBRL(summary.totalBudget)}</span>
        </div>
        <div className="flex items-center gap-3">
          <Progress value={Math.min(100, pct)} className="flex-1" />
          <span className="text-xs tabular-nums text-muted-foreground">
            {Math.round(pct)}%
          </span>
        </div>
        {summary.contributions !== 0 && (
          <p className="text-xs text-muted-foreground">
            Aportes {formatBRL(summary.contributions)}
          </p>
        )}
        <DimensionCardLink href={`/projetos/${projectId}/financeiro`} />
      </CardContent>
    </Card>
  );
}

/**
 * Espelha a fila de pendências do dashboard físico: quantas atividades
 * concluídas de quantas no total, contando (nunca a partir do percentual do
 * SGF), e quantas ainda esperam ser digitadas de volta no SGF.
 */
function FisicoCard({
  projectId,
  physical,
  hasPhysicalData,
}: {
  projectId: string;
  physical: PhysicalDashboard;
  hasPhysicalData: boolean;
}) {
  if (!hasPhysicalData) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3">
          <p className="eyebrow">Físico</p>
          <p className="text-sm text-muted-foreground">Cronograma físico ainda não importado.</p>
          <DimensionCardLink href={`/projetos/${projectId}/fisico`} />
        </CardContent>
      </Card>
    );
  }

  const pct = physical.total > 0 ? (physical.concluded / physical.total) * 100 : 0;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <p className="eyebrow">Físico</p>
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-medium">
            {physical.concluded} de {physical.total} atividades
          </span>
          <span className="text-muted-foreground">{Math.round(pct)}%</span>
        </div>
        <div className="flex items-center gap-3">
          <Progress value={Math.min(100, pct)} className="flex-1" />
          <span className="text-xs tabular-nums text-muted-foreground">{Math.round(pct)}%</span>
        </div>
        {physical.queue.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {physical.queue.length} pendente(s) de lançamento no SGF
          </p>
        )}
        <DimensionCardLink href={`/projetos/${projectId}/fisico`} />
      </CardContent>
    </Card>
  );
}

/**
 * Espelha o que o gestor precisa saber num relance: quando foi o último
 * monitoramento enviado ao PMO e se já passou muito tempo (o SGF cobra a
 * falta disso — "28 dias sem monitoramento" é a dor que este módulo existe
 * para resolver).
 */
function MonitoramentoCard({
  projectId,
  latestMonitoring,
}: {
  projectId: string;
  latestMonitoring: MonitoringRow | null;
}) {
  if (!latestMonitoring) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3">
          <p className="eyebrow">Monitoramento</p>
          <p className="text-sm text-muted-foreground">Nenhum monitoramento registrado ainda.</p>
          <DimensionCardLink href={`/projetos/${projectId}/monitoramento`} />
        </CardContent>
      </Card>
    );
  }

  const label = latestMonitoring.reference_label
    ? latestMonitoring.reference_label
    : `${formatDateBR(latestMonitoring.period_start)} a ${formatDateBR(latestMonitoring.period_end)}`;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <p className="eyebrow">Monitoramento</p>
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-medium">Último período: {label}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {latestMonitoring.submitted_at
            ? `Enviado ao PMO em ${formatDateBR(latestMonitoring.submitted_at)}`
            : 'Ainda não enviado ao PMO — rascunho pronto para revisão'}
        </p>
        <DimensionCardLink href={`/projetos/${projectId}/monitoramento`} />
      </CardContent>
    </Card>
  );
}
