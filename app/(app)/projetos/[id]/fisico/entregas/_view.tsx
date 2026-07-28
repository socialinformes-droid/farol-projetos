'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  MessageSquareIcon,
  PencilIcon,
  Trash2Icon,
  PlusIcon,
  AlertTriangleIcon,
  ArchiveIcon,
} from 'lucide-react';

import type {
  ProjectRow,
  DeliverableRow,
  ActivityRow,
  ActivityCommentRow,
  PhysicalActivityStatus,
} from '@/lib/supabase/types';
import type { PhysicalSchedule } from '@/lib/domain/physical-queries';
import { reconcileDateField } from '@/lib/domain/physical-reconcile';
import {
  updateActivityDates,
  addActivityComment,
  deleteActivityComment,
  type ActivityDatesValues,
} from '@/lib/actions/physical';
import { formatDateBR, toISODate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { BackLink } from '@/components/layout/back-link';
import { DimensionTabs } from '@/components/layout/dimension-tabs';

const STATUS_LABEL: Record<PhysicalActivityStatus, string> = {
  nao_iniciado: 'Não iniciado',
  em_andamento: 'Em andamento',
  concluido: 'Concluído',
};

const STATUS_CLASS: Record<PhysicalActivityStatus, string> = {
  nao_iniciado: 'text-muted-foreground',
  em_andamento: 'text-amber-700 dark:text-amber-400',
  concluido: 'text-money-up',
};

const PENDING_BADGE_CLASS =
  'ml-1.5 border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-400';

/**
 * Cronograma completo — entregas expandindo em atividades, com datas
 * previstas e reais, status e comentários. É aqui que as datas reais são
 * registradas e os comentários escritos; a fila do dashboard só reflete o
 * que este cronograma já tem gravado.
 */
export function EntregasView({
  project,
  schedule,
}: {
  project: ProjectRow;
  schedule: PhysicalSchedule;
}) {
  const router = useRouter();
  const refresh = () => router.refresh();

  const activitiesByDeliverable = useMemo(() => {
    const map = new Map<string, ActivityRow[]>();
    for (const a of schedule.activities) {
      const list = map.get(a.deliverable_id) ?? [];
      list.push(a);
      map.set(a.deliverable_id, list);
    }
    return map;
  }, [schedule.activities]);

  const commentsByActivity = useMemo(() => {
    const map = new Map<string, ActivityCommentRow[]>();
    for (const c of schedule.comments) {
      const list = map.get(c.activity_id) ?? [];
      list.push(c);
      map.set(c.activity_id, list);
    }
    return map;
  }, [schedule.comments]);

  const authorSuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const a of schedule.activities) {
      if (a.responsible) set.add(a.responsible);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [schedule.activities]);

  return (
    <div className="flex flex-col gap-6">
      {/* Compartilhada por todos os formulários de comentário abaixo — sugere
          os responsáveis já importados do SGF, sem exigir conta de usuário. */}
      <datalist id="responsaveis-sugestoes">
        {authorSuggestions.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>

      <div className="flex flex-col gap-2">
        <BackLink href={`/projetos/${project.id}/fisico`} label="Físico" />
        <DimensionTabs projectId={project.id} active="fisico" />
        <div>
          <h1 className="font-display text-2xl">Entregas</h1>
          <p className="text-sm text-muted-foreground">
            {project.code} — {project.name}
          </p>
        </div>
      </div>

      {schedule.deliverables.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
          <p className="text-sm text-muted-foreground">Nenhuma entrega importada ainda.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {schedule.deliverables.map((d) => (
            <DeliverableSection
              key={d.id}
              deliverable={d}
              activities={activitiesByDeliverable.get(d.id) ?? []}
              commentsByActivity={commentsByActivity}
              onChanged={refresh}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DeliverableSection({
  deliverable,
  activities,
  commentsByActivity,
  onChanged,
}: {
  deliverable: DeliverableRow;
  activities: ActivityRow[];
  commentsByActivity: Map<string, ActivityCommentRow[]>;
  onChanged: () => void;
}) {
  const active = activities.filter((a) => !a.archived_at);
  const concluded = active.filter((a) => a.status === 'concluido').length;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <p className="font-medium">{deliverable.name}</p>
            {deliverable.archived_at && (
              <Badge variant="secondary">
                <ArchiveIcon className="size-3" />
                Sumiu do SGF
              </Badge>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {concluded} de {active.length} atividades
          </span>
        </div>

        {activities.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma atividade nesta entrega.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Atividade</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Previsto</TableHead>
                <TableHead>Real</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {activities.map((a) => (
                <ActivityRows
                  key={a.id}
                  activity={a}
                  comments={commentsByActivity.get(a.id) ?? []}
                  onChanged={onChanged}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function ActivityRows({
  activity,
  comments,
  onChanged,
}: {
  activity: ActivityRow;
  comments: ActivityCommentRow[];
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [datesOpen, setDatesOpen] = useState(false);

  const startField = reconcileDateField(activity.actual_start, activity.sgf_actual_start);
  const endField = reconcileDateField(activity.actual_end, activity.sgf_actual_end);
  const hasDivergence = startField.state === 'divergente' || endField.state === 'divergente';

  return (
    <>
      <TableRow>
        <TableCell>
          <div className="flex items-center gap-1.5">
            {activity.archived_at && (
              <span title="Sumiu do SGF">
                <ArchiveIcon className="size-3.5 text-muted-foreground" />
              </span>
            )}
            <span
              className={activity.archived_at ? 'text-muted-foreground line-through' : undefined}
            >
              {activity.name}
            </span>
          </div>
        </TableCell>
        <TableCell className="text-sm text-muted-foreground">
          {activity.responsible ?? '—'}
        </TableCell>
        <TableCell className="text-xs whitespace-normal">
          {formatDateBR(activity.planned_start)} – {formatDateBR(activity.planned_end)}
        </TableCell>
        <TableCell className="text-xs whitespace-normal">
          <div className="flex flex-col gap-0.5">
            <span>
              Início: {activity.actual_start ? formatDateBR(activity.actual_start) : '—'}
              {startField.state === 'pendente_sgf' && (
                <Badge variant="outline" className={PENDING_BADGE_CLASS}>
                  pendente SGF
                </Badge>
              )}
            </span>
            <span>
              Fim: {activity.actual_end ? formatDateBR(activity.actual_end) : '—'}
              {endField.state === 'pendente_sgf' && (
                <Badge variant="outline" className={PENDING_BADGE_CLASS}>
                  pendente SGF
                </Badge>
              )}
            </span>
            {hasDivergence && (
              <span
                className="flex items-center gap-1 text-destructive"
                title={`Farol × SGF diverge — início Farol ${formatDateBR(startField.farol)} × SGF ${formatDateBR(startField.sgf)}; fim Farol ${formatDateBR(endField.farol)} × SGF ${formatDateBR(endField.sgf)}`}
              >
                <AlertTriangleIcon className="size-3" />
                Diverge do SGF
              </span>
            )}
          </div>
        </TableCell>
        <TableCell>
          <Badge variant="outline" className={STATUS_CLASS[activity.status]}>
            {STATUS_LABEL[activity.status]}
          </Badge>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              title="Registrar datas reais"
              onClick={() => setDatesOpen(true)}
            >
              <PencilIcon className="size-4" />
              <span className="sr-only">Registrar datas reais</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              title="Comentários"
              onClick={() => setExpanded((v) => !v)}
            >
              <MessageSquareIcon className="size-4" />
              {comments.length > 0 && <span className="text-xs">{comments.length}</span>}
              {expanded ? (
                <ChevronDownIcon className="size-3" />
              ) : (
                <ChevronRightIcon className="size-3" />
              )}
              <span className="sr-only">Comentários</span>
            </Button>
          </div>
        </TableCell>
      </TableRow>

      {expanded && (
        <TableRow>
          <TableCell colSpan={6} className="bg-muted/30">
            <CommentsPanel activityId={activity.id} comments={comments} onChanged={onChanged} />
          </TableCell>
        </TableRow>
      )}

      <ActivityDatesDialog
        activity={activity}
        open={datesOpen}
        onOpenChange={setDatesOpen}
        onChanged={onChanged}
      />
    </>
  );
}

/**
 * Registra ou limpa as datas reais de início/finalização. O status não é um
 * campo aqui — é sempre recalculado no servidor a partir destas duas datas
 * (ver `updateActivityDates` em `physical-mutations.ts`).
 */
function ActivityDatesDialog({
  activity,
  open,
  onOpenChange,
  onChanged,
}: {
  activity: ActivityRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const [actualStart, setActualStart] = useState(activity.actual_start ?? '');
  const [actualEnd, setActualEnd] = useState(activity.actual_end ?? '');
  const [pending, setPending] = useState(false);

  // Sincroniza com o estado atual sempre que o diálogo transiciona pra
  // aberto — sem isso, reabrir depois de um refresh (ex.: um import que
  // absorveu uma data) mostraria o valor obsoleto do primeiro render. Ajuste
  // durante a renderização (não em efeito): é o padrão recomendado pra
  // "resetar estado quando uma prop muda" sem o round-trip de um efeito.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setActualStart(activity.actual_start ?? '');
      setActualEnd(activity.actual_end ?? '');
    }
  }

  async function handleSave() {
    setPending(true);
    const values: ActivityDatesValues = {
      actualStart: actualStart === '' ? null : actualStart,
      actualEnd: actualEnd === '' ? null : actualEnd,
    };
    const result = await updateActivityDates(activity.id, values);
    setPending(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success('Datas reais atualizadas.');
    onOpenChange(false);
    onChanged();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Datas reais — {activity.name}</DialogTitle>
          <DialogDescription>
            O status é recalculado automaticamente a partir destas datas. Deixe em branco para
            limpar.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`start-${activity.id}`}>Data real de início</Label>
          <Input
            id={`start-${activity.id}`}
            type="date"
            value={actualStart}
            onChange={(e) => setActualStart(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`end-${activity.id}`}>Data real de finalização</Label>
          <Input
            id={`end-${activity.id}`}
            type="date"
            value={actualEnd}
            onChange={(e) => setActualEnd(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={pending}>
            {pending ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CommentsPanel({
  activityId,
  comments,
  onChanged,
}: {
  activityId: string;
  comments: ActivityCommentRow[];
  onChanged: () => void;
}) {
  const [author, setAuthor] = useState('');
  const [happenedOn, setHappenedOn] = useState(toISODate(new Date()));
  const [body, setBody] = useState('');
  const [pending, setPending] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ActivityCommentRow | null>(null);

  async function handleAdd() {
    if (body.trim() === '') {
      toast.error('Escreva o comentário.');
      return;
    }
    setPending(true);
    const result = await addActivityComment(activityId, {
      author: author.trim() === '' ? null : author.trim(),
      body,
      happenedOn,
    });
    setPending(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setBody('');
    toast.success('Comentário adicionado.');
    onChanged();
  }

  return (
    <div className="flex flex-col gap-3 py-2">
      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum comentário ainda.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {comments.map((c) => (
            <li
              key={c.id}
              className="flex items-start justify-between gap-2 rounded-lg bg-background px-3 py-2 text-sm"
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">
                  {c.author ?? 'Sem autor'} · {formatDateBR(c.happened_on)}
                </span>
                <span className="whitespace-pre-wrap">{c.body}</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => setDeleteTarget(c)}
              >
                <Trash2Icon className="size-3.5" />
                <span className="sr-only">Excluir comentário</span>
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`author-${activityId}`}>Autor</Label>
            <Input
              id={`author-${activityId}`}
              list="responsaveis-sugestoes"
              placeholder="Nome"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`happened-${activityId}`}>Data do fato</Label>
            <Input
              id={`happened-${activityId}`}
              type="date"
              value={happenedOn}
              onChange={(e) => setHappenedOn(e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`body-${activityId}`}>Comentário</Label>
          <Textarea
            id={`body-${activityId}`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="O que aconteceu..."
          />
        </div>
        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={handleAdd} disabled={pending}>
            <PlusIcon className="size-3.5" />
            {pending ? 'Adicionando…' : 'Adicionar comentário'}
          </Button>
        </div>
      </div>

      <DeleteCommentDialog
        comment={deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onChanged={onChanged}
      />
    </div>
  );
}

function DeleteCommentDialog({
  comment,
  onOpenChange,
  onChanged,
}: {
  comment: ActivityCommentRow | null;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    if (!comment) return;
    setPending(true);
    const result = await deleteActivityComment(comment.id);
    setPending(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success('Comentário excluído.');
    onOpenChange(false);
    onChanged();
  }

  return (
    <Dialog open={comment !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir comentário</DialogTitle>
          <DialogDescription>Esta ação não pode ser desfeita.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={pending}>
            {pending ? 'Excluindo…' : 'Excluir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
