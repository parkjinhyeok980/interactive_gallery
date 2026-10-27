import { NextRequest, NextResponse } from 'next/server';
import { getGalleryPage } from '@/lib/data/gallery';
import { InstagramError } from '@/lib/instagram/api';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const after = request.nextUrl.searchParams.get('after');
    if (after !== null && (!after || after.length > 4096)) throw new InstagramError('pagination', 400);
    return NextResponse.json(await getGalleryPage(after ?? undefined), { headers });
  }
  catch (error) {
    return NextResponse.json({ error: error instanceof InstagramError ? error.code : 'upstream' },
      { status: error instanceof InstagramError ? error.status : 502, headers });
  }
}
