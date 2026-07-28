'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';

import {
  settingsFormSchema,
  updateSettings,
  type AppSettings,
  type SettingsFormValues,
} from '@/lib/actions/settings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { BackLink } from '@/components/layout/back-link';

export function SettingsView({ settings }: { settings: AppSettings }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsFormSchema),
    defaultValues: {
      defaultTransferLimitPct: settings.defaultTransferLimitPct,
      defaultWarningThresholdPct: settings.defaultWarningThresholdPct,
    },
  });

  async function submit(values: SettingsFormValues) {
    const result = await updateSettings(values);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success('Configurações salvas.');
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <BackLink href="/" label="Projetos" />
        <h1 className="font-display text-2xl">Configurações</h1>
      </div>

      <Card className="max-w-xl">
        <CardContent className="flex flex-col gap-5">
          <p className="text-sm text-muted-foreground">
            Valores aplicados a projetos novos. Projetos já criados mantêm os limites definidos
            individualmente.
          </p>

          <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="defaultTransferLimitPct">Limite de remanejamento padrão</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="defaultTransferLimitPct"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  className="max-w-32"
                  {...register('defaultTransferLimitPct', { valueAsNumber: true })}
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Percentual do valor total do projeto que pode ser remanejado entre rubricas
              </p>
              {errors.defaultTransferLimitPct && (
                <p className="text-xs text-destructive">
                  {errors.defaultTransferLimitPct.message}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="defaultWarningThresholdPct">Limiar de aviso padrão</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="defaultWarningThresholdPct"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  className="max-w-32"
                  {...register('defaultWarningThresholdPct', { valueAsNumber: true })}
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Avisar quando este percentual do teto for consumido
              </p>
              {errors.defaultWarningThresholdPct && (
                <p className="text-xs text-destructive">
                  {errors.defaultWarningThresholdPct.message}
                </p>
              )}
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={isSubmitting}>
                Salvar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
