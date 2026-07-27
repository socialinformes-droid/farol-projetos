'use client';

import Link from 'next/link';
import { PlusIcon } from 'lucide-react';

import type { ProjectWithSummary } from '@/lib/domain/project-queries';
import { formatBRL } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

const STATUS_LABEL: Record<string, string> = {
  planejamento: 'Planejamento',
  ativo: 'Ativo',
  encerrado: 'Encerrado',
};

export function ProjectsView({ projects }: { projects: ProjectWithSummary[] }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl">Projetos</h1>
        {projects.length > 0 && (
          <Button nativeButton={false} render={<Link href="/projetos/novo" />}>
            <PlusIcon className="size-4" />
            Novo projeto
          </Button>
        )}
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border py-16 text-center">
          <p className="text-sm text-muted-foreground">Nenhum projeto cadastrado ainda.</p>
          <Button nativeButton={false} render={<Link href="/projetos/novo" />}>
            <PlusIcon className="size-4" />
            Novo projeto
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map(({ project, summary }) => {
            const pct = summary.totalBudget > 0 ? (summary.realized / summary.totalBudget) * 100 : 0;
            return (
              <Link key={project.id} href={`/projetos/${project.id}`}>
                <Card className="h-full cursor-pointer transition-shadow hover:shadow-md">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle>{project.name}</CardTitle>
                        <CardDescription>{project.code}</CardDescription>
                      </div>
                      <Badge variant="outline">{STATUS_LABEL[project.status]}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="font-medium">{formatBRL(summary.realized)}</span>
                      <span className="text-muted-foreground">de {formatBRL(summary.totalBudget)}</span>
                    </div>
                    <Progress value={Math.min(100, pct)} />
                    {summary.status !== 'ok' && (
                      <Badge
                        variant={summary.status === 'violacao' ? 'destructive' : undefined}
                        className={
                          summary.status === 'aviso'
                            ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                            : undefined
                        }
                      >
                        {summary.status === 'aviso'
                          ? `Remanejamento em ${Math.round(summary.capUsagePct)}% do teto`
                          : summary.overBudget
                            ? 'Orçamento estourado'
                            : 'Teto de remanejamento excedido'}
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
