import { NextResponse } from 'next/server';
import type { ProjectChatContext } from '@/lib/domain/chat-context';
import { buildChatMessages } from '@/lib/domain/chat-prompt';
import { generateText, AiGenerationError, type ChatMessage } from '@/lib/ai/deepseek';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * Chat lateral de dúvidas sobre um projeto — efêmero: esta rota não lê nem
 * grava nada no Supabase. O contexto (`context`) já chega pronto, montado
 * pela página do projeto no servidor (`lib/domain/chat-context.ts`); esta
 * rota só transforma contexto + histórico em mensagens e chama a IA.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const context = body?.context as ProjectChatContext | null | undefined;
  const historyRaw = body?.messages;

  if (!context || typeof context !== 'object') {
    return NextResponse.json({ error: 'Contexto do projeto não informado.' }, { status: 400 });
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
