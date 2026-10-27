'use client';
export default function ErrorPage({ reset }: { reset: () => void }) { return <main className="loading-screen"><p>갤러리를 불러오지 못했습니다.</p><button onClick={reset}>다시 시도</button></main>; }
