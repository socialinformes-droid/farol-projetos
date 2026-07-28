'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { RotateCcwIcon } from 'lucide-react';

import type { ProjectRow, MonitoringRow } from '@/lib/supabase/types';
import type { DetectedFinding, ResolvedFinding } from '@/lib/domain/monitoring-findings';
import { resolveFinding, reopenFinding } from '@/lib/actions/findings';
import { formatDateBR } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { BackLink } from '@/components/layout/back-link';

type ResolutionAction = 'justificado' | 'replanejado' | 'dispensado';

const RESOLUTION_LABEL: Record<ResolutionAction, string> = {
  justificado: 'Justificar',
  replanejado: 'Replanejado — não é atraso',
  dispensado: 'Não reportar',
};

const RESOLUTION_BADGE: Record<ResolutionAction, string> = {
  justificado: 'Justificado',
  replanejado: 'Replanejado — não é atraso',
  dispensado: 'Não reportado',
};

type DialogState = { finding: DetectedFinding; resolution: ResolutionAction };

/**
 * Análise do período: apontamentos pendentes agrupados por severidade
 * (críticos bloqueiam a geração com IA; complementares não), cada um com as
 * três resoluções possíveis, mais o histórico de apontamentos já resolvidos
 * com opção de reabrir. Nenhum botão usa `confirm()`/`alert()` — a resolução
 * sempre passa pelo diálogo, que também coleta a observação e quem resolveu.
 */
export function AnaliseView({
  project,
  monitoring,
  pending,
  resolved,
}: {
  project: ProjectRow;
  monitoring: MonitoringRow;
  pending: DetectedFinding[];
  resolved: ResolvedFinding[];
}) {
  const router = useRouter();
  const [dialogState, setDialogState] = useState<DialogState | null>(null);
  const [note, setNote] = useState('');
  const [resolvedBy, setResolvedBy] = useState(project.manager_name ?? '');
  const [saving, setSaving] = useState(false);
  const [reopeningKey, setReopeningKey] = useState<string | null>(null);

  const criticos = pending.filter((f) => f.severity === 'critico');
  const complementares = pending.filter((f) => f.severity === 'complementar');

  function openDialog(finding: DetectedFinding, resolution: ResolutionAction) {
    setNote('');
    setDialogState({ finding, resolution });
  }

  function closeDialog() {
    setDialogState(null);
    setNote('');
  }

  async function confirmResolve() {
    if (!dialogState) return;
    setSaving(true);
    const result = await resolveFinding({
      activityId: dialogState.finding.activityId,
      kind: dialogState.finding.kind,
      resolution: dialogState.resolution,
      note: note.trim() === '' ? null : note.trim(),
      resolvedBy: resolvedBy.trim() === '' ? null : resolvedBy.trim(),
    });
    setSaving(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success('Apontamento resolvido.');
    closeDialog();
    router.refresh();
  }

  async function handleReopen(f: ResolvedFinding) {
    const key = `${f.activityId}:${f.kind}`;
    setReopeningKey(key);
    const result = await reopenFinding(f.activityId, f.kind);
    setReopeningKey(null);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success('Apontamento reaberto.');
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <BackLink
          href={`/projetos/${project.id}/monitoramento/${monitoring.id}`}
          label="Monitoramento"
        />
        <h1 className="font-display text-2xl">Análise do período</h1>
        <p className="text-sm text-muted-foreground">
          {project.code} — {project.name} · {formatDateBR(monitoring.period_start)} a{' '}
          {formatDateBR(monitoring.period_end)}
        </p>
      </div>

      {criticos.length === 0 && complementares.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Nenhum apontamento pendente para este período. A geração com IA está liberada.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {criticos.length > 0 && (
            <Card>
              <CardContent className="flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  <p className="eyebrow">Críticos</p>
                  <Badge variant="destructive">{criticos.length}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Bloqueiam a geração com IA até serem resolvidos.
                </p>
                {criticos.map((f) => (
                  <FindingRow
                    key={`${f.activityId}:${f.kind}`}
                    finding={f}
                    onResolve={(resolution) => openDialog(f, resolution)}
                  />
                ))}
              </CardContent>
            </Card>
          )}

          {complementares.length > 0 && (
            <Card>
              <CardContent className="flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  <p className="eyebrow">Complementares</p>
                  <Badge variant="secondary">{complementares.length}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Não bloqueiam a geração — se ficarem pendentes, o texto gerado marca
                  [a confirmar] nesses pontos.
                </p>
                {complementares.map((f) => (
                  <FindingRow
                    key={`${f.activityId}:${f.kind}`}
                    finding={f}
                    onResolve={(resolution) => openDialog(f, resolution)}
                  />
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {resolved.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-4">
            <p className="eyebrow">Resolvidos ({resolved.length})</p>
            {resolved.map((f) => {
              const key = `${f.activityId}:${f.kind}`;
              return (
                <div key={key} className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge variant="outline">{RESOLUTION_BADGE[f.resolution as ResolutionAction]}</Badge>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => handleReopen(f)}
                      disabled={reopeningKey === key}
                    >
                      <RotateCcwIcon className="size-3.5" />
                      {reopeningKey === key ? 'Reabrindo…' : 'Reabrir'}
                    </Button>
                  </div>
                  <p className="text-sm font-medium">
                    {f.deliverableName} — {f.activityName}
                  </p>
                  <p className="text-sm text-muted-foreground">{f.description}</p>
                  {f.note && <p className="text-xs text-muted-foreground">Observação: {f.note}</p>}
                  {f.resolvedBy && (
                    <p className="text-xs text-muted-foreground">
                      Resolvido por {f.resolvedBy}
                      {f.resolvedAt ? ` em ${formatDateBR(f.resolvedAt)}` : ''}.
                    </p>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Dialog
        open={dialogState !== null}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogState ? RESOLUTION_LABEL[dialogState.resolution] : ''}</DialogTitle>
            <DialogDescription>{dialogState?.finding.description}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="finding-note">Observação</Label>
              <Textarea
                id="finding-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Explique o que aconteceu — vira fato no texto do monitoramento quando resolvido."
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="finding-resolved-by">Resolvido por</Label>
              <Input
                id="finding-resolved-by"
                value={resolvedBy}
                onChange={(e) => setResolvedBy(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeDialog} disabled={saving}>
              Cancelar
            </Button>
            <Button type="button" onClick={confirmResolve} disabled={saving}>
              {saving ? 'Salvando…' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FindingRow({
  finding,
  onResolve,
}: {
  finding: DetectedFinding;
  onResolve: (resolution: ResolutionAction) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <p className="text-sm font-medium">
        {finding.deliverableName} — {finding.activityName}
      </p>
      <p className="text-sm text-muted-foreground">{finding.description}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => onResolve('justificado')}>
          Justificar
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => onResolve('replanejado')}>
          Replanejado — não é atraso
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => onResolve('dispensado')}>
          Não reportar
        </Button>
      </div>
    </div>
  );
}
