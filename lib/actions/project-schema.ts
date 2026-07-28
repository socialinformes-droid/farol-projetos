import { z } from 'zod';

// Sem diretiva 'use server' — este módulo só declara tipos e o schema Zod, e
// é importado tanto por Client Components (o formulário) quanto pelas Server
// Actions. Um arquivo com 'use server' no topo só pode exportar funções
// assíncronas; por isso o schema e os tipos vivem aqui, fora dele.

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export const projectFormSchema = z.object({
  code: z.string().trim().min(1, 'Informe o código do centro de custo'),
  name: z.string().trim().min(1, 'Informe o nome do projeto'),
  totalBudget: z.number().nonnegative('O valor total não pode ser negativo'),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  status: z.enum(['planejamento', 'ativo', 'encerrado']),
  transferLimitPct: z.number().min(0).max(100),
  warningThresholdPct: z.number().min(0).max(100),
  notes: z.string().nullable(),
  /**
   * Como o recurso entra no projeto. Define se o dashboard mostra bloco de
   * caixa e com que leitura — saldo disponível, valor a ressarcir, ou nenhum
   * dos dois em projeto interno.
   */
  fundingModel: z.enum(['adiantamento', 'reembolso', 'interno']),
  /**
   * Controle por rubrica aplica o teto de remanejamento; global trata as
   * rubricas como mera classificação, com o total do projeto como único limite.
   */
  budgetControl: z.enum(['por_rubrica', 'global']),
  /**
   * Identificação para o monitoramento do PMO DR/AL (migração 0007). Todas
   * opcionais — projetos já cadastrados seguem válidos sem elas.
   */
  sgfNumber: z.string().trim().nullable(),
  entity: z.enum(['SESI', 'SENAI']).nullable(),
  managerName: z.string().trim().nullable(),
});

export type ProjectFormValues = z.infer<typeof projectFormSchema>;
