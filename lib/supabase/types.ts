export type ProjectStatus = 'planejamento' | 'ativo' | 'encerrado';
export type EntryKind = 'despesa' | 'aporte' | 'manual' | 'ignorado';
export type FundingModel = 'adiantamento' | 'reembolso' | 'interno';
export type BudgetControl = 'por_rubrica' | 'global';
export type EntrySource = 'import' | 'manual';
export type ProjectEntity = 'SESI' | 'SENAI';

export type EntryUrls = {
  requisicao?: string | null;
  recebimento?: string | null;
  nota_fiscal?: string | null;
  comprovante?: string | null;
};

export type ProjectRow = {
  id: string;
  code: string;
  name: string;
  total_budget: string;
  start_date: string | null;
  end_date: string | null;
  status: ProjectStatus;
  transfer_limit_pct: string;
  warning_threshold_pct: string;
  funding_model: FundingModel;
  budget_control: BudgetControl;
  notes: string | null;
  /**
   * Identificação para o monitoramento do PMO DR/AL (migração 0007) — todas
   * opcionais, pois projetos já cadastrados não as têm.
   */
  sgf_number: string | null;
  entity: ProjectEntity | null;
  manager_name: string | null;
  created_at: string;
  updated_at: string;
};

export type BudgetLineRow = {
  id: string;
  project_id: string;
  parent_id: string | null;
  code: string | null;
  name: string;
  budgeted_amount: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type LedgerEntryRow = {
  id: string;
  project_id: string;
  budget_line_id: string | null;
  entry_date: string;
  amount: string;
  kind: EntryKind;
  description: string | null;
  account_code: string | null;
  account_name: string | null;
  cost_center_code: string | null;
  voucher: string | null;
  journal: string | null;
  document: string | null;
  reference: string | null;
  vendor_doc: string | null;
  vendor_name: string | null;
  payment_date: string | null;
  document_date: string | null;
  urls: EntryUrls;
  notes: string | null;
  source: EntrySource;
  import_key: string | null;
  import_batch_id: string | null;
  raw: Record<string, string> | null;
  created_at: string;
  updated_at: string;
};

export type ImportBatchRow = {
  id: string;
  project_id: string;
  filename: string;
  imported_at: string;
  rows_read: number;
  rows_inserted: number;
  rows_duplicate: number;
  rows_unmapped: number;
};

export type AppSettingsRow = {
  id: boolean;
  default_transfer_limit_pct: string;
  default_warning_threshold_pct: string;
  updated_at: string;
};

export type PhysicalActivityStatus = 'nao_iniciado' | 'em_andamento' | 'concluido';

export type DeliverableRow = {
  id: string;
  project_id: string;
  name: string;
  sort_order: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ActivityRow = {
  id: string;
  project_id: string;
  deliverable_id: string;
  name: string;
  responsible: string | null;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  sgf_actual_start: string | null;
  sgf_actual_end: string | null;
  sgf_status: string | null;
  sgf_updated_at: string | null;
  status: PhysicalActivityStatus;
  sort_order: number;
  import_key: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ActivityCommentRow = {
  id: string;
  activity_id: string;
  author: string | null;
  body: string;
  happened_on: string;
  created_at: string;
};

/**
 * Monitoramento periódico do PMO DR/AL (migração 0009). `snapshot` guarda o
 * insumo bruto que gerou os campos — deliberadamente tipado como blob JSON
 * cru aqui (não como `MonitoringSnapshot` de `lib/domain/monitoring-snapshot`)
 * para não criar dependência circular entre este arquivo e o domínio; quem
 * consome o snapshot tipado faz o parse na camada de actions/queries.
 */
export type MonitoringRow = {
  id: string;
  project_id: string;
  period_start: string;
  period_end: string;
  reference_label: string | null;
  desempenho_fisico: string | null;
  resultados: string | null;
  desempenho_financeiro: string | null;
  riscos: string | null;
  conclusao: string | null;
  snapshot: Record<string, unknown> | null;
  generated_at: string | null;
  generated_model: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectInsert = Omit<ProjectRow, 'id' | 'created_at' | 'updated_at'>;
export type BudgetLineInsert = Omit<BudgetLineRow, 'id' | 'created_at' | 'updated_at'>;
export type LedgerEntryInsert = Omit<LedgerEntryRow, 'id' | 'created_at' | 'updated_at'>;
export type DeliverableInsert = Omit<DeliverableRow, 'id' | 'created_at' | 'updated_at'>;
export type ActivityInsert = Omit<ActivityRow, 'id' | 'created_at' | 'updated_at'>;
export type ActivityCommentInsert = Omit<ActivityCommentRow, 'id' | 'created_at'>;
export type MonitoringInsert = Omit<MonitoringRow, 'id' | 'created_at' | 'updated_at'>;

// `updated_at` não tem trigger no banco — a aplicação é quem o define a cada
// update, por isso os tipos de Update (diferente dos de Insert) o incluem.
export type ProjectUpdate = Partial<Omit<ProjectRow, 'id' | 'created_at'>>;
export type BudgetLineUpdate = Partial<Omit<BudgetLineRow, 'id' | 'created_at'>>;
export type LedgerEntryUpdate = Partial<Omit<LedgerEntryRow, 'id' | 'created_at'>>;
export type AppSettingsUpdate = Partial<Omit<AppSettingsRow, 'id'>>;
export type DeliverableUpdate = Partial<Omit<DeliverableRow, 'id' | 'created_at'>>;
export type ActivityUpdate = Partial<Omit<ActivityRow, 'id' | 'created_at'>>;
export type MonitoringUpdate = Partial<Omit<MonitoringRow, 'id' | 'created_at'>>;

export type Database = {
  public: {
    Tables: {
      projects:       { Row: ProjectRow;      Insert: ProjectInsert;      Update: ProjectUpdate;     Relationships: [] };
      budget_lines:   { Row: BudgetLineRow;   Insert: BudgetLineInsert;   Update: BudgetLineUpdate;  Relationships: [] };
      ledger_entries: { Row: LedgerEntryRow;  Insert: LedgerEntryInsert;  Update: LedgerEntryUpdate; Relationships: [] };
      import_batches: { Row: ImportBatchRow;  Insert: Omit<ImportBatchRow, 'id' | 'imported_at'>; Update: Partial<ImportBatchRow>; Relationships: [] };
      app_settings:   { Row: AppSettingsRow;  Insert: AppSettingsRow;    Update: AppSettingsUpdate; Relationships: [] };
      deliverables:      { Row: DeliverableRow;      Insert: DeliverableInsert;      Update: DeliverableUpdate;      Relationships: [] };
      activities:        { Row: ActivityRow;         Insert: ActivityInsert;         Update: ActivityUpdate;         Relationships: [] };
      activity_comments: { Row: ActivityCommentRow;  Insert: ActivityCommentInsert;  Update: Partial<ActivityCommentRow>; Relationships: [] };
      monitorings:       { Row: MonitoringRow;       Insert: MonitoringInsert;       Update: MonitoringUpdate;       Relationships: [] };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
