'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDownIcon, ChevronRightIcon, DownloadIcon, FileSpreadsheetIcon, FileTextIcon } from 'lucide-react';

import type { ProjectRow } from '@/lib/supabase/types';
import type { ProjectSummary, LineResult, AlertStatus } from '@/lib/domain/budget';
import { formatBRL } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLinkItem,
} from '@/components/ui/dropdown-menu';
import { ProjectAlerts } from '@/components/project/project-alerts';
import { TransferCapMeter } from '@/components/project/transfer-cap-meter';
import { BudgetExecutionMeter } from '@/components/project/budget-execution-meter';
import { BudgetVsActualChart } from '@/components/charts/budget-vs-actual-chart';

const STATUS_LABEL: Record<string, string> = {
  planejamento: 'Planejamento',
  ativo: 'Ativo',
  encerrado: 'Encerrado',
};

const CAP_STATUS_TEXT: Record<AlertStatus, string> = {
  ok: 'text-money-up',
  aviso: 'text-amber-700 dark:text-amber-400',
  violacao: 'text-destructive',
};

export function ProjectDashboardView({
  project,
  summary,
}: {
  project: ProjectRow;
  summary: ProjectSummary;
}) {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  function toggleCollapse(id: string) {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl">{project.name}</h1>
            <Badge variant="outline">{STATUS_LABEL[project.status]}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{project.code}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" nativeButton={false} render={<Link href={`/projetos/${project.id}/rubricas`} />}>
            Rubricas
          </Button>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={`/projetos/${project.id}/lancamentos`} />}
          >
            Lançamentos
          </Button>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={`/projetos/${project.id}/importar`} />}
          >
            Importar
          </Button>
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

      <ProjectAlerts projectId={project.id} summary={summary} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Orçamento total" value={formatBRL(summary.totalBudget)} />
        <KpiCard
          label="Realizado"
          value={formatBRL(summary.realized)}
          hint={`${Math.round(summary.executionPct)}% do orçamento`}
        />
        <KpiCard
          label="Saldo disponível"
          value={formatBRL(summary.available)}
          valueClassName={summary.available < 0 ? 'text-destructive' : undefined}
          hint={
            summary.available < 0
              ? 'orçamento excedido'
              : `${Math.round(100 - summary.executionPct)}% ainda disponível`
          }
        />
        <KpiCard
          label="Consumo do teto"
          value={`${Math.round(summary.capUsagePct)}%`}
          valueClassName={CAP_STATUS_TEXT[summary.status]}
          hint="do remanejamento permitido"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="flex flex-col gap-3">
            <p className="eyebrow">Execução do orçamento</p>
            <BudgetExecutionMeter
              realized={summary.realized}
              totalBudget={summary.totalBudget}
              available={summary.available}
              executionPct={summary.executionPct}
              overBudget={summary.overBudget}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-3">
            <p className="eyebrow">Teto de remanejamento</p>
            <TransferCapMeter
              transferred={summary.transferred}
              transferCap={summary.transferCap}
              capUsagePct={summary.capUsagePct}
              warningThresholdPct={Number(project.warning_threshold_pct)}
              status={summary.status}
            />
          </CardContent>
        </Card>
      </div>

      {summary.lines.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
          <p className="text-sm text-muted-foreground">Nenhuma rubrica cadastrada ainda.</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Rubrica</TableHead>
              <TableHead>Orçado</TableHead>
              <TableHead>Realizado</TableHead>
              <TableHead>Saldo</TableHead>
              <TableHead>Excesso</TableHead>
              <TableHead>% Execução</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {summary.lines.map((line) => (
              <RubricaRow
                key={line.id}
                line={line}
                depth={0}
                collapsedIds={collapsedIds}
                onToggleCollapse={toggleCollapse}
              />
            ))}
          </TableBody>
        </Table>
      )}

      <Card>
        <CardContent className="flex flex-col gap-3">
          <p className="eyebrow">Orçado × Realizado por rubrica</p>
          <BudgetVsActualChart lines={summary.lines} />
        </CardContent>
      </Card>

      {summary.writeoffs !== 0 && (
        <Card>
          <CardContent className="py-3 text-sm text-muted-foreground">
            Baixas de projeto: {formatBRL(summary.writeoffs)} — não entram no realizado nem no
            cálculo do teto.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  valueClassName,
  hint,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  /** Linha de apoio abaixo do número — o mesmo dado em outra unidade. */
  hint?: string;
}) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-1">
        <p className="eyebrow">{label}</p>
        <p className={cn('font-display text-2xl', valueClassName)}>{value}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function RubricaRow({
  line,
  depth,
  collapsedIds,
  onToggleCollapse,
}: {
  line: LineResult;
  depth: number;
  collapsedIds: Set<string>;
  onToggleCollapse: (id: string) => void;
}) {
  const hasChildren = line.children.length > 0;
  const isCollapsed = collapsedIds.has(line.id);

  return (
    <>
      <TableRow>
        <TableCell className="font-mono text-xs text-muted-foreground">
          {line.code ?? '—'}
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1" style={{ paddingLeft: depth * 20 }}>
            {hasChildren ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => onToggleCollapse(line.id)}
              >
                {isCollapsed ? (
                  <ChevronRightIcon className="size-3.5" />
                ) : (
                  <ChevronDownIcon className="size-3.5" />
                )}
              </Button>
            ) : (
              <span className="inline-block size-6" />
            )}
            <span>{line.name}</span>
            {!line.isControl && (
              <Badge
                variant="outline"
                className="border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-400"
              >
                sem orçamento
              </Badge>
            )}
          </div>
        </TableCell>
        <TableCell>{line.budgeted === null ? '—' : formatBRL(line.budgeted)}</TableCell>
        <TableCell>{formatBRL(line.realized)}</TableCell>
        <TableCell
          className={line.balance !== null && line.balance < 0 ? 'text-destructive' : undefined}
        >
          {line.balance === null ? '—' : formatBRL(line.balance)}
        </TableCell>
        <TableCell className={line.excess > 0 ? 'text-destructive' : undefined}>
          {line.excess > 0 ? formatBRL(line.excess) : '—'}
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <span className="text-xs tabular-nums">
              {line.executionPct === null ? '—' : `${Math.round(line.executionPct)}%`}
            </span>
            {line.executionPct !== null && (
              <div className="h-1 w-14 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    'h-full rounded-full',
                    line.executionPct > 100 ? 'bg-destructive' : 'bg-primary',
                  )}
                  style={{ width: `${Math.min(100, line.executionPct)}%` }}
                />
              </div>
            )}
          </div>
        </TableCell>
      </TableRow>

      {hasChildren &&
        !isCollapsed &&
        line.children.map((child) => (
          <RubricaRow
            key={child.id}
            line={child}
            depth={depth + 1}
            collapsedIds={collapsedIds}
            onToggleCollapse={onToggleCollapse}
          />
        ))}
    </>
  );
}
