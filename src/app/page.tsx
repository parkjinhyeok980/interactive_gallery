import { Gallery } from '@/components/gallery/Gallery';
import { getGalleryPosts } from '@/lib/data/gallery';
export const dynamic = 'force-dynamic';
export default async function Home() { return <Gallery posts={await getGalleryPosts()} />; }
