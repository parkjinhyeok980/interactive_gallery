import { NextRequest, NextResponse } from 'next/server';
import { exchangeCode, stateCookie } from '@/lib/instagram/oauth';
import { localOAuthEnabled, sameSecret, saveSession, unseal } from '@/lib/instagram/session';

export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'Content-Type': 'text/plain; charset=utf-8' };
  let response: NextResponse;
  try {
    if (!localOAuthEnabled()) throw new Error('disabled');
    const saved = unseal<{ state: string; expiresAt: number }>(request.cookies.get(stateCookie)?.value || '');
    const state = request.nextUrl.searchParams.get('state') || '';
    if (!saved.state || !Number.isFinite(saved.expiresAt) || saved.expiresAt < Date.now() || !sameSecret(saved.state, state)) throw new Error('invalid state');
    const code = request.nextUrl.searchParams.get('code');
    if (request.nextUrl.searchParams.has('error') || !code || code.length > 4096) throw new Error('denied');
    await saveSession(await exchangeCode(code));
    response = new NextResponse('Instagram 연결이 완료되었습니다. 갤러리(/)를 새로고침하세요.', { headers });
  } catch {
    response = new NextResponse('Instagram 연결을 완료하지 못했습니다. 계정·권한·앱 설정을 확인하고 /api/instagram/connect에서 다시 연결하세요.', { status: 400, headers });
  }
  response.cookies.set(stateCookie, '', { path: '/api/instagram', maxAge: 0, httpOnly: true, sameSite: 'lax' });
  return response;
}
