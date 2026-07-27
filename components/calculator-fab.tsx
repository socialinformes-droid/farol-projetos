'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Calculator, X, Trash2, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatBRL } from '@/lib/format';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'financeiro_calc_scratchpad';
const PLACEHOLDER = `Cartão Inter: 610 + 50
Mãe: 600 + 200 + 50
Roupas: 110*2 + 80
2350 - 1810`;

export function CalculatorFab() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) setText(saved);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, text);
  }, [text, hydrated]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (open && taRef.current) taRef.current.focus();
  }, [open]);

  const lines = useMemo(() => parseLines(text), [text]);
  const total = lines.reduce((acc, l) => acc + (l.value ?? 0), 0);
  const validLines = lines.filter((l) => l.value !== null);

  const clear = () => {
    if (text.trim() && !confirm('Limpar tudo?')) return;
    setText('');
  };

  const copyTotal = async () => {
    try {
      await navigator.clipboard.writeText(total.toFixed(2));
    } catch {
      // ignore
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? 'Fechar calculadora' : 'Calculadora (cálculos auxiliares)'}
        className={cn(
          'fixed bottom-4 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full',
          'bg-primary text-primary-foreground shadow-lg shadow-black/30 transition-all',
          'hover:scale-105 active:scale-95',
          open && 'rotate-90',
        )}
      >
        {open ? <X className="h-5 w-5" /> : <Calculator className="h-5 w-5" />}
      </button>

      {open && (
        <div className="fixed bottom-20 right-4 z-40 w-[min(380px,calc(100vw-2rem))] rounded-xl border bg-card text-card-foreground shadow-2xl shadow-black/50 flex flex-col max-h-[min(560px,calc(100vh-7rem))]">
          <header className="flex items-center justify-between gap-2 px-4 py-3 border-b">
            <div>
              <h3 className="text-sm font-medium">Calculadora</h3>
              <p className="text-[11px] text-muted-foreground">
                {validLines.length === 0
                  ? 'Uma linha por cálculo · cache local'
                  : `${validLines.length} ${validLines.length === 1 ? 'linha' : 'linhas'} · cache local`}
              </p>
            </div>
            <div className="flex gap-1">
              <Button
                size="icon-sm"
                variant="ghost"
                title="Copiar total"
                onClick={copyTotal}
                disabled={total === 0}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                title="Limpar tudo"
                onClick={clear}
                disabled={!text}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </header>

          <div className="grid grid-cols-2 gap-0 flex-1 overflow-hidden">
            <textarea
              ref={taRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={PLACEHOLDER}
              spellCheck={false}
              className={cn(
                'resize-none bg-transparent p-3 text-sm font-mono leading-6 outline-none',
                'placeholder:text-muted-foreground/40',
                'border-r border-border/60 overflow-y-auto',
              )}
            />
            <div className="overflow-y-auto bg-muted/20 p-3 text-sm font-mono leading-6 tabular-nums">
              {lines.length === 0 || lines.every((l) => !l.raw.trim()) ? (
                <p className="text-muted-foreground/40">→ resultados</p>
              ) : (
                lines.map((l, i) => (
                  <div
                    key={i}
                    className={cn(
                      'whitespace-pre overflow-hidden text-ellipsis',
                      l.value === null && l.raw.trim() && 'text-destructive/70',
                      l.value !== null && (l.value < 0 ? 'text-money-down' : l.value > 0 ? 'text-money-up' : 'text-muted-foreground'),
                    )}
                  >
                    {l.raw.trim() === ''
                      ? ' '
                      : l.value === null
                        ? '× erro'
                        : formatNum(l.value)}
                  </div>
                ))
              )}
            </div>
          </div>

          <footer className="flex items-center justify-between gap-2 px-4 py-3 border-t bg-muted/30">
            <span className="text-xs text-muted-foreground">Total</span>
            <span
              className={cn(
                'font-mono text-base font-semibold tabular-nums',
                total > 0 ? 'text-money-up' : total < 0 ? 'text-money-down' : 'text-foreground',
              )}
            >
              {formatBRL(total)}
            </span>
          </footer>
        </div>
      )}
    </>
  );
}

type ParsedLine = { raw: string; label?: string; expr: string; value: number | null };

function parseLines(text: string): ParsedLine[] {
  return text.split('\n').map((raw) => {
    const trimmed = raw.trim();
    if (!trimmed) return { raw, expr: '', value: null };
    const colonIdx = trimmed.indexOf(':');
    let label: string | undefined;
    let expr = trimmed;
    if (colonIdx > 0 && colonIdx < 40) {
      const before = trimmed.slice(0, colonIdx);
      const after = trimmed.slice(colonIdx + 1).trim();
      if (/[a-zA-ZÀ-ÿ]/.test(before)) {
        label = before;
        expr = after;
      }
    }
    return { raw, label, expr, value: evalExpr(expr) };
  });
}

/**
 * Avaliador recursivo descendente para +, -, *, /, parênteses e números decimais.
 * Não usa eval/Function — seguro para input do usuário.
 */
function evalExpr(input: string): number | null {
  if (!input.trim()) return null;
  const tokens = tokenize(input);
  if (tokens === null || tokens.length === 0) return null;
  let pos = 0;

  const peek = () => tokens[pos];
  const consume = (t: Token) => {
    if (peek() === t) {
      pos++;
      return true;
    }
    return false;
  };

  const parseFactor = (): number | null => {
    const t = peek();
    if (t === '(') {
      pos++;
      const v = parseExpr();
      if (v === null) return null;
      if (!consume(')')) return null;
      return v;
    }
    if (t === '-') {
      pos++;
      const v = parseFactor();
      return v === null ? null : -v;
    }
    if (t === '+') {
      pos++;
      return parseFactor();
    }
    if (typeof t === 'number') {
      pos++;
      return t;
    }
    return null;
  };

  const parseTerm = (): number | null => {
    let left = parseFactor();
    if (left === null) return null;
    while (true) {
      const op = peek();
      if (op !== '*' && op !== '/') break;
      pos++;
      const right = parseFactor();
      if (right === null) return null;
      if (op === '/') {
        if (right === 0) return null;
        left = left / right;
      } else {
        left = left * right;
      }
    }
    return left;
  };

  const parseExpr = (): number | null => {
    let left = parseTerm();
    if (left === null) return null;
    while (true) {
      const op = peek();
      if (op !== '+' && op !== '-') break;
      pos++;
      const right = parseTerm();
      if (right === null) return null;
      left = op === '+' ? left + right : left - right;
    }
    return left;
  };

  const result = parseExpr();
  if (result === null || pos !== tokens.length) return null;
  if (!Number.isFinite(result)) return null;
  return Math.round(result * 100) / 100;
}

type Token = number | '+' | '-' | '*' | '/' | '(' | ')';

function tokenize(s: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  const len = s.length;
  while (i < len) {
    const c = s[i];
    if (c === ' ' || c === '\t') {
      i++;
      continue;
    }
    if (c === '+' || c === '-' || c === '*' || c === '/' || c === '(' || c === ')') {
      tokens.push(c);
      i++;
      continue;
    }
    // Número: dígitos, ponto, vírgula (PT-BR)
    if ((c >= '0' && c <= '9') || c === '.' || c === ',') {
      let j = i;
      let dotCount = 0;
      while (j < len) {
        const cj = s[j];
        if (cj >= '0' && cj <= '9') {
          j++;
        } else if (cj === '.' || cj === ',') {
          dotCount++;
          if (dotCount > 1) return null;
          j++;
        } else break;
      }
      const numStr = s.slice(i, j).replace(',', '.');
      const n = Number(numStr);
      if (!Number.isFinite(n)) return null;
      tokens.push(n);
      i = j;
      continue;
    }
    return null;
  }
  return tokens;
}

function formatNum(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
