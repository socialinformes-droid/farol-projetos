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

/**
 * Campo de URL opcional. Vazio vira null; qualquer outra coisa precisa ser uma
 * URL http(s) válida — colar um texto solto silenciosamente produziria um link
 * quebrado na tabela.
 */
const optionalUrl = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v === '' || v === undefined ? null : v))
  .refine(
    (v) => {
      if (v === null) return true;
      try {
        const { protocol } = new URL(v);
        return protocol === 'http:' || protocol === 'https:';
      } catch {
        return false;
      }
    },
    { message: 'Informe uma URL começando com http:// ou https://' },
  );

/**
 * Campos editáveis mesmo em lançamento importado do razão.
 *
 * Nenhum deles compõe a identidade contábil do lançamento, e nenhum entra no
 * cálculo de `import_key` — que, de todo modo, é gravado uma única vez no
 * commit do import e nunca recalculado. Editar aqui não faz o próximo import
 * reinserir a linha, e como o import ignora linhas já existentes em vez de
 * sobrescrevê-las, o que se edita aqui sobrevive aos reimports.
 */
export const entryDetailsSchema = z.object({
  notaFiscalUrl: optionalUrl,
  comprovanteUrl: optionalUrl,
  notes: z
    .string()
    .trim()
    .nullish()
    .transform((v) => (v === '' || v === undefined ? null : v)),
});

export type EntryDetailsValues = z.infer<typeof entryDetailsSchema>;
