-- Farol de Projetos — configurações globais (2026-07-27)
--
-- Guarda os valores padrão de limite de remanejamento e limiar de aviso
-- aplicados a projetos novos. A chave primária booleana com `check (id)`
-- garante linha única — só o valor `true` é aceito, então nunca existe mais
-- de uma linha de configuração para dar conflito de qual usar.

create table app_settings (
  id boolean primary key default true check (id),
  default_transfer_limit_pct numeric(5,2) not null default 25
    check (default_transfer_limit_pct >= 0 and default_transfer_limit_pct <= 100),
  default_warning_threshold_pct numeric(5,2) not null default 80
    check (default_warning_threshold_pct >= 0 and default_warning_threshold_pct <= 100),
  updated_at timestamptz not null default now()
);

alter table app_settings enable row level security;

insert into app_settings (id) values (true) on conflict do nothing;

notify pgrst, 'reload schema';
