import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'HYEOKI — A taste of the everyday', description: '음식으로 기록한 순간들을 자유롭게 탐색하는 인터랙티브 사진 아카이브. 현재 예시 사진으로 구성된 데모입니다.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
