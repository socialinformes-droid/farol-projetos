const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export function formatBRL(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return 'R$ 0,00';
  const n = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(n)) return 'R$ 0,00';
  return brl.format(n);
}

export function formatBRLSigned(value: number): string {
  const sign = value >= 0 ? '+' : '−';
  return `${sign} ${brl.format(Math.abs(value))}`;
}

const MONTH_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function formatDateBR(input: string | Date | null | undefined): string {
  if (!input) return '';
  if (typeof input === 'string') {
    // Strings ISO 'YYYY-MM-DD[...]' tratamos como data calendário pura (sem fuso).
    const m = input.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  }
  const d = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

export function formatMonthBR(input: string | Date | null | undefined): string {
  if (!input) return '';
  if (typeof input === 'string') {
    const m = input.match(/^(\d{4})-(\d{2})/);
    if (m) {
      const monthIdx = Number(m[2]) - 1;
      const yy = m[1].slice(2);
      return `${MONTH_SHORT[monthIdx]}/${yy}`;
    }
  }
  const d = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return '';
  return `${MONTH_SHORT[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`;
}

export function toMonthDate(year: number, monthZeroBased: number): string {
  const yyyy = String(year).padStart(4, '0');
  const mm = String(monthZeroBased + 1).padStart(2, '0');
  return `${yyyy}-${mm}-01`;
}

export function firstDayOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function addMonths(d: Date, months: number): Date {
  // Constrói via componentes locais para evitar drift de timezone.
  // Clamp do dia ao último dia do mês destino: 31/jan + 1 mês = 28/fev (não 03/mar).
  const targetYear = d.getFullYear();
  const targetMonth = d.getMonth() + months;
  // último dia do mês destino: dia 0 do mês seguinte
  const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
  const day = Math.min(d.getDate(), lastDay);
  return new Date(targetYear, targetMonth, day);
}

/**
 * Soma meses a uma data ISO (YYYY-MM-DD) usando aritmética de inteiros.
 * Imune a fuso horário — sempre retorna uma string ISO no mesmo dia do mês.
 */
export function addMonthsToISO(iso: string, months: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const totalMonths = (y * 12) + (m - 1) + months;
  const year = Math.floor(totalMonths / 12);
  const month = (totalMonths % 12) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function toISODate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
