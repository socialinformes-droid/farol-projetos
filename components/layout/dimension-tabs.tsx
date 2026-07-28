import Link from 'next/link';
import { cn } from '@/lib/utils';

type Dimension = 'financeiro' | 'fisico' | 'monitoramento';

const LABELS: Record<Dimension, string> = {
  financeiro: 'Financeiro',
  fisico: 'Físico',
  monitoramento: 'Monitoramento',
};

const DIMENSIONS: Dimension[] = ['financeiro', 'fisico', 'monitoramento'];

/**
 * Alternador discreto entre as seções do projeto, presente em toda tela de
 * dentro de um projeto que pertença a uma delas. Garante que trocar de seção
 * nunca custe mais de um clique, qualquer que seja a tela em que o usuário
 * esteja.
 *
 * "Monitoramento" não é bem uma terceira dimensão como financeiro/físico —
 * ele lê as duas para montar o registro do período — mas mora aqui mesmo
 * assim: o usuário já aprendeu que é este alternador que muda de seção
 * dentro do projeto, e ele precisa estar acessível a partir de qualquer uma
 * das outras duas (é para lá que se vai depois de mexer no financeiro ou no
 * físico). Uma entrada nova em outro lugar da tela seria mais uma coisa para
 * lembrar, não menos.
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
