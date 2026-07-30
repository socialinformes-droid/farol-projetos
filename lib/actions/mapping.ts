// Fachada pública consumida pela tela (schema, tipos e as duas Server
// Actions de mapeamento). Mesmo padrão de `budget-lines.ts`: o schema vive em
// `./mapping-schema` (sem 'use server', porque exporta um valor Zod, não só
// funções), a implementação em `./mapping-mutations` ('use server'), e este
// módulo só reexporta os dois.
export type { MappingFormValues } from './mapping-schema';
export { mappingFormSchema } from './mapping-schema';
export { createMapping, deleteMapping } from './mapping-mutations';
