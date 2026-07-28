import type { ProjectRow } from '@/lib/supabase/types';
import { Badge } from '@/components/ui/badge';
import { BackLink } from '@/components/layout/back-link';
import { DimensionTabs } from '@/components/layout/dimension-tabs';

const STATUS_LABEL: Record<string, string> = {
  planejamento: 'Planejamento',
  ativo: 'Ativo',
  encerrado: 'Encerrado',
};

/**
 * Esqueleto do módulo físico — só o estado vazio. Não há cronograma, entrega
 * ou atividade para mostrar ainda: o import do .xls do SGF não foi construído.
 */
export function FisicoView({ project }: { project: ProjectRow }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <BackLink href={`/projetos/${project.id}`} label={project.name} />
        <DimensionTabs projectId={project.id} active="fisico" />
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl">Físico</h1>
            <Badge variant="outline">{STATUS_LABEL[project.status]}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {project.code} — {project.name}
          </p>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
        <p className="text-sm font-medium">Cronograma físico ainda não importado</p>
        <p className="max-w-md text-sm text-muted-foreground">
          O cronograma físico (entregas e atividades) vem da exportação .xls do SGF. A importação
          ainda não foi construída — por enquanto, esta tela é só um espaço reservado.
        </p>
      </div>
    </div>
  );
}
