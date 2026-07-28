'use client';

import Link from 'next/link';
import {
  ArrowRightIcon,
  DownloadIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
} from 'lucide-react';

import type { ProjectRow } from '@/lib/supabase/types';
import type { ProjectSummary } from '@/lib/domain/budget';
import { formatBRL } from '@/lib/format';
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
}: {
  project: ProjectRow;
  summary: ProjectSummary;
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FinanceiroCard projectId={project.id} summary={summary} />
        <FisicoCard projectId={project.id} />
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
 * O módulo físico ainda não existe — nada aqui vem do banco. É um estado
 * vazio explícito, não um placeholder com números inventados.
 */
function FisicoCard({ projectId }: { projectId: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <p className="eyebrow">Físico</p>
        <p className="text-sm text-muted-foreground">
          Cronograma físico ainda não importado.
        </p>
        <DimensionCardLink href={`/projetos/${projectId}/fisico`} />
      </CardContent>
    </Card>
  );
}
