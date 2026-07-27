import { NextResponse } from 'next/server';
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from '@/lib/auth/session';

export async function POST(request: Request) {
  const { password } = (await request.json()) as { password?: string };
  const expected = process.env.APP_PASSWORD;
  const secret = process.env.SESSION_SECRET;

  if (!expected || !secret) {
    return NextResponse.json({ error: 'Aplicativo sem senha configurada.' }, { status: 500 });
  }
  if (password !== expected) {
    return NextResponse.json({ error: 'Senha incorreta.' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, await createSessionToken(secret), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
