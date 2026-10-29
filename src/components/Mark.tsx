/** Pixel glyphs. Each is a grid of '#' and '.', rendered as crisp rects. */

export const GLYPHS = {
  seal: [
    '############',
    '#..........#',
    '#.#......#.#',
    '#..#....#..#',
    '#...#..#...#',
    '#....##....#',
    '#...#..#...#',
    '#..#....#..#',
    '#.#......#.#',
    '#..........#',
    '############',
  ],
  pin: [
    '.....##.....',
    '....####....',
    '....####....',
    '.....##.....',
    '############',
    '#..........#',
    '#.########.#',
    '#..........#',
    '#.########.#',
    '#..........#',
    '############',
  ],
  scan: [
    '............',
    '............',
    '...######...',
    '..#......#..',
    '.#..####..#.',
    '#..######..#',
    '.#..####..#.',
    '..#......#..',
    '...######...',
    '............',
    '............',
  ],
  eye: [
    '............',
    '............',
    '....####....',
    '..##....##..',
    '.#...##...#.',
    '#...####...#',
    '.#...##...#.',
    '..##....##..',
    '....####....',
    '............',
    '............',
  ],
};

export function Pixel({grid, className = '', title}: {grid: string[]; className?: string; title?: string}) {
  const h = grid.length;
  const w = grid[0].length;
  const cells: string[] = [];
  grid.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === '#') cells.push(`M${x} ${y}h1v1h-1z`);
  });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} shapeRendering="crispEdges" className={className} aria-hidden={!title} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <path d={cells.join('')} fill="currentColor" />
    </svg>
  );
}

/** A pixel cat head on a 9×8 grid: eyes and nose punched out. */
export function Mark({className = 'h-[22px] w-auto'}: {className?: string}) {
  return (
    <svg viewBox="0 0 9 8" shapeRendering="crispEdges" className={className} aria-hidden>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M0 0h2v1h1v1h3V1h1V0h2v7H8v1H1V7H0zM2 3v1h1V3zm4 0v1h1V3zM4 5v1h1V5z"
      />
    </svg>
  );
}
