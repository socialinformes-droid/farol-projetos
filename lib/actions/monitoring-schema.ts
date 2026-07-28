import { z } from 'zod';

// Sem diretiva 'use server' — mesmo motivo documentado em `entry-schema.ts` e
// `physical-schema.ts`: os schemas abaixo são valores (objetos Zod), não
// funções. As telas (Client Components) importam os schemas/tipos daqui; as
// Server Actions ficam em `./monitoring-mutations`.

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida');

/**
 * Período coberto pelo monitoramento. O formulário do PMO pede o mês de
 * referência, mas o período em si é livre — há projetos com acompanhamento
 * quinzenal —, por isso início e fim são escolhidos livremente, e
 * `referenceLabel` guarda como o gestor quer chamar esse período (ex.:
 * "Julho/2026" ou "1ª quinzena de julho/2026").
 */
export const monitoringPeriodSchema = z
  .object({
    periodStart: isoDate,
    periodEnd: isoDate,
    referenceLabel: z
      .string()
      .trim()
      .nullish()
      .transform((v) => (v === '' || v === undefined ? null : v)),
  })
  .refine((v) => v.periodStart <= v.periodEnd, {
    message: 'A data inicial não pode ser depois da data final.',
    path: ['periodEnd'],
  });

export type MonitoringPeriodValues = z.infer<typeof monitoringPeriodSchema>;

/** Os cinco campos do formulário — todos livres, todos opcionais (o gestor pode limpar um campo). */
export const monitoringFieldsSchema = z.object({
  desempenhoFisico: z.string().nullable(),
  resultados: z.string().nullable(),
  desempenhoFinanceiro: z.string().nullable(),
  riscos: z.string().nullable(),
  conclusao: z.string().nullable(),
});

export type MonitoringFieldsValues = z.infer<typeof monitoringFieldsSchema>;
