'use client';

import { useState } from 'react';
import { MessageCircleQuestionIcon, SendIcon } from 'lucide-react';

import type { ProjectChatContext } from '@/lib/domain/chat-context';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

type ChatTurn = { role: 'user' | 'assistant'; content: string };

/**
 * Painel lateral de dúvidas sobre o projeto — 100% efêmero: as mensagens só
 * existem neste estado do componente, nunca são gravadas em lugar nenhum, e
 * somem ao fechar. `context` já chega pronto do servidor (a página do
 * projeto monta em `lib/domain/chat-context.ts`); este componente nunca
 * consulta o Supabase, só reenvia o contexto recebido a cada pergunta.
 */
export function ProjectChatSheet({ context }: { context: ProjectChatContext }) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setTurns([]);
    setInput('');
    setError(null);
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;

    const nextTurns: ChatTurn[] = [...turns, { role: 'user', content: text }];
    setTurns(nextTurns);
    setInput('');
    setSending(true);
    setError(null);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context, messages: nextTurns }),
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? 'Não foi possível consultar a IA.');
        return;
      }
      setTurns((prev) => [...prev, { role: 'assistant', content: json.reply as string }]);
    } catch {
      setError('Falha ao conectar com o serviço de IA.');
    } finally {
      setSending(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <SheetTrigger
        render={<Button type="button" variant="outline" size="icon" title="Dúvidas sobre o projeto" />}
      >
        <MessageCircleQuestionIcon className="size-4" />
        <span className="sr-only">Dúvidas sobre o projeto</span>
      </SheetTrigger>
      <SheetContent className="flex h-full flex-col">
        <SheetHeader>
          <SheetTitle>Dúvidas sobre o projeto</SheetTitle>
          <SheetDescription>
            Pergunte sobre os números deste projeto. As respostas usam só os dados já carregados aqui —
            a conversa some ao fechar este painel.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 px-4">
          <div className="flex flex-col gap-3 pb-4">
            {turns.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma pergunta ainda.</p>
            )}
            {turns.map((t, i) => (
              <div
                key={i}
                className={
                  t.role === 'user'
                    ? 'ml-8 self-end rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground'
                    : 'mr-8 self-start rounded-lg bg-muted px-3 py-2 text-sm text-foreground'
                }
              >
                {t.content}
              </div>
            ))}
            {sending && <p className="text-sm text-muted-foreground">Consultando…</p>}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        </ScrollArea>

        <div className="flex flex-col gap-2 border-t border-border p-4">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Pergunte sobre este projeto…"
            rows={2}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <Button type="button" onClick={handleSend} disabled={sending || input.trim() === ''}>
            <SendIcon className="size-4" />
            {sending ? 'Enviando…' : 'Enviar'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
