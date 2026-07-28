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
  PaperclipIcon,
  FileTextIcon,
  ReceiptIcon,
  StickyNoteIcon,
  LockIcon,
  FileWarningIcon,
} from 'lucide-react';

import type { ProjectRow, BudgetLineRow, LedgerEntryRow, EntryKind } from '@/lib/supabase/types';
import {
  createEntry,
  updateEntry,
  deleteEntry,
  reclassifyEntry,
  updateEntryDetails,
  type EntryFormValues,
  type EntryDetailsValues,
} from '@/lib/actions/entries';
import { EntryForm, type BudgetLineOption } from '@/components/forms/entry-form';
import { formatBRL, formatDateBR } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  aporte: 'Aporte',
  ignorado: 'Fora do cálculo',
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
  const [missingNotaOnly, setMissingNotaOnly] = useState(false);
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
      if (missingNotaOnly && e.urls.nota_fiscal) return false;
      if (query) {
        const haystack = [e.description, e.vendor_name, e.voucher, e.document]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [entries, q, rubricaFilter, kindFilter, origin, dateFrom, dateTo, missingNotaOnly]);

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

      <div className="flex items-center gap-2">
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
        <Button
          type="button"
          variant={missingNotaOnly ? 'secondary' : 'outline'}
          size="sm"
          onClick={() => setMissingNotaOnly((v) => !v)}
        >
          <FileWarningIcon className="size-3.5" />
          Sem nota fiscal
        </Button>
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
              <TableHead>Anexos</TableHead>
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

/**
 * Coluna compacta com o estado dos anexos. A ausência de nota fiscal precisa
 * ser visível de cara — é o que o usuário está caçando ao rolar a tabela —
 * então o ícone continua presente e apenas apagado, em vez de sumir.
 */
function AttachmentsCell({ entry }: { entry: LedgerEntryRow }) {
  const notaFiscalUrl = entry.urls.nota_fiscal;
  const comprovanteUrl = entry.urls.comprovante;
  const hasNotes = Boolean(entry.notes && entry.notes.trim() !== '');

  return (
    <div className="flex items-center gap-2.5">
      {notaFiscalUrl ? (
        <a
          href={notaFiscalUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="Nota fiscal"
          className="text-foreground/70 transition-colors hover:text-foreground"
        >
          <FileTextIcon className="size-4" />
          <span className="sr-only">Nota fiscal</span>
        </a>
      ) : (
        <span title="Sem nota fiscal" className="text-muted-foreground/30">
          <FileTextIcon className="size-4" />
          <span className="sr-only">Sem nota fiscal</span>
        </span>
      )}
      {comprovanteUrl ? (
        <a
          href={comprovanteUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="Comprovante"
          className="text-foreground/70 transition-colors hover:text-foreground"
        >
          <ReceiptIcon className="size-4" />
          <span className="sr-only">Comprovante</span>
        </a>
      ) : (
        <span title="Sem comprovante" className="text-muted-foreground/30">
          <ReceiptIcon className="size-4" />
          <span className="sr-only">Sem comprovante</span>
        </span>
      )}
      {hasNotes && (
        <span title={entry.notes ?? undefined} className="text-amber-600 dark:text-amber-400">
          <StickyNoteIcon className="size-4" />
          <span className="sr-only">Tem observação</span>
        </span>
      )}
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
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
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
          <AttachmentsCell entry={entry} />
        </TableCell>
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
              <DropdownMenuItem onClick={() => setAttachmentsOpen(true)}>
                <PaperclipIcon />
                Anexos e observações
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

      <AttachmentsDialog
        entry={entry}
        lineOptions={lineOptions}
        open={attachmentsOpen}
        onOpenChange={setAttachmentsOpen}
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

/** Mapa valor -> rótulo para o Select de rubrica usado nos diálogos de reclassificar/anexos. */
function budgetLineSelectItems(lineOptions: BudgetLineOption[]): Record<string, string> {
  const map: Record<string, string> = { [RECLASSIFY_NONE]: 'Sem rubrica' };
  for (const o of lineOptions) map[o.id] = o.label;
  return map;
}

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

  const items = useMemo(() => budgetLineSelectItems(lineOptions), [lineOptions]);

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

/** Campo de contexto travado — espelha o razão contábil e não é editável aqui. */
function LockedField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-2.5 py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="max-w-[200px] truncate text-sm" title={value}>
          {value}
        </span>
        <span
          className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground/70"
          title="Vem do razão contábil — não pode ser editado aqui."
        >
          <LockIcon className="size-3" />
          do razão
        </span>
      </div>
    </div>
  );
}

/**
 * Diálogo único para anexos, observação e rubrica — disponível em qualquer
 * lançamento, inclusive importado. Valor/data/conta/descrição de um
 * importado só aparecem como contexto travado: editá-los faria a tela
 * divergir do razão contábil (ver `updateEntry` em `entries-mutations.ts`).
 * Anexos, observação e rubrica não têm essa restrição.
 */
function AttachmentsDialog({
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
  const isImported = entry.source === 'import';

  const [budgetLineId, setBudgetLineId] = useState(entry.budget_line_id ?? RECLASSIFY_NONE);
  const [notaFiscalUrl, setNotaFiscalUrl] = useState(entry.urls.nota_fiscal ?? '');
  const [comprovanteUrl, setComprovanteUrl] = useState(entry.urls.comprovante ?? '');
  const [notes, setNotes] = useState(entry.notes ?? '');
  const [pending, setPending] = useState(false);

  const items = useMemo(() => budgetLineSelectItems(lineOptions), [lineOptions]);

  async function handleSave() {
    setPending(true);

    const newBudgetLineId = budgetLineId === RECLASSIFY_NONE ? null : budgetLineId;
    const budgetLineChanged = newBudgetLineId !== (entry.budget_line_id ?? null);

    if (budgetLineChanged) {
      const reclass = await reclassifyEntry(entry.id, newBudgetLineId);
      if (!reclass.ok) {
        setPending(false);
        toast.error(reclass.error);
        return;
      }
    }

    const details: EntryDetailsValues = { notaFiscalUrl, comprovanteUrl, notes };
    const result = await updateEntryDetails(entry.id, details);
    setPending(false);

    if (!result.ok) {
      toast.error(result.error);
      // A reclassificação, se houve, já foi salva — reflete na tabela mesmo
      // com o restante pendente, em vez de esconder o que já funcionou.
      if (budgetLineChanged) onChanged();
      return;
    }

    toast.success('Lançamento atualizado.');
    onOpenChange(false);
    onChanged();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isImported ? 'Editar lançamento (importado do razão)' : 'Editar anexos e observações'}
          </DialogTitle>
          <DialogDescription>
            {isImported
              ? 'Valor, data, conta e descrição espelham o razão contábil e não podem ser alterados aqui.'
              : 'Anexe a nota fiscal, o comprovante e uma observação, se precisar.'}
          </DialogDescription>
        </DialogHeader>

        {isImported && (
          <div className="flex flex-col gap-1">
            <LockedField label="Data" value={formatDateBR(entry.entry_date)} />
            <LockedField label="Valor" value={formatBRL(entry.amount)} />
            <LockedField label="Conta" value={entry.account_code ?? '—'} />
            <LockedField label="Descrição" value={entry.description ?? '—'} />
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`rubrica-${entry.id}`}>Rubrica</Label>
          <Select
            items={items}
            value={budgetLineId}
            onValueChange={(v) => setBudgetLineId(v ?? RECLASSIFY_NONE)}
          >
            <SelectTrigger id={`rubrica-${entry.id}`} className="w-full">
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
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`nota-fiscal-${entry.id}`}>URL nota fiscal</Label>
          <Input
            id={`nota-fiscal-${entry.id}`}
            type="url"
            placeholder="https://…"
            value={notaFiscalUrl}
            onChange={(e) => setNotaFiscalUrl(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`comprovante-${entry.id}`}>URL comprovante</Label>
          <Input
            id={`comprovante-${entry.id}`}
            type="url"
            placeholder="https://…"
            value={comprovanteUrl}
            onChange={(e) => setComprovanteUrl(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`notes-${entry.id}`}>Observações</Label>
          <Textarea
            id={`notes-${entry.id}`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
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
