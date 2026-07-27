// Fachada pública consumida pela tela de configurações e pelo formulário de
// novo projeto (schema, tipos e as duas Server Actions). Não leva diretiva
// 'use server' pelo mesmo motivo documentado em `./projects.ts`: um arquivo
// 'use server' só pode exportar funções assíncronas, e `settingsFormSchema`
// é um valor (objeto Zod). O schema/tipos vivem em `./settings-schema` e a
// implementação das actions (que de fato usa 'use server') vive em
// `./settings-mutations`. Este módulo só reexporta os dois.
export type { AppSettings, SettingsFormValues } from './settings-schema';
export { settingsFormSchema, DEFAULT_SETTINGS } from './settings-schema';
export { loadSettings, updateSettings } from './settings-mutations';
