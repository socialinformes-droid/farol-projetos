// Este arquivo é a fachada pública consumida pelas outras tasks (schema,
// tipos e as três Server Actions). Não leva diretiva 'use server': um arquivo
// com 'use server' no topo só pode exportar funções assíncronas, e
// `projectFormSchema` é um valor (objeto Zod), não uma função — por isso o
// schema/tipos vivem em `./project-schema` e a implementação das actions (que
// de fato usa 'use server') vive em `./projects-mutations`. Este módulo só
// reexporta os dois.
export type { ActionResult, ProjectFormValues } from './project-schema';
export { projectFormSchema } from './project-schema';
export { createProject, updateProject, deleteProject } from './projects-mutations';
