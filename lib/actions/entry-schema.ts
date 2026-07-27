import { z } from 'zod';

// Sem diretiva 'use server' — mesmo motivo documentado em `project-schema.ts`
// e `budget-line-schema.ts`: um arquivo 'use server' no topo só pode exportar
// funções assíncronas, e `entryFormSchema` é um valor (objeto Zod), não uma
// função. O formulário (Client Component) importa o schema daqui; as Server
// Actions ficam em `./entries-mutations`.

export const entryFormSchema = z.object({
  budgetLineId: z.string().uuid().nullable(),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida'),
  amount: z.number(),
  description: z.string().trim().nullable(),
  vendorName: z.string().trim().nullable(),
  document: z.string().trim().nullable(),
});

export type EntryFormValues = z.infer<typeof entryFormSchema>;
