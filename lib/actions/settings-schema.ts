import { z } from 'zod';

// Sem diretiva 'use server' — mesmo motivo documentado em
// `./project-schema.ts`: um módulo 'use server' só pode exportar funções
// assíncronas, e o schema Zod aqui é um valor, importado tanto pelo
// formulário (Client Component) quanto pela Server Action.

export const settingsFormSchema = z.object({
  defaultTransferLimitPct: z.number().min(0).max(100),
  defaultWarningThresholdPct: z.number().min(0).max(100),
});

export type SettingsFormValues = z.infer<typeof settingsFormSchema>;

export type AppSettings = {
  defaultTransferLimitPct: number;
  defaultWarningThresholdPct: number;
};

// Usados quando a linha de app_settings ainda não existe — antes da
// migration 0003_app_settings.sql ser aplicada, ou se a tabela existir mas
// estiver vazia por algum motivo. Espelham os defaults de
// `transfer_limit_pct`/`warning_threshold_pct` da tabela `projects`
// (migration 0001).
export const DEFAULT_SETTINGS: AppSettings = {
  defaultTransferLimitPct: 25,
  defaultWarningThresholdPct: 80,
};
