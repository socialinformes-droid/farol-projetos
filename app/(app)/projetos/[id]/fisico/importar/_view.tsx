'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { UploadIcon, FileSpreadsheetIcon } from 'lucide-react';

import type { ProjectRow } from '@/lib/supabase/types';
import type {
  PhysicalReconcilePlan,
  ReconciledActivity,
  ActivitySituation,
} from '@/lib/domain/physical-reconcile';
import { formatDateBR } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { BackLink } from '@/components/layout/back-link';
import { DimensionTabs } from '@/components/layout/dimension-tabs';

type PreviewResult = {
  filename: string;
  discardedRows: number;
  plan: PhysicalReconcilePlan;
};

const SITUATION_LABEL: Record<ActivitySituation, string> = {
  novo: 'Novas',
  reconciliado: 'Reconciliadas',
  pendente_sgf: 'Pendentes de lançamento no SGF',
  absorvido: 'Absorvidas do SGF',
  divergente: 'Divergentes',
  sumiu: 'Sumiram do SGF',
};

const SITUATION_HINT: Record<ActivitySituation, string> = {
  novo: 'Não existiam no Farol — serão criadas.',
  reconciliado: 'Data real igual nos dois lados. Nada a fazer.',
  pendente_sgf: 'O Farol tem a data real, o SGF ainda não — é a fila de lançamento.',
  absorvido: 'O SGF já tem a data real que o Farol não tinha — será absorvida.',
  divergente: 'Os dois têm data real, mas diferentes. Nada é resolvido automaticamente.',
  sumiu: 'Existiam no Farol e não vieram mais no arquivo. Serão marcadas, nunca apagadas.',
};

const SITUATION_ORDER: ActivitySituation[] = [
  'divergente',
  'pendente_sgf',
  'absorvido',
  'novo',
  'sumiu',
  'reconciliado',
];

export function ImportarFisicoView({ project }: { project: ProjectRow }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<PreviewResult | null>(null);

  async function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.xls')) {
      toast.error('Envie o arquivo .xls exportado do SGF.');
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('projectId', project.id);
      const res = await fetch('/api/fisico/import', { method: 'POST', body: formData });
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
    e.target.value = '';
    if (file) void handleFile(file);
  }

  function handleCancel() {
    setResult(null);
  }

  async function handleConfirm() {
    if (!result) return;
    setCommitting(true);

    try {
      const res = await fetch('/api/fisico/import/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          filename: result.filename,
          plan: result.plan,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? 'Não foi possível confirmar o import.');
        return;
      }
      toast.success(
        `${json.activitiesUpserted} atividade(s) e ${json.deliverablesUpserted} entrega(s) atualizadas.`,
      );
      setResult(null);
      router.push(`/projetos/${project.id}/fisico`);
      router.refresh();
    } catch {
      toast.error('Falha ao confirmar o import.');
    } finally {
      setCommitting(false);
    }
  }

  const groups = result
    ? SITUATION_ORDER.map((situation) => ({
        situation,
        activities: result.plan.activities.filter((a) => a.situation === situation),
      })).filter((g) => g.activities.length > 0)
    : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <BackLink href={`/projetos/${project.id}/fisico`} label="Físico" />
        <DimensionTabs projectId={project.id} active="fisico" />
        <div>
          <h1 className="font-display text-2xl">Importar cronograma físico</h1>
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
                  Arraste o arquivo .xls do SGF aqui, ou clique para escolher
                </p>
                <p className="text-xs text-muted-foreground">
                  Exportação do cronograma físico (aba &quot;Entrega&quot;) do SGF.
                </p>
              </div>
              {loading && <p className="text-xs text-muted-foreground">Lendo planilha…</p>}
              <input
                ref={inputRef}
                type="file"
                accept=".xls"
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
            <CardContent className="flex flex-wrap items-center gap-2 py-3 text-sm">
              <FileSpreadsheetIcon className="size-4 text-muted-foreground" />
              <span className="font-medium">{result.filename}</span>
              <span className="text-muted-foreground">
                — {result.discardedRows} linha(s) descartada(s)
              </span>
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-2">
            {SITUATION_ORDER.map((situation) => (
              <Badge key={situation} variant="outline">
                {SITUATION_LABEL[situation]}: {result.plan.counts[situation]}
              </Badge>
            ))}
          </div>

          {groups.map((group) => (
            <SituationCard
              key={group.situation}
              situation={group.situation}
              activities={group.activities}
            />
          ))}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleCancel} disabled={committing}>
              Cancelar
            </Button>
            <Button onClick={handleConfirm} disabled={committing}>
              {committing ? 'Confirmando…' : 'Confirmar import'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SituationCard({
  situation,
  activities,
}: {
  situation: ActivitySituation;
  activities: ReconciledActivity[];
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">
            {SITUATION_LABEL[situation]} ({activities.length})
          </p>
        </div>
        <p className="text-xs text-muted-foreground">{SITUATION_HINT[situation]}</p>
        <ul className="flex flex-col gap-1.5">
          {activities.map((a) => (
            <li
              key={a.importKey}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5 text-sm"
            >
              <span>
                <span className="text-muted-foreground">{a.deliverableName} — </span>
                {a.name}
              </span>
              {situation === 'divergente' && (
                <span className="flex gap-2 text-xs">
                  {a.actualStart.state === 'divergente' && (
                    <span>
                      Início: Farol {formatDateBR(a.actualStart.farol)} × SGF{' '}
                      {formatDateBR(a.actualStart.sgf)}
                    </span>
                  )}
                  {a.actualEnd.state === 'divergente' && (
                    <span>
                      Fim: Farol {formatDateBR(a.actualEnd.farol)} × SGF{' '}
                      {formatDateBR(a.actualEnd.sgf)}
                    </span>
                  )}
                </span>
              )}
              {situation === 'pendente_sgf' && (
                <span className="text-xs text-muted-foreground">
                  {a.actualStart.state === 'pendente_sgf' &&
                    `Início real ${formatDateBR(a.actualStart.farol)}`}
                  {a.actualStart.state === 'pendente_sgf' && a.actualEnd.state === 'pendente_sgf' && ' · '}
                  {a.actualEnd.state === 'pendente_sgf' &&
                    `Fim real ${formatDateBR(a.actualEnd.farol)}`}
                </span>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
