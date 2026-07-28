/**
 * Documento do projeto como contexto da IA (migração 0011).
 *
 * Ao gerar o monitoramento, a IA conhece a execução (o que foi gasto, o que
 * foi concluído) mas não conhece o projeto: qual o objetivo, o que está no
 * escopo, o que foi prometido. Sem isso, o campo "Objetivo" do formulário do
 * PMO sai genérico — exatamente o que o manual proíbe. Este módulo extrai as
 * seções úteis do relatório de projeto do SGF (PDF) para alimentar o prompt.
 *
 * Dois módulos, espelhando o padrão de `ledger-import.ts`:
 * - `extractRelevantSections` é pura (sem I/O), TDD-first.
 * - `readPdfText` é a leitura fina do PDF (usa `unpdf`), só roda em Route
 *   Handler.
 *
 * Medido contra o relatório real de referência (17 páginas, 22.306
 * caracteres): as seções úteis vão de JUSTIFICATIVA a DADOS COMPLEMENTARES —
 * 3.913 caracteres, 17% do total. O resto é equipe, cronograma e histórico:
 * não ajuda a redigir objetivo/escopo e só encarece cada chamada de IA.
 */

/** Teto de segurança quando nenhum marcador reconhecido é encontrado — evita mandar um documento inteiro (ex.: 200 páginas) para a IA. */
const FALLBACK_CEILING = 8000;

/** Marcadores de início, em ordem de preferência. */
const START_MARKERS = ['JUSTIFICATIVA', 'OBJETIVO GERAL'];

/** Marcadores de fim, em ordem de preferência. */
const END_MARKERS = ['DADOS COMPLEMENTARES', 'LINHAS DE ATUAÇÃO', 'EQUIPE'];

function findFirstMarker(text: string, markers: string[], fromIndex: number): number {
  for (const marker of markers) {
    const idx = text.indexOf(marker, fromIndex);
    if (idx !== -1) return idx;
  }
  return -1;
}

export type ExtractedContext = {
  text: string;
  trimmed: boolean;
};

/**
 * Recorta as seções úteis (JUSTIFICATIVA/OBJETIVO GERAL até DADOS
 * COMPLEMENTARES/LINHAS DE ATUAÇÃO/EQUIPE) de um texto de relatório de
 * projeto. Pura, nunca lança erro: um documento com layout inesperado
 * degrada para "aqui está o que conseguimos", nunca falha.
 */
export function extractRelevantSections(fullText: string): ExtractedContext {
  try {
    const normalized = (fullText ?? '').replace(/\s+/g, ' ').trim();

    const startIdx = findFirstMarker(normalized, START_MARKERS, 0);
    const endIdx =
      startIdx === -1 ? -1 : findFirstMarker(normalized, END_MARKERS, startIdx + 1);

    if (startIdx === -1 || endIdx === -1) {
      const truncated = normalized.slice(0, FALLBACK_CEILING);
      return { text: truncated, trimmed: normalized.length > FALLBACK_CEILING };
    }

    const section = normalized.slice(startIdx, endIdx).trim();
    return { text: section, trimmed: false };
  } catch {
    // Nunca lança — degrada para o que der, mesmo diante do inesperado.
    const safe = typeof fullText === 'string' ? fullText.slice(0, FALLBACK_CEILING) : '';
    return { text: safe, trimmed: true };
  }
}

/**
 * Lê texto e contagem de páginas de um PDF em memória usando `unpdf`
 * (empacotado para serverless, funciona na Vercel). Só é chamado em Route
 * Handler; não roda no browser. `readPdfText` (abaixo) é o wrapper fino só
 * com o texto, para quem não precisa da contagem de páginas.
 */
export async function readPdfDocument(buffer: ArrayBuffer): Promise<{ text: string; pages: number }> {
  const { getDocumentProxy, extractText } = await import('unpdf');

  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  return { text, pages: totalPages };
}

/**
 * Lê o texto de um PDF em memória usando `unpdf`. Só é chamado em Route
 * Handler; não roda no browser.
 */
export async function readPdfText(buffer: ArrayBuffer): Promise<string> {
  const { text } = await readPdfDocument(buffer);
  return text;
}
