import 'server-only';
import { loadProjectSummary, loadRecentLedgerEntries } from './project-queries';
import { loadPhysicalSchedule } from './physical-queries';
import { buildPhysicalDashboard } from './physical-dashboard';
import { buildProjectChatContext, type ProjectChatContext } from './chat-context';
import { toISODate } from '@/lib/format';

/**
 * Monta o `ProjectChatContext` de um projeto a partir do zero — usada só
 * pela rota `/api/chat` (`app/api/chat/route.ts`), nunca por uma página.
 *
 * O chat agora aparece em toda tela do projeto (financeiro, físico,
 * monitoramento, não só na visão geral), então montar o contexto ali
 * obrigaria cada tela a repetir estas mesmas consultas só para um botão que
 * a maioria das visitas nunca aciona. Centralizar aqui mantém as páginas
 * leves: elas nunca importam isto, só a rota importa. `null` quando o
 * projeto não existe.
 */
export async function loadProjectChatContext(projectId: string): Promise<ProjectChatContext | null> {
  const result = await loadProjectSummary(projectId);
  if (!result) return null;

  const [schedule, recentEntries] = await Promise.all([
    loadPhysicalSchedule(projectId),
    loadRecentLedgerEntries(projectId, 8),
  ]);
  const physical = buildPhysicalDashboard(schedule.deliverables, schedule.activities);

  return buildProjectChatContext({
    project: result.project,
    summary: result.summary,
    physical,
    activities: schedule.activities,
    deliverables: schedule.deliverables,
    recentEntries,
    referenceDate: toISODate(new Date()),
  });
}
