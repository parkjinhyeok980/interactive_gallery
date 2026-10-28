import { imageCache } from '@/lib/media/serverCache';
export const runtime = 'nodejs';
export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!/^[a-f0-9]{64}$/.test(key)) return new Response(null, { status: 404 });
  try {
    const image = await imageCache.get(key);
    return new Response(new Uint8Array(image.data), { headers: {
      'Content-Type': image.type,
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      'X-Content-Type-Options': 'nosniff',
      'X-Image-Cache': image.hit ? 'HIT' : 'MISS',
    } });
  } catch { return new Response(null, { status: 502, headers: { 'Cache-Control': 'no-store' } }); }
}
