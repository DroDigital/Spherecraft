// The SPHERECRAFT logo, drawn as pixel letters where every pixel is a shaded sphere.

const FONT = {
  S: ['.###.', '#...#', '#....', '.###.', '....#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
};

const PALETTES = {
  earth: [[0x7ad84a, 0x5fbf38], [0x9a6538, 0x7c4e2b]], // grass on dirt
  stone: [[0xc4c4c8, 0xa8a8ad], [0x9b9b9f, 0x7f7f84]],
};

function shadeFn(hex) {
  return (f) => {
    const r0 = Math.min(255, ((hex >> 16) & 255) * f) | 0;
    const g0 = Math.min(255, ((hex >> 8) & 255) * f) | 0;
    const b0 = Math.min(255, (hex & 255) * f) | 0;
    return `rgb(${r0},${g0},${b0})`;
  };
}

function disc(ctx, x, y, r, style) {
  ctx.fillStyle = style;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function sphere(ctx, x, y, r, hex) {
  const c = shadeFn(hex);
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.08, x, y, r);
  g.addColorStop(0, c(1.45));
  g.addColorStop(0.5, c(1.0));
  g.addColorStop(1, c(0.5));
  disc(ctx, x, y, r, g);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.36, y - r * 0.42, r * 0.24, r * 0.14, -0.6, 0, Math.PI * 2);
  ctx.fill();
}

export function drawLogo(canvas, cell = 16) {
  const words = [['SPHERE', 'earth'], ['CRAFT', 'stone']];
  const letters = words.reduce((n, [w]) => n + w.length, 0);
  const cols = letters * 6 + 1; // 1 extra column between the words
  canvas.width = cols * cell + cell;
  canvas.height = 7 * cell + cell * 1.4;
  const ctx = canvas.getContext('2d');
  const r = cell * 0.5;
  const balls = [];
  let col = 0;
  for (const [word, pal] of words) {
    const [top, body] = PALETTES[pal];
    for (const ch of word) {
      const glyph = FONT[ch];
      for (let gy = 0; gy < 7; gy++) {
        for (let gx = 0; gx < 5; gx++) {
          if (glyph[gy][gx] !== '#') continue;
          const colors = gy < 2 ? top : body;
          balls.push({ x: (col + gx) * cell + cell, y: gy * cell + cell * 0.9, hex: colors[(gx + gy) % 2] });
        }
      }
      col += 6;
    }
    col += 1;
  }
  // Drop shadow, then a dark outline, then the spheres themselves.
  for (const b of balls) disc(ctx, b.x + r * 0.35, b.y + r * 0.5, r * 1.1, 'rgba(0,0,0,0.45)');
  for (const b of balls) disc(ctx, b.x, b.y, r * 1.14, shadeFn(b.hex)(0.3));
  for (const b of balls) sphere(ctx, b.x, b.y, r, b.hex);
}
