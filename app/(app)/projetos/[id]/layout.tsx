import { ProjectChatSheet } from '@/components/project/project-chat-sheet';

/**
 * Envolve toda rota abaixo de `/projetos/[id]` (visão geral, editar,
 * financeiro e sub-telas, físico e sub-telas, monitoramento e sub-telas) só
 * para expor o botão flutuante de dúvidas em todas elas — sem repetir isso
 * em cada página. Não faz nenhuma consulta ao Supabase: `id` vem direto da
 * rota e só é repassado ao componente do chat, que só busca o contexto do
 * projeto no servidor quando uma pergunta é enviada.
 */
export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <>
      {children}
      <ProjectChatSheet projectId={id} />
    </>
  );
}
