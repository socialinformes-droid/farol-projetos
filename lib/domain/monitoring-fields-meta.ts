import type { MonitoringFields } from './monitoring-render';

/**
 * Rótulos e numeração oficial dos cinco campos no formulário do PMO DR/AL —
 * usado pelas telas (novo/detalhe) para exibir cada campo na ordem e com o
 * nome exatos do formulário, para o gestor copiar sem procurar.
 */
export const MONITORING_FIELD_META: {
  key: keyof MonitoringFields;
  number: number;
  label: string;
}[] = [
  { key: 'desempenhoFisico', number: 5, label: 'Desempenho físico' },
  { key: 'resultados', number: 6, label: 'Resultados alcançados' },
  { key: 'desempenhoFinanceiro', number: 7, label: 'Desempenho financeiro' },
  { key: 'riscos', number: 8, label: 'Riscos' },
  { key: 'conclusao', number: 9, label: 'Conclusão e próximos passos' },
];
