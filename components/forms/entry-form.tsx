'use client';

import { useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';

import type { ActionResult } from '@/lib/actions/project-schema';
import { entryFormSchema, type EntryFormValues } from '@/lib/actions/entries';
import { toISODate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Sentinela para "Sem rubrica" no Select — o Base UI Select trabalha com
// valores string não-vazios, então `null` precisa de um valor próprio que é
// convertido de volta na leitura/escrita do form.
const NONE_VALUE = '__sem_rubrica__';

export type BudgetLineOption = { id: string; label: string };

/**
 * Mapa valor -> rótulo para o Select de rubrica. O Base UI Select só resolve
 * o rótulo exibido no trigger a partir da prop `items` do Root — sem ela,
 * antes do popup ter sido aberto uma vez, `<SelectValue>` mostra o valor
 * bruto (ex.: o sentinel "__sem_rubrica__") em vez do texto do item.
 */
function lineSelectItems(options: BudgetLineOption[]): Record<string, string> {
  const map: Record<string, string> = { [NONE_VALUE]: 'Sem rubrica' };
  for (const o of options) map[o.id] = o.label;
  return map;
}

type EntryFormProps = {
  defaultValues?: Partial<EntryFormValues>;
  lineOptions: BudgetLineOption[];
  onSubmit: (values: EntryFormValues) => Promise<ActionResult<{ id: string }> | ActionResult>;
  onSuccess: () => void;
  submitLabel: string;
};

export function EntryForm({
  defaultValues,
  lineOptions,
  onSubmit,
  onSuccess,
  submitLabel,
}: EntryFormProps) {
  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EntryFormValues>({
    resolver: zodResolver(entryFormSchema),
    defaultValues: {
      budgetLineId: defaultValues?.budgetLineId ?? null,
      entryDate: defaultValues?.entryDate ?? toISODate(new Date()),
      amount: defaultValues?.amount ?? 0,
      description: defaultValues?.description ?? null,
      vendorName: defaultValues?.vendorName ?? null,
      document: defaultValues?.document ?? null,
    },
  });

  const lineItems = useMemo(() => lineSelectItems(lineOptions), [lineOptions]);

  async function submit(values: EntryFormValues) {
    const result = await onSubmit(values);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success('Lançamento salvo.');
    onSuccess();
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="entryDate">Data</Label>
          <Controller
            control={control}
            name="entryDate"
            render={({ field }) => (
              <Input
                id="entryDate"
                type="date"
                value={field.value}
                onChange={(e) => field.onChange(e.target.value)}
              />
            )}
          />
          {errors.entryDate && (
            <p className="text-xs text-destructive">{errors.entryDate.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="amount">Valor</Label>
          <Input
            id="amount"
            type="number"
            step="0.01"
            {...register('amount', { valueAsNumber: true })}
          />
          {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="budgetLineId">Rubrica</Label>
        <Controller
          control={control}
          name="budgetLineId"
          render={({ field }) => (
            <Select
              items={lineItems}
              value={field.value ?? NONE_VALUE}
              onValueChange={(v) => field.onChange(v === NONE_VALUE ? null : v)}
            >
              <SelectTrigger id="budgetLineId" className="w-full">
                <SelectValue placeholder="Selecione uma rubrica" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>Sem rubrica</SelectItem>
                {lineOptions.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">Descrição</Label>
        <Controller
          control={control}
          name="description"
          render={({ field }) => (
            <Input
              id="description"
              value={field.value ?? ''}
              onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.value)}
            />
          )}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="vendorName">Fornecedor</Label>
          <Controller
            control={control}
            name="vendorName"
            render={({ field }) => (
              <Input
                id="vendorName"
                value={field.value ?? ''}
                onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.value)}
              />
            )}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="document">Documento</Label>
          <Controller
            control={control}
            name="document"
            render={({ field }) => (
              <Input
                id="document"
                value={field.value ?? ''}
                onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.value)}
              />
            )}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
