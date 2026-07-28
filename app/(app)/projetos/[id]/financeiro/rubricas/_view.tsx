'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import type { z } from 'zod';
import {
  PlusIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  MoreVerticalIcon,
  PencilIcon,
  FolderInputIcon,
  Trash2Icon,
} from 'lucide-react';

import type { ProjectRow } from '@/lib/supabase/types';
import type { ProjectSummary, LineResult } from '@/lib/domain/budget';
import {
  createBudgetLine,
  updateBudgetLine,
  deleteBudgetLine,
  moveBudgetLine,
  budgetLineFormSchema,
  type BudgetLineFormValues,
} from '@/lib/actions/budget-lines';
import { formatBRL } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { BackLink } from '@/components/layout/back-link';
import { DimensionTabs } from '@/components/layout/dimension-tabs';

// Sentinela usada no Select de grupo: Base UI Select trabalha com valores
// string não-vazios, então "(nenhum)" precisa de um valor próprio que é
// convertido para `null` na leitura/escrita do form.
const NONE_VALUE = '__none__';

type FlatOption = { id: string; label: string };

/** Arredonda a 2 casas evitando o resíduo binário de somas de float. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Lista achatada de todas as rubricas (qualquer nível), para os Selects de grupo. */
function flattenLines(lines: LineResult[], depth = 0): FlatOption[] {
  return lines.flatMap((l) => [
    {
      id: l.id,
      label: `${'—'.repeat(depth)}${depth > 0 ? ' ' : ''}${l.code ? `${l.code} — ` : ''}${l.name}`,
    },
    ...flattenLines(l.children, depth + 1),
  ]);
}

/**
 * Mapa valor -> rótulo para o Select de grupo. O Base UI Select só resolve o
 * rótulo exibido no trigger a partir da prop `items` do Root — sem ela, antes
 * do popup ter sido aberto uma vez, `<SelectValue>` mostra o valor bruto
 * (ex.: o sentinel "__none__") em vez do texto do item.
 */
function groupSelectItems(options: FlatOption[]): Record<string, string> {
  const map: Record<string, string> = { [NONE_VALUE]: '(nenhum)' };
  for (const o of options) map[o.id] = o.label;
  return map;
}

/** Soma o orçado apenas das rubricas de controle (budgeted !== null), em qualquer nível. */
function sumControlBudget(lines: LineResult[]): number {
  return lines.reduce(
    (acc, l) => acc + (l.isControl ? (l.budgeted ?? 0) : 0) + sumControlBudget(l.children),
    0,
  );
}

export function BudgetLinesView({
  project,
  summary,
}: {
  project: ProjectRow;
  summary: ProjectSummary;
}) {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [newOpen, setNewOpen] = useState(false);

  const options = useMemo(() => flattenLines(summary.lines), [summary.lines]);
  const totalBudget = Number(project.total_budget);
  const budgetedSum = useMemo(() => sumControlBudget(summary.lines), [summary.lines]);
  const diff = round2(totalBudget - budgetedSum);

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
      <div className="flex flex-col gap-2">
        <BackLink href={`/projetos/${project.id}/financeiro`} label="Financeiro" />
        <DimensionTabs projectId={project.id} active="financeiro" />
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl">Rubricas</h1>
            <p className="text-sm text-muted-foreground">
              {project.code} — {project.name}
            </p>
          </div>
          <Button onClick={() => setNewOpen(true)}>
            <PlusIcon className="size-4" />
            Nova rubrica
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="py-3 text-sm">
          <span className="font-medium">Orçado nas rubricas:</span> {formatBRL(budgetedSum)} de{' '}
          {formatBRL(totalBudget)}
          {Math.abs(diff) >= 0.005 && (
            <span
              className={
                diff > 0
                  ? 'ml-1 text-amber-700 dark:text-amber-400'
                  : 'ml-1 text-destructive'
              }
            >
              — {diff > 0
                ? `faltam ${formatBRL(diff)} a distribuir`
                : `excedem em ${formatBRL(Math.abs(diff))}`}
            </span>
          )}
        </CardContent>
      </Card>

      {summary.lines.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border py-16 text-center">
          <p className="text-sm text-muted-foreground">Nenhuma rubrica cadastrada ainda.</p>
          <Button onClick={() => setNewOpen(true)}>
            <PlusIcon className="size-4" />
            Nova rubrica
          </Button>
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
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {summary.lines.map((line) => (
              <BudgetLineRow
                key={line.id}
                line={line}
                depth={0}
                parentId={null}
                projectId={project.id}
                options={options}
                collapsedIds={collapsedIds}
                onToggleCollapse={toggleCollapse}
              />
            ))}
          </TableBody>
        </Table>
      )}

      <BudgetLineFormDialog
        mode="create"
        projectId={project.id}
        options={options}
        open={newOpen}
        onOpenChange={setNewOpen}
        defaultValues={{ code: '', name: '', budgetedAmount: null, parentId: null, sortOrder: 0 }}
      />
    </div>
  );
}

function BudgetLineRow({
  line,
  depth,
  parentId,
  projectId,
  options,
  collapsedIds,
  onToggleCollapse,
}: {
  line: LineResult;
  depth: number;
  parentId: string | null;
  projectId: string;
  options: FlatOption[];
  collapsedIds: Set<string>;
  onToggleCollapse: (id: string) => void;
}) {
  const router = useRouter();
  const hasChildren = line.children.length > 0;
  const isCollapsed = collapsedIds.has(line.id);

  const [budgetValue, setBudgetValue] = useState<string>(
    line.budgeted === null ? '' : String(line.budgeted),
  );
  // Espelha `line.budgeted` para detectar, durante a renderização, quando o
  // servidor mudou o valor confirmado (edição bem-sucedida -> refresh) e
  // ressincronizar o campo. Ajustar estado durante a renderização (em vez de
  // num useEffect) é o padrão recomendado para "resetar estado quando uma
  // prop muda" — evita o round-trip extra de um efeito.
  const [syncedBudgeted, setSyncedBudgeted] = useState(line.budgeted);
  if (line.budgeted !== syncedBudgeted) {
    setSyncedBudgeted(line.budgeted);
    setBudgetValue(line.budgeted === null ? '' : String(line.budgeted));
  }
  const [savingBudget, setSavingBudget] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function commitBudget() {
    const trimmed = budgetValue.trim();
    const parsed = trimmed === '' ? null : Number(trimmed);

    if (parsed !== null && (Number.isNaN(parsed) || parsed < 0)) {
      toast.error('Informe um valor de orçado válido.');
      setBudgetValue(line.budgeted === null ? '' : String(line.budgeted));
      return;
    }
    if (parsed === line.budgeted) return;

    setSavingBudget(true);
    const result = await updateBudgetLine(line.id, {
      code: line.code,
      name: line.name,
      budgetedAmount: parsed,
      parentId,
      sortOrder: 0,
    });
    setSavingBudget(false);

    if (!result.ok) {
      toast.error(result.error);
      setBudgetValue(line.budgeted === null ? '' : String(line.budgeted));
      return;
    }
    router.refresh();
  }

  const editDefaultValues: BudgetLineFormValues = {
    code: line.code ?? '',
    name: line.name,
    budgetedAmount: line.budgeted,
    parentId,
    sortOrder: 0,
  };

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
          </div>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="—"
              className="w-28"
              value={budgetValue}
              disabled={savingBudget}
              onChange={(e) => setBudgetValue(e.target.value)}
              onBlur={commitBudget}
            />
            {line.budgeted === null && (
              <Badge
                variant="outline"
                className="border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-400"
              >
                sem orçamento
              </Badge>
            )}
          </div>
        </TableCell>
        <TableCell>{formatBRL(line.realized)}</TableCell>
        <TableCell
          className={line.balance !== null && line.balance < 0 ? 'text-destructive' : undefined}
        >
          {line.balance === null ? '—' : formatBRL(line.balance)}
        </TableCell>
        <TableCell className="text-right">
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
              <MoreVerticalIcon className="size-4" />
              <span className="sr-only">Ações</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setEditOpen(true)}>
                <PencilIcon />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setMoveOpen(true)}>
                <FolderInputIcon />
                Mover para grupo
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2Icon />
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>

      {hasChildren &&
        !isCollapsed &&
        line.children.map((child) => (
          <BudgetLineRow
            key={child.id}
            line={child}
            depth={depth + 1}
            parentId={line.id}
            projectId={projectId}
            options={options}
            collapsedIds={collapsedIds}
            onToggleCollapse={onToggleCollapse}
          />
        ))}

      <BudgetLineFormDialog
        mode="edit"
        projectId={projectId}
        lineId={line.id}
        options={options}
        open={editOpen}
        onOpenChange={setEditOpen}
        defaultValues={editDefaultValues}
      />
      <MoveBudgetLineDialog
        line={line}
        options={options}
        open={moveOpen}
        onOpenChange={setMoveOpen}
      />
      <DeleteBudgetLineDialog line={line} open={deleteOpen} onOpenChange={setDeleteOpen} />
    </>
  );
}

function BudgetLineFormDialog({
  mode,
  projectId,
  lineId,
  options,
  open,
  onOpenChange,
  defaultValues,
}: {
  mode: 'create' | 'edit';
  projectId: string;
  lineId?: string;
  options: FlatOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultValues: BudgetLineFormValues;
}) {
  const router = useRouter();
  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof budgetLineFormSchema>, unknown, BudgetLineFormValues>({
    resolver: zodResolver(budgetLineFormSchema),
    defaultValues,
  });
  const groupItems = useMemo(() => groupSelectItems(options), [options]);

  async function submit(values: BudgetLineFormValues) {
    const result =
      mode === 'create'
        ? await createBudgetLine(projectId, values)
        : await updateBudgetLine(lineId as string, values);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(mode === 'create' ? 'Rubrica criada.' : 'Rubrica atualizada.');
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Nova rubrica' : 'Editar rubrica'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`code-${mode}-${lineId ?? 'new'}`}>Código</Label>
            <Input
              id={`code-${mode}-${lineId ?? 'new'}`}
              placeholder="ex: 31010401001"
              {...register('code')}
            />
            {errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`name-${mode}-${lineId ?? 'new'}`}>Rubrica</Label>
            <Input id={`name-${mode}-${lineId ?? 'new'}`} {...register('name')} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`budgetedAmount-${mode}-${lineId ?? 'new'}`}>Orçado</Label>
            <Controller
              control={control}
              name="budgetedAmount"
              render={({ field }) => (
                <Input
                  id={`budgetedAmount-${mode}-${lineId ?? 'new'}`}
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="—"
                  value={field.value ?? ''}
                  onChange={(e) =>
                    field.onChange(e.target.value === '' ? null : Number(e.target.value))
                  }
                />
              )}
            />
            {errors.budgetedAmount && (
              <p className="text-xs text-destructive">{errors.budgetedAmount.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`parentId-${mode}-${lineId ?? 'new'}`}>Grupo</Label>
            <Controller
              control={control}
              name="parentId"
              render={({ field }) => (
                <Select
                  items={groupItems}
                  value={field.value ?? NONE_VALUE}
                  onValueChange={(v) => field.onChange(v === NONE_VALUE ? null : v)}
                >
                  <SelectTrigger id={`parentId-${mode}-${lineId ?? 'new'}`} className="w-full">
                    <SelectValue placeholder="Selecione um grupo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>(nenhum)</SelectItem>
                    {options
                      .filter((o) => o.id !== lineId)
                      .map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {mode === 'create' ? 'Criar' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MoveBudgetLineDialog({
  line,
  options,
  open,
  onOpenChange,
}: {
  line: LineResult;
  options: FlatOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [value, setValue] = useState<string>(NONE_VALUE);
  const [pending, setPending] = useState(false);
  const groupItems = useMemo(() => groupSelectItems(options), [options]);

  async function handleMove() {
    setPending(true);
    const parentId = value === NONE_VALUE ? null : value;
    const result = await moveBudgetLine(line.id, parentId);
    setPending(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success('Rubrica movida.');
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mover &ldquo;{line.name}&rdquo; para grupo</DialogTitle>
        </DialogHeader>
        <Select items={groupItems} value={value} onValueChange={(v) => setValue(v ?? NONE_VALUE)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Selecione um grupo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_VALUE}>(nenhum)</SelectItem>
            {options
              .filter((o) => o.id !== line.id)
              .map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.label}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={handleMove} disabled={pending}>
            {pending ? 'Movendo…' : 'Mover'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteBudgetLineDialog({
  line,
  open,
  onOpenChange,
}: {
  line: LineResult;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    setPending(true);
    const result = await deleteBudgetLine(line.id);
    setPending(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success('Rubrica excluída.');
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir rubrica</DialogTitle>
          <DialogDescription>
            Tem certeza que deseja excluir &ldquo;{line.name}&rdquo;? Essa ação não pode ser
            desfeita.
          </DialogDescription>
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
