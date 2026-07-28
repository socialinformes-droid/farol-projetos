'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { UploadIcon, FileSpreadsheetIcon, AlertTriangleIcon } from 'lucide-react';

import type { ProjectRow, ImportBatchRow } from '@/lib/supabase/types';
import type { ImportPlan, ProjectPlan, UnknownCenter } from '@/lib/domain/import-resolution';
import { formatBRL } from '@/lib/format';
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
import { BackLink } from '@/components/layout/back-link';
import { DimensionTabs } from '@/components/layout/dimension-tabs';

type PreviewResult = {
  filename: string;
  discardedRows: number;
  plan: ImportPlan;
};

function formatDateTimeBR(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

export function ImportarView({
  project,
  batches,
}: {
  project: ProjectRow;
  batches: ImportBatchRow[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<PreviewResult | null>(null);

  async function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      toast.error('Envie um arquivo .xlsx.');
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/import', { method: 'POST', body: formData });
      const json = await res.json();

      if (!res.ok) {
        toast.error(json.error ?? 'Não foi possível ler a planilha.');
        return;
      }
      setResult(json as PreviewResult);
    } catch {
      toast.error('Falha ao enviar o arquivo.');
    } finally {
      setLoading(false);
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Limpa o valor para que selecionar o mesmo arquivo de novo (reimportar
    // para testar idempotência) dispare o evento de novo.
    e.target.value = '';
    if (file) void handleFile(file);
  }

  function handleCancel() {
    setResult(null);
  }

  async function handleConfirm() {
    if (!result) return;
    setCommitting(true);

    let totalInserted = 0;
    let totalDuplicates = 0;
    const errors: string[] = [];

    for (const projectPlan of result.plan.projects) {
      try {
        const res = await fetch('/api/import/commit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: result.filename, plan: projectPlan }),
        });
        const json = await res.json();
        if (!res.ok) {
          errors.push(`${projectPlan.projectName}: ${json.error ?? 'erro desconhecido'}`);
          continue;
        }
        totalInserted += json.inserted;
        totalDuplicates += json.duplicates;
      } catch {
        errors.push(`${projectPlan.projectName}: falha ao confirmar o import.`);
      }
    }

    setCommitting(false);

    if (errors.length > 0) {
      toast.error(`Alguns projetos falharam: ${errors.join(' ')}`);
    }
    if (totalInserted > 0 || totalDuplicates > 0) {
      toast.success(
        `${totalInserted} lançamento(s) novo(s) importado(s), ${totalDuplicates} duplicado(s) ignorado(s).`,
      );
    }

    setResult(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <BackLink href={`/projetos/${project.id}/financeiro`} label="Financeiro" />
        <DimensionTabs projectId={project.id} active="financeiro" />
        <div>
          <h1 className="font-display text-2xl">Importar razão</h1>
          <p className="text-sm text-muted-foreground">
            {project.code} — {project.name}
          </p>
        </div>
      </div>

      {!result && (
        <Card>
          <CardContent>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-16 text-center transition-colors ${
                dragOver ? 'border-primary bg-primary/5' : 'border-border'
              }`}
            >
              <UploadIcon className="size-8 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">
                  Arraste o arquivo .xlsx do razão aqui, ou clique para escolher
                </p>
                <p className="text-xs text-muted-foreground">
                  Exportação do Genus — planilha com as colunas Centro, Conta, Valor etc.
                </p>
              </div>
              {loading && <p className="text-xs text-muted-foreground">Lendo planilha…</p>}
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={onInputChange}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {result && (
        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="flex items-center gap-2 py-3 text-sm">
              <FileSpreadsheetIcon className="size-4 text-muted-foreground" />
              <span className="font-medium">{result.filename}</span>
              <span className="text-muted-foreground">
                — {result.discardedRows} linha(s) descartada(s) do rodapé/vazias
              </span>
            </CardContent>
          </Card>

          {result.plan.projects.map((projectPlan) => (
            <ProjectPlanCard key={projectPlan.projectId} plan={projectPlan} />
          ))}

          {result.plan.unknownCenters.map((center) => (
            <UnknownCenterCard key={center.code} center={center} />
          ))}

          {result.plan.projects.length === 0 && result.plan.unknownCenters.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
              <p className="text-sm text-muted-foreground">
                Nenhum lançamento reconhecido nesta planilha.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleCancel} disabled={committing}>
              Cancelar
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={committing || result.plan.projects.length === 0}
            >
              {committing ? 'Confirmando…' : 'Confirmar import'}
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <p className="eyebrow">Histórico de importações</p>
        {batches.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma importação registrada ainda.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Arquivo</TableHead>
                <TableHead>Lidas</TableHead>
                <TableHead>Inseridas</TableHead>
                <TableHead>Duplicadas</TableHead>
                <TableHead>Sem rubrica</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>{formatDateTimeBR(b.imported_at)}</TableCell>
                  <TableCell className="max-w-[240px] truncate" title={b.filename}>
                    {b.filename}
                  </TableCell>
                  <TableCell>{b.rows_read}</TableCell>
                  <TableCell>{b.rows_inserted}</TableCell>
                  <TableCell>{b.rows_duplicate}</TableCell>
                  <TableCell>{b.rows_unmapped}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

function ProjectPlanCard({ plan }: { plan: ProjectPlan }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-medium">{plan.projectName}</p>
            <p className="text-xs text-muted-foreground">Centro {plan.centerCode}</p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant="outline">
              {plan.newEntries.length} novo(s) — {formatBRL(plan.expenseTotal)}
            </Badge>
            {plan.duplicateCount > 0 && (
              <Badge variant="secondary">
                {plan.duplicateCount} duplicado(s) (já importados)
              </Badge>
            )}
            {plan.contributionTotal !== 0 && (
              <Badge variant="outline">Baixas: {formatBRL(plan.contributionTotal)}</Badge>
            )}
          </div>
        </div>

        {plan.newBudgetLines.length > 0 && (
          <div className="flex flex-col gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
              <AlertTriangleIcon className="size-3.5" />
              Rubricas novas sem orçamento — serão criadas sem orçamento
            </p>
            <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
              {plan.newBudgetLines.map((line) => (
                <li key={line.code}>
                  {line.code} — {line.name}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function UnknownCenterCard({ center }: { center: UnknownCenter }) {
  return (
    <Card className="bg-muted/50">
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Nenhum projeto cadastrado com o centro {center.code} — {center.count} lançamento(s)
          serão ignorados
        </p>
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={
            <Link
              href={`/projetos/novo?code=${encodeURIComponent(center.code)}&name=${encodeURIComponent(center.name)}`}
            />
          }
        >
          Cadastrar projeto
        </Button>
      </CardContent>
    </Card>
  );
}
