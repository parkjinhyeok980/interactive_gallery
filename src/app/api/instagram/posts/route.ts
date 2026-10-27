import { NextResponse } from 'next/server';
import { getGalleryPosts } from '@/lib/data/gallery';
import { InstagramError } from '@/lib/instagram/api';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  const headers = { 'Cache-Control': 'no-store' };
  try { return NextResponse.json({ posts: await getGalleryPosts() }, { headers }); }
  catch (error) {
    return NextResponse.json({ error: error instanceof InstagramError ? error.code : 'upstream' },
      { status: error instanceof InstagramError ? error.status : 502, headers });
  }
}
