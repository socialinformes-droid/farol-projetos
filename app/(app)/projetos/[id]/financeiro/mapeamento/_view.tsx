'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import type { z } from 'zod';
import { PlusIcon, XIcon } from 'lucide-react';

import type { ProjectRow } from '@/lib/supabase/types';
import {
  createMapping,
  deleteMapping,
  mappingFormSchema,
  type MappingFormValues,
} from '@/lib/actions/mapping';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { BackLink } from '@/components/layout/back-link';
import { DimensionTabs } from '@/components/layout/dimension-tabs';

type BudgetLineOption = { id: string; code: string | null; name: string };
type MappingRow = {
  id: string;
  account_code: string;
  account_name: string | null;
  budget_line_id: string;
};

export function MapeamentoView({
  project,
  budgetLines,
  mappings,
}: {
  project: ProjectRow;
  budgetLines: BudgetLineOption[];
  mappings: MappingRow[];
}) {
  const [newOpen, setNewOpen] = useState(false);

  const mappingsByLine = useMemo(() => {
    const map = new Map<string, MappingRow[]>();
    for (const m of mappings) {
      const list = map.get(m.budget_line_id) ?? [];
      list.push(m);
      map.set(m.budget_line_id, list);
    }
    return map;
  }, [mappings]);

  const lineItems = useMemo(
    () =>
      Object.fromEntries(
        budgetLines.map((l): [string, string] => [
          l.id,
          l.code ? `${l.code} — ${l.name}` : l.name,
        ]),
      ),
    [budgetLines],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <BackLink href={`/projetos/${project.id}/financeiro`} label="Financeiro" />
        <DimensionTabs projectId={project.id} active="financeiro" />
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl">Mapeamento conta → rubrica</h1>
            <p className="text-sm text-muted-foreground">
              {project.code} — {project.name}
            </p>
          </div>
          <Button onClick={() => setNewOpen(true)} disabled={budgetLines.length === 0}>
            <PlusIcon className="size-4" />
            Novo mapeamento
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Ao importar o razão, uma conta sem mapeamento salvo pede uma decisão na hora. Cadastrar
          aqui de antemão evita a pergunta no dia do import.
        </p>
      </div>

      {budgetLines.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
          <p className="text-sm text-muted-foreground">
            Cadastre ao menos uma rubrica antes de mapear contas do razão.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {budgetLines.map((line) => (
            <Card key={line.id}>
              <CardContent className="flex flex-col gap-3">
                <p className="font-medium">
                  {line.code ? `${line.code} — ` : ''}
                  {line.name}
                </p>
                {(mappingsByLine.get(line.id) ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma conta mapeada ainda.</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {(mappingsByLine.get(line.id) ?? []).map((m) => (
                      <MappingItem key={m.id} mapping={m} />
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <NewMappingDialog
        projectId={project.id}
        budgetLines={budgetLines}
        lineItems={lineItems}
        open={newOpen}
        onOpenChange={setNewOpen}
      />
    </div>
  );
}

function MappingItem({ mapping }: { mapping: MappingRow }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    setPending(true);
    const result = await deleteMapping(mapping.id);
    setPending(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success('Mapeamento removido.');
    router.refresh();
  }

  return (
    <li className="flex items-center justify-between gap-2 text-sm">
      <span>
        <span className="font-mono text-xs text-muted-foreground">{mapping.account_code}</span>
        {mapping.account_name && (
          <span className="text-muted-foreground"> — {mapping.account_name}</span>
        )}
      </span>
      <Button type="button" variant="ghost" size="icon-xs" disabled={pending} onClick={handleDelete}>
        <XIcon className="size-3.5" />
        <span className="sr-only">Remover mapeamento</span>
      </Button>
    </li>
  );
}

function NewMappingDialog({
  projectId,
  budgetLines,
  lineItems,
  open,
  onOpenChange,
}: {
  projectId: string;
  budgetLines: BudgetLineOption[];
  lineItems: Record<string, string>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof mappingFormSchema>, unknown, MappingFormValues>({
    resolver: zodResolver(mappingFormSchema),
    defaultValues: { accountCode: '', accountName: null, budgetLineId: budgetLines[0]?.id ?? '' },
  });

  async function submit(values: MappingFormValues) {
    const result = await createMapping(projectId, values);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success('Mapeamento criado.');
    reset({ accountCode: '', accountName: null, budgetLineId: budgetLines[0]?.id ?? '' });
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo mapeamento</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mapping-account-code">Código da conta (razão)</Label>
            <Input
              id="mapping-account-code"
              placeholder="ex: 31010401001"
              {...register('accountCode')}
            />
            {errors.accountCode && (
              <p className="text-xs text-destructive">{errors.accountCode.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mapping-account-name">Nome da conta (opcional)</Label>
            <Controller
              control={control}
              name="accountName"
              render={({ field }) => (
                <Input
                  id="mapping-account-name"
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.value)}
                />
              )}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mapping-budget-line">Rubrica de destino</Label>
            <Controller
              control={control}
              name="budgetLineId"
              render={({ field }) => (
                <Select
                  items={lineItems}
                  value={field.value}
                  onValueChange={(v) => field.onChange(v ?? '')}
                >
                  <SelectTrigger id="mapping-budget-line" className="w-full">
                    <SelectValue placeholder="Selecione uma rubrica" />
                  </SelectTrigger>
                  <SelectContent>
                    {budgetLines.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.code ? `${l.code} — ${l.name}` : l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.budgetLineId && (
              <p className="text-xs text-destructive">{errors.budgetLineId.message}</p>
            )}
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
              Criar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
