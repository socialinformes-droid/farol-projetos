// Fachada pública consumida pelas telas do módulo de monitoramento (schema,
// tipos e Server Actions). Não leva diretiva 'use server' pelo mesmo motivo
// documentado em `./entries.ts` e `./physical.ts`: um arquivo 'use server' só
// pode exportar funções assíncronas, e os schemas abaixo são valores (objetos
// Zod). O schema/tipos vivem em `./monitoring-schema` e a implementação das
// actions (que de fato usa 'use server') vive em `./monitoring-mutations`.
export type { MonitoringPeriodValues, MonitoringFieldsValues } from './monitoring-schema';
export { monitoringPeriodSchema, monitoringFieldsSchema } from './monitoring-schema';
export {
  previewMonitoringSnapshot,
  createMonitoring,
  updateMonitoringFields,
  markMonitoringSubmitted,
  deleteMonitoring,
} from './monitoring-mutations';
