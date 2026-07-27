'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';

export function LoginView() {
  const [password, setPassword] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!response.ok) {
      const { error } = await response.json();
      toast.error(error ?? 'Não foi possível entrar.');
      return;
    }
    startTransition(() => {
      router.replace('/');
      router.refresh();
    });
  }

  return (
    <main className="flex min-h-svh items-center justify-center px-4">
      <Card className="w-full max-w-sm p-6">
        <h1 className="font-display text-2xl">Farol de Projetos</h1>
        <p className="mt-1 text-sm text-muted-foreground">Informe a senha de acesso.</p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={pending || password.length === 0}>
            Entrar
          </Button>
        </form>
      </Card>
    </main>
  );
}
