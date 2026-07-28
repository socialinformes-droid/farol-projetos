'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ClipboardListIcon, CopyIcon } from 'lucide-react';

import type { ProjectRow } from '@/lib/supabase/types';
import type { MonitoringSnapshot } from '@/lib/domain/monitoring-snapshot';
import type { MonitoringFields } from '@/lib/domain/monitoring-render';
import { MONITORING_FIELD_META } from '@/lib/domain/monitoring-fields-meta';
import { previewMonitoringSnapshot, createMonitoring } from '@/lib/actions/monitoring';
import { toISODate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { BackLink } from '@/components/layout/back-link';
import { DimensionTabs } from '@/components/layout/dimension-tabs';
import { MonitoringSnapshotSummary } from '@/components/project/monitoring-snapshot-summary';

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('Copiado.');
  } catch {
    toast.error('Não foi possível copiar.');
  }
}

function lastDayOfMonth(year: number, monthZeroBased: number): Date {
  return new Date(year, monthZeroBased + 1, 0);
}

function currentMonthRange(today: Date): { start: string; end: string } {
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const end = lastDayOfMonth(today.getFullYear(), today.getMonth());
  return { start: toISODate(start), end: toISODate(end) };
}

/**
 * A quinzena "mais recente e já encerrada" relativa a hoje: se ainda estamos
 * na primeira metade do mês, a última quinzena encerrada é a segunda do mês
 * anterior; senão, é a primeira do mês corrente (dias 1–15).
 */
function lastFortnightRange(today: Date): { start: string; end: string } {
  if (today.getDate() > 15) {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth(), 15);
    return { start: toISODate(start), end: toISODate(end) };
  }
  const start = new Date(today.getFullYear(), today.getMonth() - 1, 16);
  const end = lastDayOfMonth(today.getFullYear(), today.getMonth() - 1);
  return { start: toISODate(start), end: toISODate(end) };
}

type PreviewState = { snapshot: MonitoringSnapshot; draft: MonitoringFields };

/**
 * Escolhe o período e mostra o registro coletado (financeiro + físico) ANTES
 * de criar qualquer coisa — o gestor precisa ver o que vai ser reportado
 * antes de decidir gerar com IA ou só copiar o rascunho. O botão de IA fica
 * na tela de detalhe, depois que o monitoramento já existe.
 */
export function NovoMonitoramentoView({ project }: { project: ProjectRow }) {
  const router = useRouter();
  const today = new Date();

  const [periodStart, setPeriodStart] = useState(currentMonthRange(today).start);
  const [periodEnd, setPeriodEnd] = useState(currentMonthRange(today).end);
  const [referenceLabel, setReferenceLabel] = useState('');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [preview, setPreview] = useState<PreviewState | null>(null);

  function applyRange(range: { start: string; end: string }) {
    setPeriodStart(range.start);
    setPeriodEnd(range.end);
    setPreview(null);
  }

  async function handleCollect() {
    setLoading(true);
    setPreview(null);
    const result = await previewMonitoringSnapshot(project.id, {
      periodStart,
      periodEnd,
      referenceLabel: referenceLabel.trim() === '' ? null : referenceLabel.trim(),
    });
    setLoading(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setPreview(result.data);
  }

  async function handleCreate() {
    setCreating(true);
    const result = await createMonitoring(project.id, {
      periodStart,
      periodEnd,
      referenceLabel: referenceLabel.trim() === '' ? null : referenceLabel.trim(),
    });
    setCreating(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success('Monitoramento criado.');
    router.push(`/projetos/${project.id}/monitoramento/${result.data.id}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <BackLink href={`/projetos/${project.id}/monitoramento`} label="Monitoramento" />
        <DimensionTabs projectId={project.id} active="monitoramento" />
        <div>
          <h1 className="font-display text-2xl">Novo monitoramento</h1>
          <p className="text-sm text-muted-foreground">
            {project.code} — {project.name}
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <p className="eyebrow">Período</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => applyRange(currentMonthRange(today))}
            >
              Mês atual
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => applyRange(lastFortnightRange(today))}
            >
              Última quinzena
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="periodStart">Início</Label>
              <Input
                id="periodStart"
                type="date"
                value={periodStart}
                onChange={(e) => {
                  setPeriodStart(e.target.value);
                  setPreview(null);
                }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="periodEnd">Fim</Label>
              <Input
                id="periodEnd"
                type="date"
                value={periodEnd}
                onChange={(e) => {
                  setPeriodEnd(e.target.value);
                  setPreview(null);
                }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="referenceLabel">Rótulo (opcional)</Label>
              <Input
                id="referenceLabel"
                placeholder="Ex.: Julho/2026"
                value={referenceLabel}
                onChange={(e) => setReferenceLabel(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="button" onClick={handleCollect} disabled={loading}>
              <ClipboardListIcon className="size-4" />
              {loading ? 'Coletando…' : 'Coletar registro do período'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {preview && (
        <div className="flex flex-col gap-4">
          <MonitoringSnapshotSummary snapshot={preview.snapshot} />
          <DraftFieldsPreview draft={preview.draft} />
          <div className="flex justify-end">
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? 'Criando…' : 'Criar monitoramento'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Rascunho pronto para copiar, mesmo sem gerar nada com IA — é o ponto
 * central do módulo: o registro factual já produz texto específico.
 */
function DraftFieldsPreview({ draft }: { draft: MonitoringFields }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <p className="eyebrow">Rascunho (sem IA) — já copiável</p>
        {MONITORING_FIELD_META.map((meta) => (
          <div key={meta.key} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label>
                {meta.number}. {meta.label}
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                title="Copiar"
                onClick={() => copyToClipboard(draft[meta.key])}
              >
                <CopyIcon className="size-3.5" />
                <span className="sr-only">Copiar</span>
              </Button>
            </div>
            <Textarea value={draft[meta.key]} readOnly rows={5} className="text-xs" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
