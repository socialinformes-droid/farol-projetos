import { NextResponse } from 'next/server';
import { loadProjectChatContext } from '@/lib/domain/chat-context-loader';
import { buildChatMessages } from '@/lib/domain/chat-prompt';
import { generateText, AiGenerationError, type ChatMessage } from '@/lib/ai/deepseek';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * Chat lateral de dúvidas sobre um projeto — efêmero: a única coisa que esta
 * rota grava é nada. Recebe só `projectId` e o histórico da conversa; monta
 * o contexto do projeto aqui mesmo (`lib/domain/chat-context-loader.ts`), a
 * partir do Supabase, a cada pergunta. O chat aparece em toda tela do
 * projeto agora, então o contexto não pode chegar pronto de cada página —
 * ele nasce aqui, sob demanda, e nunca é reaproveitado entre requisições.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const projectId = body?.projectId;
  const historyRaw = body?.messages;

  if (typeof projectId !== 'string' || projectId.trim() === '') {
    return NextResponse.json({ error: 'Projeto não informado.' }, { status: 400 });
  }
  if (!Array.isArray(historyRaw)) {
    return NextResponse.json({ error: 'Histórico de mensagens inválido.' }, { status: 400 });
  }

  const history: ChatMessage[] = historyRaw.filter(
    (m): m is ChatMessage =>
      m &&
      typeof m === 'object' &&
      (m.role === 'user' || m.role === 'assistant') &&
      typeof m.content === 'string' &&
      m.content.trim() !== '',
  );

  if (history.length === 0) {
    return NextResponse.json({ error: 'Nenhuma pergunta informada.' }, { status: 400 });
  }

  const context = await loadProjectChatContext(projectId);
  if (!context) {
    return NextResponse.json({ error: 'Projeto não encontrado.' }, { status: 404 });
  }

  try {
    const messages = buildChatMessages(context, history);
    const reply = await generateText(messages);
    return NextResponse.json({ reply });
  } catch (e) {
    const message =
      e instanceof AiGenerationError ? e.message : 'Não foi possível consultar a IA. Tente novamente.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
