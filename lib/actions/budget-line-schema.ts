import { z } from 'zod';

// Sem diretiva 'use server' — mesmo motivo de `project-schema.ts`: um arquivo
// com 'use server' no topo só pode exportar funções assíncronas, e
// `budgetLineFormSchema` é um valor (objeto Zod), não uma função. Client
// Components (o formulário/dialog de rubrica) importam o schema daqui; as
// Server Actions ficam em `./budget-lines-mutations`.

export const budgetLineFormSchema = z.object({
  code: z.string().trim().nullable(),
  name: z.string().trim().min(1, 'Informe o nome da rubrica'),
  budgetedAmount: z.number().nonnegative().nullable(),
  parentId: z.string().uuid().nullable(),
  sortOrder: z.number().int().default(0),
});

export type BudgetLineFormValues = z.infer<typeof budgetLineFormSchema>;
