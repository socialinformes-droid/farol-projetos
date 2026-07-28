'use client';

import { useRouter } from 'next/navigation';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';

import type { ActionResult, ProjectFormValues } from '@/lib/actions/projects';
import { projectFormSchema } from '@/lib/actions/projects';
import { formatBRL } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type ProjectFormProps = {
  defaultValues?: Partial<ProjectFormValues> & { id?: string };
  // Padrões vindos de `loadSettings()` (Configurações), usados só quando
  // `defaultValues` não traz `transferLimitPct`/`warningThresholdPct` — ou
  // seja, na criação de um projeto novo. Na edição, `defaultValues` sempre
  // traz os dois (vêm do projeto salvo), então `defaults` é ignorado.
  defaults?: { transferLimitPct: number; warningThresholdPct: number };
  onSubmit: (values: ProjectFormValues) => Promise<ActionResult<{ id: string }> | ActionResult>;
  submitLabel: string;
};

const FUNDING_OPTIONS = [
  {
    value: 'interno',
    label: 'Interno — sai do orçamento próprio',
    hint: 'Sem aporte externo. O dashboard não mostra posição de caixa.',
  },
  {
    value: 'adiantamento',
    label: 'Adiantamento — recebe antes de gastar',
    hint: 'O recurso entra no caixa e você gasta contra ele.',
  },
  {
    value: 'reembolso',
    label: 'Reembolso — recebe mediante prestação de contas',
    hint: 'Você gasta primeiro e o valor volta depois da PC.',
  },
] as const;

const CONTROL_OPTIONS = [
  {
    value: 'por_rubrica',
    label: 'Por rubrica — cada rubrica tem limite',
    hint: 'Vale o teto de remanejamento entre rubricas.',
  },
  {
    value: 'global',
    label: 'Global — o limite é o total do projeto',
    hint: 'As rubricas só classificam o gasto, sem teto individual.',
  },
] as const;

const STATUS_OPTIONS: { value: ProjectFormValues['status']; label: string }[] = [
  { value: 'planejamento', label: 'Planejamento' },
  { value: 'ativo', label: 'Ativo' },
  { value: 'encerrado', label: 'Encerrado' },
];

// Sentinela usada no Select de entidade: assim como o Select de grupo em
// rubricas, o Base UI Select trabalha com valores string não-vazios, então
// "não informado" precisa de um valor próprio convertido para `null` na
// leitura/escrita do form.
const ENTITY_NONE = '__none__';
const ENTITY_OPTIONS: { value: 'SESI' | 'SENAI'; label: string }[] = [
  { value: 'SESI', label: 'SESI' },
  { value: 'SENAI', label: 'SENAI' },
];
const ENTITY_ITEMS: Record<string, string> = {
  [ENTITY_NONE]: 'Não informado',
  SESI: 'SESI',
  SENAI: 'SENAI',
};

export function ProjectForm({
  defaultValues,
  defaults,
  onSubmit,
  submitLabel,
}: ProjectFormProps) {
  const router = useRouter();

  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: {
      code: defaultValues?.code ?? '',
      name: defaultValues?.name ?? '',
      totalBudget: defaultValues?.totalBudget ?? 0,
      startDate: defaultValues?.startDate ?? null,
      endDate: defaultValues?.endDate ?? null,
      status: defaultValues?.status ?? 'ativo',
      fundingModel: defaultValues?.fundingModel ?? 'interno',
      budgetControl: defaultValues?.budgetControl ?? 'por_rubrica',
      transferLimitPct: defaultValues?.transferLimitPct ?? defaults?.transferLimitPct ?? 25,
      warningThresholdPct:
        defaultValues?.warningThresholdPct ?? defaults?.warningThresholdPct ?? 80,
      notes: defaultValues?.notes ?? null,
      sgfNumber: defaultValues?.sgfNumber ?? null,
      entity: defaultValues?.entity ?? null,
      managerName: defaultValues?.managerName ?? null,
    },
  });

  const totalBudget = useWatch({ control, name: 'totalBudget' });

  async function submit(values: ProjectFormValues) {
    const result = await onSubmit(values);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success('Projeto salvo.');
    router.push('/');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="flex max-w-xl flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="code">Código do centro de custo</Label>
        <Input id="code" placeholder="ex: 30413070101" {...register('code')} />
        <p className="text-xs text-muted-foreground">
          O código do Centro no razão — ex: 30413070101
        </p>
        {errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Nome do projeto</Label>
        <Input id="name" {...register('name')} />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sgfNumber">Nº do projeto no SGF</Label>
        <Controller
          control={control}
          name="sgfNumber"
          render={({ field }) => (
            <Input
              id="sgfNumber"
              placeholder="ex: 340252"
              value={field.value ?? ''}
              onChange={(e) => field.onChange(e.target.value || null)}
            />
          )}
        />
        <p className="text-xs text-muted-foreground">
          Identifica o projeto no SGF e no cronograma físico. Ex.: 340252
        </p>
        {errors.sgfNumber && (
          <p className="text-xs text-destructive">{errors.sgfNumber.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="entity">Entidade</Label>
        <Controller
          control={control}
          name="entity"
          render={({ field }) => (
            <Select
              items={ENTITY_ITEMS}
              value={field.value ?? ENTITY_NONE}
              onValueChange={(v) => field.onChange(v === ENTITY_NONE ? null : v)}
            >
              <SelectTrigger id="entity" className="w-full">
                <SelectValue placeholder="Selecione a entidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ENTITY_NONE}>Não informado</SelectItem>
                {ENTITY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="managerName">Gestor do projeto</Label>
        <Controller
          control={control}
          name="managerName"
          render={({ field }) => (
            <Input
              id="managerName"
              value={field.value ?? ''}
              onChange={(e) => field.onChange(e.target.value || null)}
            />
          )}
        />
        {errors.managerName && (
          <p className="text-xs text-destructive">{errors.managerName.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="totalBudget">Valor total do projeto</Label>
        <Input
          id="totalBudget"
          type="number"
          step="0.01"
          min="0"
          {...register('totalBudget', { valueAsNumber: true })}
        />
        <p className="text-xs text-muted-foreground">{formatBRL(totalBudget || 0)}</p>
        {errors.totalBudget && (
          <p className="text-xs text-destructive">{errors.totalBudget.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="status">Status</Label>
        <Controller
          control={control}
          name="status"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="status" className="w-full">
                <SelectValue placeholder="Selecione o status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="budgetControl">Controle do orçamento</Label>
        <Controller
          control={control}
          name="budgetControl"
          render={({ field }) => (
            <>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="budgetControl" className="w-full">
                  <SelectValue placeholder="Selecione o controle" />
                </SelectTrigger>
                <SelectContent>
                  {CONTROL_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {CONTROL_OPTIONS.find((o) => o.value === field.value)?.hint}
              </p>
            </>
          )}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="fundingModel">Modalidade de financiamento</Label>
        <Controller
          control={control}
          name="fundingModel"
          render={({ field }) => (
            <>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="fundingModel" className="w-full">
                  <SelectValue placeholder="Selecione a modalidade" />
                </SelectTrigger>
                <SelectContent>
                  {FUNDING_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {FUNDING_OPTIONS.find((o) => o.value === field.value)?.hint}
              </p>
            </>
          )}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="startDate">Início</Label>
          <Controller
            control={control}
            name="startDate"
            render={({ field }) => (
              <Input
                id="startDate"
                type="date"
                value={field.value ?? ''}
                onChange={(e) => field.onChange(e.target.value || null)}
              />
            )}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="endDate">Término</Label>
          <Controller
            control={control}
            name="endDate"
            render={({ field }) => (
              <Input
                id="endDate"
                type="date"
                value={field.value ?? ''}
                onChange={(e) => field.onChange(e.target.value || null)}
              />
            )}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="transferLimitPct">Limite de remanejamento</Label>
        <div className="flex items-center gap-2">
          <Input
            id="transferLimitPct"
            type="number"
            step="0.01"
            min="0"
            max="100"
            className="max-w-32"
            {...register('transferLimitPct', { valueAsNumber: true })}
          />
          <span className="text-sm text-muted-foreground">%</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Percentual do valor total do projeto que pode ser remanejado entre rubricas
        </p>
        {errors.transferLimitPct && (
          <p className="text-xs text-destructive">{errors.transferLimitPct.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="warningThresholdPct">Limiar de aviso</Label>
        <div className="flex items-center gap-2">
          <Input
            id="warningThresholdPct"
            type="number"
            step="0.01"
            min="0"
            max="100"
            className="max-w-32"
            {...register('warningThresholdPct', { valueAsNumber: true })}
          />
          <span className="text-sm text-muted-foreground">%</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Avisar quando este percentual do teto for consumido
        </p>
        {errors.warningThresholdPct && (
          <p className="text-xs text-destructive">{errors.warningThresholdPct.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notes">Observações</Label>
        <Controller
          control={control}
          name="notes"
          render={({ field }) => (
            <Textarea
              id="notes"
              value={field.value ?? ''}
              onChange={(e) => field.onChange(e.target.value || null)}
            />
          )}
        />
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
