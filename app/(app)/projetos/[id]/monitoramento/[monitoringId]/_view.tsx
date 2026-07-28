'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CopyIcon, SparklesIcon, SendIcon, Trash2Icon } from 'lucide-react';

import type { ProjectRow, MonitoringRow } from '@/lib/supabase/types';
import type { MonitoringSnapshot } from '@/lib/domain/monitoring-snapshot';
import type { MonitoringFields } from '@/lib/domain/monitoring-render';
import { MONITORING_FIELD_META } from '@/lib/domain/monitoring-fields-meta';
import {
  updateMonitoringFields,
  markMonitoringSubmitted,
  deleteMonitoring,
} from '@/lib/actions/monitoring';
import { formatDateBR } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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

function rowToFields(m: MonitoringRow): MonitoringFields {
  return {
    desempenhoFisico: m.desempenho_fisico ?? '',
    resultados: m.resultados ?? '',
    desempenhoFinanceiro: m.desempenho_financeiro ?? '',
    riscos: m.riscos ?? '',
    conclusao: m.conclusao ?? '',
  };
}

function periodLabel(m: MonitoringRow): string {
  if (m.reference_label) return m.reference_label;
  return `${formatDateBR(m.period_start)} a ${formatDateBR(m.period_end)}`;
}

/**
 * Detalhe do monitoramento: os cinco campos do formulário do PMO, editáveis,
 * na ordem e com os rótulos oficiais (5 a 9) — cada um com botão de copiar
 * próprio, porque é assim que o gestor vai preencher o Microsoft Forms, campo
 * a campo. Gerar com IA é um botão à parte, claramente opcional: o texto já
 * existe (rascunho não-IA) desde a criação do monitoramento.
 */
export function MonitoramentoDetalheView({
  project,
  monitoring,
}: {
  project: ProjectRow;
  monitoring: MonitoringRow;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(monitoring);
  const [fields, setFields] = useState<MonitoringFields>(rowToFields(monitoring));
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);

  const snapshot = (current.snapshot as unknown as MonitoringSnapshot | null) ?? null;

  function setField(key: keyof MonitoringFields, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    const result = await updateMonitoringFields(current.id, fields);
    setSaving(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success('Campos salvos.');
    router.refresh();
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await fetch('/api/monitoramento/gerar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monitoringId: current.id }),
      });
      const json = await res.json();

      if (!res.ok) {
        toast.error(
          json.error ?? 'Falha ao gerar com IA. O registro factual já foi salvo.',
        );
        router.refresh();
        return;
      }
      setFields(json.fields as MonitoringFields);
      toast.success('Texto gerado com IA. Revise antes de enviar ao PMO.');
      router.refresh();
    } catch {
      toast.error('Falha ao conectar com o serviço de geração.');
    } finally {
      setGenerating(false);
    }
  }

  async function handleSubmitConfirm() {
    setPendingSubmit(true);
    const result = await markMonitoringSubmitted(current.id);
    setPendingSubmit(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setCurrent((prev) => ({ ...prev, submitted_at: new Date().toISOString() }));
    setSubmitOpen(false);
    toast.success('Marcado como enviado ao PMO.');
  }

  async function handleDeleteConfirm() {
    setPendingDelete(true);
    const result = await deleteMonitoring(current.id);
    setPendingDelete(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success('Monitoramento excluído.');
    router.push(`/projetos/${project.id}/monitoramento`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <BackLink href={`/projetos/${project.id}/monitoramento`} label="Monitoramento" />
        <DimensionTabs projectId={project.id} active="monitoramento" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-2xl">{periodLabel(current)}</h1>
              {current.generated_at && <Badge variant="outline">Gerado com IA</Badge>}
              {current.submitted_at ? (
                <Badge className="gap-1">
                  <SendIcon className="size-3" />
                  Enviado em {formatDateBR(current.submitted_at)}
                </Badge>
              ) : (
                <Badge variant="secondary">Rascunho</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {project.code} — {project.name} · {formatDateBR(current.period_start)} a{' '}
              {formatDateBR(current.period_end)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={handleGenerate} disabled={generating}>
              <SparklesIcon className="size-4" />
              {generating ? 'Gerando…' : 'Gerar com IA'}
            </Button>
            <Button type="button" variant="outline" onClick={() => setSubmitOpen(true)}>
              <SendIcon className="size-4" />
              Marcar como enviado
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="icon"
              title="Excluir"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2Icon className="size-4" />
              <span className="sr-only">Excluir</span>
            </Button>
          </div>
        </div>
      </div>

      {snapshot && <MonitoringSnapshotSummary snapshot={snapshot} />}

      <Card>
        <CardContent className="flex flex-col gap-4">
          <p className="eyebrow">Campos do formulário do PMO DR/AL</p>
          {MONITORING_FIELD_META.map((meta) => (
            <div key={meta.key} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor={meta.key}>
                  {meta.number}. {meta.label}
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  title="Copiar"
                  onClick={() => copyToClipboard(fields[meta.key])}
                >
                  <CopyIcon className="size-3.5" />
                  <span className="sr-only">Copiar</span>
                </Button>
              </div>
              <Textarea
                id={meta.key}
                value={fields[meta.key]}
                onChange={(e) => setField(meta.key, e.target.value)}
                rows={6}
              />
            </div>
          ))}
          <div className="flex justify-end">
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar como enviado</DialogTitle>
            <DialogDescription>
              Confirma que este monitoramento já foi copiado e enviado ao formulário do PMO DR/AL?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubmitOpen(false)} disabled={pendingSubmit}>
              Cancelar
            </Button>
            <Button onClick={handleSubmitConfirm} disabled={pendingSubmit}>
              {pendingSubmit ? 'Confirmando…' : 'Confirmar envio'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir monitoramento</DialogTitle>
            <DialogDescription>
              Esta ação não pode ser desfeita — o registro coletado e os textos deste período serão
              perdidos.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={pendingDelete}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={pendingDelete}>
              {pendingDelete ? 'Excluindo…' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
