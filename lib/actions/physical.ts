// Fachada pública consumida pelas telas do módulo físico (schema, tipos e as
// Server Actions). Não leva diretiva 'use server' pelo mesmo motivo
// documentado em `./entries.ts`: um arquivo 'use server' só pode exportar
// funções assíncronas, e os schemas são valores (objetos Zod). O
// schema/tipos vivem em `./physical-schema` e a implementação das actions
// (que de fato usa 'use server') vive em `./physical-mutations`. Este módulo
// só reexporta os dois.
export type { ActivityDatesValues, ActivityCommentValues } from './physical-schema';
export { activityDatesSchema, activityCommentSchema } from './physical-schema';
export { updateActivityDates, addActivityComment, deleteActivityComment } from './physical-mutations';
