import type { GalleryPost } from '@/types/gallery';

const foods = ['파스타', '피자', '샐러드', '팬케이크', '버거', '디저트', '스테이크', '아침 식사', '샌드위치', '수프', '연어 요리', '채소 요리'];
export const mockPosts: GalleryPost[] = Array.from({ length: 48 }, (_, i) => {
  const index = i % foods.length;
  const media = (n: number) => ({
    id: `sample-${i}-${n}`, type: 'IMAGE' as const,
    url: `/images/food-${(index + n) % foods.length + 1}.jpg`,
    width: 1000, height: 750, alt: `${foods[(index + n) % foods.length]} 예시 사진`,
  });
  return {
    id: `sample-${i + 1}`, type: i % 7 === 0 ? 'CAROUSEL_ALBUM' : 'IMAGE',
    caption: '갤러리 인터랙션을 확인하기 위한 예시 사진입니다. @hyeoki_foodie의 실제 Instagram 게시물이나 캡션이 아닙니다.',
    timestamp: new Date(Date.UTC(2026, 0, 48 - i)).toISOString(),
    permalink: null, media: i % 7 === 0 ? [media(0), media(1), media(2)] : [media(0)], isMock: true,
  };
});
