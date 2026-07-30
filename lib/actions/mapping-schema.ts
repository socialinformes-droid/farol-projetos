import { z } from 'zod';

// Sem diretiva 'use server' — mesmo motivo de `budget-line-schema.ts`: um
// arquivo com 'use server' no topo só pode exportar funções assíncronas, e
// `mappingFormSchema` é um valor (objeto Zod). Client Components (o
// formulário da página de mapeamento) importam o schema daqui; as Server
// Actions ficam em `./mapping-mutations`.

export const mappingFormSchema = z.object({
  accountCode: z.string().trim().min(1, 'Informe o código da conta'),
  accountName: z.string().trim().nullable(),
  budgetLineId: z.string().uuid('Selecione uma rubrica'),
});

export type MappingFormValues = z.infer<typeof mappingFormSchema>;
