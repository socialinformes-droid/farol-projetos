import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { FisicoView } from './_view';

export const dynamic = 'force-dynamic';

// O módulo físico ainda não existe — nenhuma tabela de cronograma físico é
// lida aqui. A única consulta é ao projeto em si (nome, código, status),
// necessária para o cabeçalho e para o BackLink nomear o projeto, como toda
// outra tela dentro dele já faz.
export default async function FisicoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createAdminClient();
  const { data: project } = await supabase.from('projects').select('*').eq('id', id).maybeSingle();

  if (!project) notFound();

  return <FisicoView project={project} />;
}
