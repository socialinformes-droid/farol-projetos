import Link from 'next/link';
import { ChevronLeftIcon } from 'lucide-react';

/**
 * Link discreto para a página-mãe, exibido acima do título da página.
 * Sempre um destino fixo (nunca router.back()) — assim o usuário sabe
 * exatamente para onde vai, mesmo chegando de um link externo ou redirect.
 */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ChevronLeftIcon className="size-3.5" strokeWidth={1.75} />
      {label}
    </Link>
  );
}
