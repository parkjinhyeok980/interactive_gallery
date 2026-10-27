import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { oauthConfig, stateCookie } from '@/lib/instagram/oauth';
import { localOAuthEnabled, required, sameSecret, seal } from '@/lib/instagram/session';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; form-action 'self' https://www.instagram.com; frame-ancestors 'none'; base-uri 'none'" };
let attempts = 0, windowStart = 0;
export async function GET() {
  if (!localOAuthEnabled()) return new NextResponse('로컬 Instagram 연결이 비활성화되어 있습니다.', { status: 404, headers });
  return new NextResponse('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Instagram 연결</title><body><main><h1>Instagram 연결</h1><p>갤러리 소유자만 연결할 수 있습니다.</p><form method="post"><label>관리자 연결 키 <input name="key" type="password" required autocomplete="off" maxlength="256"></label><button type="submit">Instagram으로 연결</button></form><p><a href="/">갤러리로 돌아가기</a></p></main></body></html>', { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
}
export async function POST(request: NextRequest) {
  if (!localOAuthEnabled()) return new NextResponse(null, { status: 404, headers });
  try {
    const config = oauthConfig();
    if (request.headers.get('origin') !== config.redirect.origin) return new NextResponse('잘못된 요청입니다.', { status: 403, headers });
    if (Date.now() - windowStart > 60_000) { windowStart = Date.now(); attempts = 0; }
    if (++attempts > 10) return new NextResponse('잠시 후 다시 시도하세요.', { status: 429, headers });
    if (Number(request.headers.get('content-length')) > 4096) return new NextResponse(null, { status: 413, headers });
    const adminKey = required('INSTAGRAM_CONNECT_KEY');
    if (adminKey.length < 32) throw new Error('configuration');
    const form = await request.formData();
    const value = form.get('key');
    if (typeof value !== 'string' || !sameSecret(value, adminKey)) return new NextResponse('연결 키를 확인하세요.', { status: 403, headers });
    const state = randomBytes(32).toString('hex');
    const url = new URL('https://www.instagram.com/oauth/authorize');
    url.search = new URLSearchParams({ client_id: config.appId, redirect_uri: config.redirect.href,
      response_type: 'code', scope: 'instagram_business_basic', state, enable_fb_login: '0', force_authentication: '1' }).toString();
    const response = NextResponse.redirect(url, 303);
    Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
    response.cookies.set(stateCookie, seal({ state, expiresAt: Date.now() + 600_000 }), {
      httpOnly: true, secure: config.redirect.protocol === 'https:', sameSite: 'lax', path: '/api/instagram', maxAge: 600,
    });
    return response;
  } catch {
    return new NextResponse('Instagram 연결 설정을 확인하세요. README의 Phase 2 설정을 참고하세요.', { status: 503, headers });
  }
}
