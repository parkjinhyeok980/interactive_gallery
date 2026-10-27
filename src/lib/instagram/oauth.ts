import 'server-only';
import { InstagramClient, InstagramError, requestJson } from './api';
import { required } from './session';

export const stateCookie = 'instagram_oauth_state';
export function oauthConfig() {
  const redirect = new URL(required('INSTAGRAM_REDIRECT_URI'));
  if (redirect.protocol !== 'https:' && !(redirect.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(redirect.hostname))) throw new InstagramError('configuration', 503);
  if (redirect.pathname !== '/api/instagram/callback' || redirect.search || redirect.hash || redirect.username || redirect.password) throw new InstagramError('configuration', 503);
  return { redirect, appId: required('INSTAGRAM_APP_ID'), appSecret: required('INSTAGRAM_APP_SECRET') };
}
export async function exchangeCode(code: string) {
  const config = oauthConfig();
  type Token = { access_token?: string };
  const response = await requestJson<Token & { data?: Token[] }>(new URL('https://api.instagram.com/oauth/access_token'), {
    method: 'POST', body: new URLSearchParams({ client_id: config.appId, client_secret: config.appSecret,
      grant_type: 'authorization_code', redirect_uri: config.redirect.href, code }),
  });
  const shortToken = response.data?.length === 1 && !response.access_token ? response.data[0].access_token : !response.data ? response.access_token : undefined;
  if (!shortToken) throw new InstagramError('authentication', 401);
  const url = new URL('https://graph.instagram.com/access_token');
  url.search = new URLSearchParams({ grant_type: 'ig_exchange_token', client_secret: config.appSecret, access_token: shortToken }).toString();
  const token = await requestJson<{ access_token: string; expires_in: number }>(url);
  if (!token.access_token || !Number.isFinite(token.expires_in) || token.expires_in <= 0) throw new InstagramError('authentication', 401);
  const client = new InstagramClient(token.access_token, required('INSTAGRAM_API_VERSION'));
  const profile = await client.profile(required('INSTAGRAM_USERNAME'));
  return { accessToken: token.access_token, username: profile.username, expiresAt: Date.now() + token.expires_in * 1000 };
}
