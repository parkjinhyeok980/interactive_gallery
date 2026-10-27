import { Gallery } from '@/components/gallery/Gallery';
import { getGalleryPosts } from '@/lib/data/gallery';
export default async function Home() { return <Gallery posts={await getGalleryPosts()} />; }
