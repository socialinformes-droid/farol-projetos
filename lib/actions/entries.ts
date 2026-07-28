// Fachada pública consumida pela tela de lançamentos (schema, tipos e as
// quatro Server Actions). Não leva diretiva 'use server' pelo mesmo motivo
// documentado em `./projects.ts` e `./budget-lines.ts`: um arquivo
// 'use server' só pode exportar funções assíncronas, e `entryFormSchema` é
// um valor (objeto Zod). O schema/tipos vivem em `./entry-schema` e a
// implementação das actions (que de fato usa 'use server') vive em
// `./entries-mutations`. Este módulo só reexporta os dois.
export type { EntryFormValues, EntryDetailsValues } from './entry-schema';
export { entryFormSchema, entryDetailsSchema } from './entry-schema';
export {
  createEntry,
  updateEntry,
  updateEntryDetails,
  deleteEntry,
  reclassifyEntry,
} from './entries-mutations';
