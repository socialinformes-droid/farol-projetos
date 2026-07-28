import Link from 'next/link';
import { cn } from '@/lib/utils';

type Dimension = 'financeiro' | 'fisico';

const LABELS: Record<Dimension, string> = {
  financeiro: 'Financeiro',
  fisico: 'Físico',
};

const DIMENSIONS: Dimension[] = ['financeiro', 'fisico'];

/**
 * Alternador discreto entre as duas dimensões do projeto — financeira e
 * física —, presente em toda tela de dentro de um projeto que pertença a uma
 * delas. Garante que trocar de dimensão nunca custe mais de um clique,
 * qualquer que seja a tela em que o usuário esteja dentro dela.
 *
 * Segue a mesma contenção visual do BackLink: texto pequeno, sem ícone extra,
 * sem virar elemento de destaque da página.
 */
export function DimensionTabs({
  projectId,
  active,
}: {
  projectId: string;
  active: Dimension;
}) {
  return (
    <nav
      aria-label="Dimensão do projeto"
      className="inline-flex w-fit items-center gap-0.5 rounded-lg bg-muted p-0.5"
    >
      {DIMENSIONS.map((dim) => {
        const isActive = dim === active;
        return (
          <Link
            key={dim}
            href={`/projetos/${projectId}/${dim}`}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'rounded-md px-3 py-1 text-sm transition-colors',
              isActive
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {LABELS[dim]}
          </Link>
        );
      })}
    </nav>
  );
}
