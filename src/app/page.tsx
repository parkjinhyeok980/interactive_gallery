import { PagedGallery } from '@/components/gallery/PagedGallery';
import { getGalleryPage } from '@/lib/data/gallery';
export const dynamic = 'force-dynamic';
export default async function Home() { return <PagedGallery initialPage={await getGalleryPage()} />; }
