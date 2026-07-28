import { NextResponse } from 'next/server';
import { readPdfDocument, extractRelevantSections } from '@/lib/domain/project-context';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Extrai o texto relevante do PDF do relatório de projeto (SGF) para o
 * gestor revisar antes de salvar. NÃO grava nada — o gestor corrige o texto
 * na tela e o salvamento acontece pelo formulário do projeto (Server
 * Action), como qualquer outro campo.
 */
export async function POST(request: Request) {
  // `formData()` lança quando o corpo não é multipart — antes de qualquer
  // validação nossa. Sem este try, uma requisição sem arquivo vira 500 em vez
  // da mensagem que explica o que fazer.
  const formData = await request.formData().catch(() => null);
  const file = formData?.get('file');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Envie um arquivo PDF.' }, { status: 400 });
  }

  const looksLikePdf =
    file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!looksLikePdf) {
    return NextResponse.json({ error: 'Envie um arquivo PDF.' }, { status: 400 });
  }

  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: 'Arquivo muito grande. O limite é 5 MB.' },
      { status: 400 },
    );
  }

  let fullText: string;
  let pages: number;
  try {
    const doc = await readPdfDocument(await file.arrayBuffer());
    fullText = doc.text;
    pages = doc.pages;
  } catch {
    return NextResponse.json(
      { error: 'Não foi possível ler o PDF. Verifique se o arquivo não está corrompido.' },
      { status: 400 },
    );
  }

  const { text, trimmed } = extractRelevantSections(fullText);

  return NextResponse.json({
    text,
    trimmed,
    pages,
    originalLength: fullText.length,
  });
}
