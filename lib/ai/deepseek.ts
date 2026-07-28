import 'server-only';

/**
 * Camada isolada de acesso ao provedor de IA. Nenhum outro módulo sabe que o
 * provedor é o DeepSeek — só conhece `ChatMessage` e `generateText`. Trocar
 * de provedor no futuro é trocar este arquivo, sem tocar `monitoring-prompt`
 * nem a rota que o chama.
 *
 * `server-only` garante que a chave nunca vaza para o bundle do navegador —
 * qualquer import a partir de um Client Component quebra o build.
 */

export type ChatMessage = { role: 'system' | 'user'; content: string };

export type AiErrorKind = 'chave_ausente' | 'saldo_insuficiente' | 'tempo_esgotado' | 'erro_generico';

/**
 * Erro tipado da geração — a rota que chama `generateText` distingue os
 * quatro casos por `kind` e devolve mensagem em PT-BR ao gestor, nunca um
 * stack trace cru. Nunca é reexecutado automaticamente: uma geração que
 * falhou não deve custar duas vezes sem o usuário pedir de novo.
 */
export class AiGenerationError extends Error {
  readonly kind: AiErrorKind;

  constructor(kind: AiErrorKind, message: string) {
    super(message);
    this.name = 'AiGenerationError';
    this.kind = kind;
  }
}

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat';
const TIMEOUT_MS = 45_000;
const MAX_TOKENS = 3000;

export async function generateText(messages: ChatMessage[]): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new AiGenerationError(
      'chave_ausente',
      'A chave da API do DeepSeek (DEEPSEEK_API_KEY) não está configurada no servidor.',
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages,
        max_tokens: MAX_TOKENS,
      }),
      signal: controller.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new AiGenerationError(
        'tempo_esgotado',
        'A geração com IA demorou demais e foi cancelada. O registro factual já foi salvo — tente gerar novamente mais tarde.',
      );
    }
    throw new AiGenerationError(
      'erro_generico',
      'Não foi possível conectar ao serviço de IA. O registro factual já foi salvo.',
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '');
    if (bodyText.includes('Insufficient Balance')) {
      throw new AiGenerationError(
        'saldo_insuficiente',
        'A conta do DeepSeek está sem saldo. Adicione créditos em platform.deepseek.com para gerar o texto com IA — o registro factual já foi salvo e pode ser copiado manualmente enquanto isso.',
      );
    }
    throw new AiGenerationError(
      'erro_generico',
      `Falha ao gerar texto com IA (HTTP ${response.status}). O registro factual já foi salvo.`,
    );
  }

  const json = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = json.choices?.[0]?.message?.content;

  if (typeof content !== 'string' || content.trim() === '') {
    throw new AiGenerationError(
      'erro_generico',
      'A IA retornou uma resposta vazia. O registro factual já foi salvo.',
    );
  }

  return content;
}
