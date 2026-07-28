import { z } from 'zod';

// Sem diretiva 'use server' — mesmo motivo documentado em `monitoring-schema.ts`:
// os valores abaixo são schemas Zod, não funções. As Server Actions ficam em
// `./findings-mutations`.

export const findingKindSchema = z.enum(['atraso', 'sem_justificativa', 'risco', 'beneficio', 'outro']);

/**
 * Só as três resoluções que o gestor pode escolher na tela — 'pendente' não
 * é uma ação, é a ausência de marcação (por isso nunca é gravada por esta
 * action; ver o comentário de `resolveFinding`).
 */
export const findingResolutionActionSchema = z.enum(['justificado', 'replanejado', 'dispensado']);

export const resolveFindingSchema = z.object({
  activityId: z.string().uuid('Atividade inválida'),
  kind: findingKindSchema,
  resolution: findingResolutionActionSchema,
  note: z
    .string()
    .trim()
    .nullish()
    .transform((v) => (v === '' || v === undefined ? null : v)),
  resolvedBy: z
    .string()
    .trim()
    .nullish()
    .transform((v) => (v === '' || v === undefined ? null : v)),
});

export type ResolveFindingValues = z.infer<typeof resolveFindingSchema>;
