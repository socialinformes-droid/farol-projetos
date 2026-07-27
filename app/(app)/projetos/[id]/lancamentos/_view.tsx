'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  PlusIcon,
  SearchIcon,
  MoreVerticalIcon,
  PencilIcon,
  Trash2Icon,
  TagIcon,
  ExternalLinkIcon,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ChevronDown,
} from 'lucide-react';

import type { ProjectRow, BudgetLineRow, LedgerEntryRow, EntryKind } from '@/lib/supabase/types';
import {
  createEntry,
  updateEntry,
  deleteEntry,
  reclassifyEntry,
  type EntryFormValues,
} from '@/lib/actions/entries';
import { EntryForm, type BudgetLineOption } from '@/components/forms/entry-form';
import { formatBRL, formatDateBR } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  DropdownMenuLinkItem,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

// Sentinela usado no filtro de rubrica: "Sem rubrica" precisa de um valor
// próprio na query string / estado, já que `budget_line_id` nulo não tem
// como aparecer numa lista de ids.
const SEM_RUBRICA = 'sem';

const KIND_LABEL: Record<EntryKind, string> = {
  despesa: 'Despesa',
  baixa: 'Baixa',
  manual: 'Manual',
};

type MultiSelectOption = { value: string; label: string };

function MultiSelect({
  label,
  values,
  onChange,
  options,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  options: MultiSelectOption[];
}) {
  const isNeutral = values.length === 0 || values.length === options.length;
  const display =
    values.length === 0 || values.length === options.length
      ? null
      : values.length === 1
        ? (options.find((o) => o.value === values[0])?.label ?? '')
        : `${values.length} selecionados`;

  const toggle = (v: string) =>
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);

  const selectAll = () => onChange(options.map((o) => o.value));
  const clear = () => onChange([]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex h-8 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 dark:hover:bg-input/50">
        {isNeutral ? (
          <span className="text-muted-foreground/70 text-[11px] uppercase tracking-wider">
            {label}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 truncate">
            <span className="text-muted-foreground/70 text-[11px] uppercase tracking-wider shrink-0">
              {label}
            </span>
            <span className="text-foreground/85 truncate">{display}</span>
          </span>
        )}
        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-72 min-w-44">
        <DropdownMenuItem
          closeOnClick={false}
          onClick={(e) => {
            e.preventDefault();
            selectAll();
          }}
          className="text-[11px] uppercase tracking-wider text-muted-foreground"
        >
          Marcar todos
        </DropdownMenuItem>
        {values.length > 0 && (
          <DropdownMenuItem
            closeOnClick={false}
            onClick={(e) => {
              e.preventDefault();
              clear();
            }}
            className="text-[11px] uppercase tracking-wider text-muted-foreground"
          >
            Limpar
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.value}
            checked={values.includes(o.value)}
            onCheckedChange={() => toggle(o.value)}
          >
            {o.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type SortKey = 'entry_date' | 'rubrica' | 'description' | 'vendor_name' | 'amount';
type SortDir = 'asc' | 'desc';
type SortState = { key: SortKey; dir: SortDir };

const NUMERIC_KEYS: SortKey[] = ['amount', 'entry_date'];

function SortHead({
  label,
  sortKey,
  sort,
  onToggle,
  align = 'left',
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onToggle: (k: SortKey) => void;
  align?: 'left' | 'right';
}) {
  const active = sort.key === sortKey;
  const isNumeric = NUMERIC_KEYS.includes(sortKey);
  const ascLabel = isNumeric ? 'menor → maior' : 'A → Z';
  const descLabel = isNumeric ? 'maior → menor' : 'Z → A';
  const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
  const title = active
    ? `Ordenado: ${sort.dir === 'asc' ? ascLabel : descLabel} — clique para inverter`
    : `Ordenar (${ascLabel} / ${descLabel})`;
  return (
    <TableHead className={align === 'right' ? 'text-right' : undefined}>
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        title={title}
        className={`inline-flex items-center gap-1 select-none hover:text-foreground transition ${
          active ? 'text-foreground' : 'text-muted-foreground'
        } ${align === 'right' ? 'flex-row-reverse' : ''}`}
      >
        <span>{label}</span>
        <Icon className="h-3 w-3 opacity-70" />
      </button>
    </TableHead>
  );
}

function flattenLineOptions(lines: BudgetLineRow[]): BudgetLineOption[] {
  return [...lines]
    .sort((a, b) => (a.code ?? a.name).localeCompare(b.code ?? b.name, 'pt-BR'))
    .map((l) => ({ id: l.id, label: l.code ? `${l.code} — ${l.name}` : l.name }));
}

export function LancamentosView({
  project,
  lines,
  entries,
  initialUnclassifiedOnly,
}: {
  project: ProjectRow;
  lines: BudgetLineRow[];
  entries: LedgerEntryRow[];
  initialUnclassifiedOnly: boolean;
}) {
  const router = useRouter();
  const [newOpen, setNewOpen] = useState(false);

  const lineOptions = useMemo(() => flattenLineOptions(lines), [lines]);
  const lineNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of lineOptions) map.set(o.id, o.label);
    return map;
  }, [lineOptions]);

  const [q, setQ] = useState('');
  const [rubricaFilter, setRubricaFilter] = useState<string[]>(
    initialUnclassifiedOnly ? [SEM_RUBRICA] : [],
  );
  const [kindFilter, setKindFilter] = useState<EntryKind[]>([]);
  const [origin, setOrigin] = useState<'all' | 'import' | 'manual'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sort, setSort] = useState<SortState>({ key: 'entry_date', dir: 'desc' });

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  const rubricaOptions: MultiSelectOption[] = useMemo(
    () => [{ value: SEM_RUBRICA, label: 'Sem rubrica' }, ...lineOptions.map((o) => ({ value: o.id, label: o.label }))],
    [lineOptions],
  );

  const kindOptions: MultiSelectOption[] = [
    { value: 'despesa', label: 'Despesa' },
    { value: 'baixa', label: 'Baixa' },
    { value: 'manual', label: 'Manual' },
  ];

  const originItems: Record<string, string> = {
    all: 'Todas as origens',
    import: 'Importadas',
    manual: 'Manuais',
  };

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return entries.filter((e) => {
      if (rubricaFilter.length > 0) {
        const matches =
          (e.budget_line_id === null && rubricaFilter.includes(SEM_RUBRICA)) ||
          (e.budget_line_id !== null && rubricaFilter.includes(e.budget_line_id));
        if (!matches) return false;
      }
      if (kindFilter.length > 0 && !kindFilter.includes(e.kind)) return false;
      if (origin !== 'all' && e.source !== origin) return false;
      if (dateFrom && e.entry_date < dateFrom) return false;
      if (dateTo && e.entry_date > dateTo) return false;
      if (query) {
        const haystack = [e.description, e.vendor_name, e.voucher, e.document]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [entries, q, rubricaFilter, kindFilter, origin, dateFrom, dateTo]);

  const summary = useMemo(() => {
    const sum = filtered.reduce((acc, e) => acc + Number(e.amount), 0);
    return { count: filtered.length, sum };
  }, [filtered]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const { key, dir } = sort;
    const mult = dir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      if (key === 'amount') return (Number(a.amount) - Number(b.amount)) * mult;
      if (key === 'entry_date') return a.entry_date.localeCompare(b.entry_date) * mult;
      if (key === 'rubrica') {
        const av = a.budget_line_id ? (lineNameById.get(a.budget_line_id) ?? '') : 'Sem rubrica';
        const bv = b.budget_line_id ? (lineNameById.get(b.budget_line_id) ?? '') : 'Sem rubrica';
        return av.localeCompare(bv, 'pt-BR', { sensitivity: 'base' }) * mult;
      }
      const av = (a[key] ?? '') as string;
      const bv = (b[key] ?? '') as string;
      return av.localeCompare(bv, 'pt-BR', { sensitivity: 'base' }) * mult;
    });
    return arr;
  }, [filtered, sort, lineNameById]);

  const refresh = () => router.refresh();

  const boundCreateEntry = (values: EntryFormValues) => createEntry(project.id, values);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl">Lançamentos</h1>
          <p className="text-sm text-muted-foreground">
            {project.code} — {project.name}
          </p>
        </div>
        <Button onClick={() => setNewOpen(true)}>
          <PlusIcon className="size-4" />
          Novo lançamento
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
        <div className="relative col-span-2">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Buscar descrição, fornecedor, comprovante, documento..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <MultiSelect label="Rubrica" values={rubricaFilter} onChange={setRubricaFilter} options={rubricaOptions} />
        <MultiSelect
          label="Tipo"
          values={kindFilter}
          onChange={(v) => setKindFilter(v as EntryKind[])}
          options={kindOptions}
        />
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          aria-label="Data inicial"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          aria-label="Data final"
        />
      </div>

      <div className="w-full max-w-56">
        <Select
          items={originItems}
          value={origin}
          onValueChange={(v) => setOrigin((v ?? 'all') as typeof origin)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Origem" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as origens</SelectItem>
            <SelectItem value="import">Importadas</SelectItem>
            <SelectItem value="manual">Manuais</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="py-3 text-sm">
          <span className="font-medium">{summary.count}</span>{' '}
          {summary.count === 1 ? 'lançamento' : 'lançamentos'} · soma{' '}
          <span className="font-medium">{formatBRL(summary.sum)}</span>
        </CardContent>
      </Card>

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
          <p className="text-sm text-muted-foreground">Nenhum lançamento encontrado.</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <SortHead label="Data" sortKey="entry_date" sort={sort} onToggle={toggleSort} />
              <SortHead label="Rubrica" sortKey="rubrica" sort={sort} onToggle={toggleSort} />
              <SortHead label="Descrição" sortKey="description" sort={sort} onToggle={toggleSort} />
              <SortHead label="Fornecedor" sortKey="vendor_name" sort={sort} onToggle={toggleSort} />
              <TableHead>Tipo</TableHead>
              <TableHead>Origem</TableHead>
              <SortHead label="Valor" sortKey="amount" sort={sort} onToggle={toggleSort} align="right" />
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                rubricaLabel={
                  entry.budget_line_id ? (lineNameById.get(entry.budget_line_id) ?? '—') : 'Sem rubrica'
                }
                lineOptions={lineOptions}
                onChanged={refresh}
              />
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo lançamento</DialogTitle>
          </DialogHeader>
          <EntryForm
            lineOptions={lineOptions}
            onSubmit={boundCreateEntry}
            onSuccess={() => {
              setNewOpen(false);
              refresh();
            }}
            submitLabel="Criar"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EntryRow({
  entry,
  rubricaLabel,
  lineOptions,
  onChanged,
}: {
  entry: LedgerEntryRow;
  rubricaLabel: string;
  lineOptions: BudgetLineOption[];
  onChanged: () => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [reclassifyOpen, setReclassifyOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const isManual = entry.source === 'manual';

  return (
    <>
      <TableRow>
        <TableCell>{formatDateBR(entry.entry_date)}</TableCell>
        <TableCell>{rubricaLabel}</TableCell>
        <TableCell className="max-w-[240px] truncate" title={entry.description ?? undefined}>
          {entry.description ?? '—'}
        </TableCell>
        <TableCell className="max-w-[180px] truncate" title={entry.vendor_name ?? undefined}>
          {entry.vendor_name ?? '—'}
        </TableCell>
        <TableCell>
          <Badge variant="outline">{KIND_LABEL[entry.kind]}</Badge>
        </TableCell>
        <TableCell>
          <Badge variant={isManual ? 'secondary' : 'outline'}>
            {isManual ? 'Manual' : 'Importado'}
          </Badge>
        </TableCell>
        <TableCell className="text-right font-mono">{formatBRL(entry.amount)}</TableCell>
        <TableCell>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
              <MoreVerticalIcon className="size-4" />
              <span className="sr-only">Ações</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setReclassifyOpen(true)}>
                <TagIcon />
                Reclassificar
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!isManual} onClick={() => setEditOpen(true)}>
                <PencilIcon />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                disabled={!isManual}
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2Icon />
                Excluir
              </DropdownMenuItem>
              {(entry.urls.nota_fiscal || entry.urls.comprovante) && <DropdownMenuSeparator />}
              {entry.urls.nota_fiscal && (
                <DropdownMenuLinkItem href={entry.urls.nota_fiscal} target="_blank" rel="noreferrer">
                  <ExternalLinkIcon />
                  Nota fiscal
                </DropdownMenuLinkItem>
              )}
              {entry.urls.comprovante && (
                <DropdownMenuLinkItem href={entry.urls.comprovante} target="_blank" rel="noreferrer">
                  <ExternalLinkIcon />
                  Comprovante
                </DropdownMenuLinkItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar lançamento</DialogTitle>
          </DialogHeader>
          <EntryForm
            lineOptions={lineOptions}
            defaultValues={{
              budgetLineId: entry.budget_line_id,
              entryDate: entry.entry_date,
              amount: Number(entry.amount),
              description: entry.description,
              vendorName: entry.vendor_name,
              document: entry.document,
            }}
            onSubmit={(values) => updateEntry(entry.id, values)}
            onSuccess={() => {
              setEditOpen(false);
              onChanged();
            }}
            submitLabel="Salvar"
          />
        </DialogContent>
      </Dialog>

      <ReclassifyDialog
        entry={entry}
        lineOptions={lineOptions}
        open={reclassifyOpen}
        onOpenChange={setReclassifyOpen}
        onChanged={onChanged}
      />

      <DeleteEntryDialog
        entry={entry}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onChanged={onChanged}
      />
    </>
  );
}

const RECLASSIFY_NONE = '__sem_rubrica__';

function ReclassifyDialog({
  entry,
  lineOptions,
  open,
  onOpenChange,
  onChanged,
}: {
  entry: LedgerEntryRow;
  lineOptions: BudgetLineOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const [value, setValue] = useState(entry.budget_line_id ?? RECLASSIFY_NONE);
  const [pending, setPending] = useState(false);

  const items = useMemo(() => {
    const map: Record<string, string> = { [RECLASSIFY_NONE]: 'Sem rubrica' };
    for (const o of lineOptions) map[o.id] = o.label;
    return map;
  }, [lineOptions]);

  async function handleReclassify() {
    setPending(true);
    const budgetLineId = value === RECLASSIFY_NONE ? null : value;
    const result = await reclassifyEntry(entry.id, budgetLineId);
    setPending(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success('Lançamento reclassificado.');
    onOpenChange(false);
    onChanged();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reclassificar lançamento</DialogTitle>
          <DialogDescription>Escolha a nova rubrica para este lançamento.</DialogDescription>
        </DialogHeader>
        <Select items={items} value={value} onValueChange={(v) => setValue(v ?? RECLASSIFY_NONE)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Selecione uma rubrica" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={RECLASSIFY_NONE}>Sem rubrica</SelectItem>
            {lineOptions.map((o) => (
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
          <Button onClick={handleReclassify} disabled={pending}>
            {pending ? 'Reclassificando…' : 'Reclassificar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteEntryDialog({
  entry,
  open,
  onOpenChange,
  onChanged,
}: {
  entry: LedgerEntryRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    setPending(true);
    const result = await deleteEntry(entry.id);
    setPending(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success('Lançamento excluído.');
    onOpenChange(false);
    onChanged();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir lançamento</DialogTitle>
          <DialogDescription>
            Tem certeza que deseja excluir este lançamento
            {entry.description ? ` ("${entry.description}")` : ''}? Essa ação não pode ser
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
