export type ProjectStatus = 'planejamento' | 'ativo' | 'encerrado';
export type EntryKind = 'despesa' | 'baixa' | 'manual';
export type EntrySource = 'import' | 'manual';

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
  notes: string | null;
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

export type ProjectInsert = Omit<ProjectRow, 'id' | 'created_at' | 'updated_at'>;
export type BudgetLineInsert = Omit<BudgetLineRow, 'id' | 'created_at' | 'updated_at'>;
export type LedgerEntryInsert = Omit<LedgerEntryRow, 'id' | 'created_at' | 'updated_at'>;

// `updated_at` não tem trigger no banco — a aplicação é quem o define a cada
// update, por isso os tipos de Update (diferente dos de Insert) o incluem.
export type ProjectUpdate = Partial<Omit<ProjectRow, 'id' | 'created_at'>>;
export type BudgetLineUpdate = Partial<Omit<BudgetLineRow, 'id' | 'created_at'>>;
export type LedgerEntryUpdate = Partial<Omit<LedgerEntryRow, 'id' | 'created_at'>>;
export type AppSettingsUpdate = Partial<Omit<AppSettingsRow, 'id'>>;

export type Database = {
  public: {
    Tables: {
      projects:       { Row: ProjectRow;      Insert: ProjectInsert;      Update: ProjectUpdate;     Relationships: [] };
      budget_lines:   { Row: BudgetLineRow;   Insert: BudgetLineInsert;   Update: BudgetLineUpdate;  Relationships: [] };
      ledger_entries: { Row: LedgerEntryRow;  Insert: LedgerEntryInsert;  Update: LedgerEntryUpdate; Relationships: [] };
      import_batches: { Row: ImportBatchRow;  Insert: Omit<ImportBatchRow, 'id' | 'imported_at'>; Update: Partial<ImportBatchRow>; Relationships: [] };
      app_settings:   { Row: AppSettingsRow;  Insert: AppSettingsRow;    Update: AppSettingsUpdate; Relationships: [] };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
