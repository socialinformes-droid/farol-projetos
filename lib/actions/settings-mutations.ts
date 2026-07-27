'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ActionResult } from './project-schema';
import {
  settingsFormSchema,
  DEFAULT_SETTINGS,
  type AppSettings,
  type SettingsFormValues,
} from './settings-schema';

/**
 * Lê a linha única de `app_settings`. Essa tabela é criada pela migration
 * `supabase/migrations/0003_app_settings.sql`, que ainda não foi aplicada
 * no banco — precisa ser colada manualmente no SQL Editor do Supabase. Até
 * lá (e em qualquer outra falha de leitura), devolvemos os defaults do
 * código em vez de propagar o erro: a tela de configurações e o formulário
 * de novo projeto precisam continuar funcionando mesmo sem a tabela.
 */
export async function loadSettings(): Promise<AppSettings> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('app_settings')
      .select('default_transfer_limit_pct, default_warning_threshold_pct')
      .eq('id', true)
      .maybeSingle();

    if (error || !data) return DEFAULT_SETTINGS;

    return {
      defaultTransferLimitPct: Number(data.default_transfer_limit_pct),
      defaultWarningThresholdPct: Number(data.default_warning_threshold_pct),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function updateSettings(input: SettingsFormValues): Promise<ActionResult> {
  const parsed = settingsFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('app_settings')
    .update({
      default_transfer_limit_pct: parsed.data.defaultTransferLimitPct.toFixed(2),
      default_warning_threshold_pct: parsed.data.defaultWarningThresholdPct.toFixed(2),
      updated_at: new Date().toISOString(),
    })
    .eq('id', true);

  if (error) {
    return {
      ok: false,
      error:
        'Não foi possível salvar. A tabela de configurações pode ainda não existir — aplique a migration 0003_app_settings.sql no Supabase.',
    };
  }

  revalidatePath('/configuracoes');
  revalidatePath('/projetos/novo');
  return { ok: true, data: undefined };
}
