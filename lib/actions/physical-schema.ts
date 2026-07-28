import { z } from 'zod';

// Sem diretiva 'use server' — mesmo motivo documentado em `project-schema.ts`
// e `entry-schema.ts`: um arquivo 'use server' no topo só pode exportar
// funções assíncronas, e os schemas abaixo são valores (objetos Zod), não
// funções. As telas (Client Components) importam os schemas/tipos daqui; as
// Server Actions ficam em `./physical-mutations`.

const isoDateOrNull = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida')
  .nullable();

/**
 * Datas reais de uma atividade. Cobre tanto registrar quanto limpar: um
 * campo enviado como `null` apaga a data real correspondente. O status não
 * entra aqui — é sempre recalculado a partir destas duas datas, nunca
 * definido à mão (ver `deriveStatus` em `physical-mutations.ts`).
 */
export const activityDatesSchema = z.object({
  actualStart: isoDateOrNull,
  actualEnd: isoDateOrNull,
});

export type ActivityDatesValues = z.infer<typeof activityDatesSchema>;

/**
 * Comentário datado numa atividade. Sem contas de usuário: `author` é texto
 * livre, sugerido a partir dos valores de `responsible` já importados do SGF.
 */
export const activityCommentSchema = z.object({
  author: z
    .string()
    .trim()
    .nullish()
    .transform((v) => (v === '' || v === undefined ? null : v)),
  body: z.string().trim().min(1, 'O comentário não pode ficar vazio'),
  happenedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida'),
});

export type ActivityCommentValues = z.infer<typeof activityCommentSchema>;
