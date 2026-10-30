const outlines = [
  'M12 44H52V46C52 51 48 53 44 53H20C16 53 12 51 12 46Z',
  'M12 36H52C56 36 56 41 52 41H12C8 41 8 36 12 36Z',
  'M10 31L17 33L24 30L32 33L40 30L47 33L54 31',
  'M12 26C12 9 52 9 52 26Z',
];

export function GalleryLoading() {
  return <main className="loading-screen" role="status" aria-label="갤러리 불러오는 중">
    <svg className="burger-loader" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <g className="burger-loader-base">{outlines.map(d => <path key={d} d={d} />)}</g>
      <g className="burger-loader-fill">{outlines.map((d, index) => <path key={d} d={d} pathLength="1" style={{ animationDelay: `${index * .16}s` }} />)}</g>
    </svg>
    <span className="sr-only">갤러리 불러오는 중</span>
  </main>;
}
