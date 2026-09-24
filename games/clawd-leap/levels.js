// levels.js — Clawd Leap's four stages, built with a tiny map builder instead of hand-aligned ASCII.
//
// Tiles:  # topsoil  D dirt  X stone  B brick  ? stamp box (ink drop)  H box with the ink hat  L box with a heart
//         = one-way paper ledge  ^ spikes  (U = spent box, set at runtime)
// Things: @ start  o ink drop  e blot  p paper plane  s spiky pencil  c checkpoint  F bookmark (goal)  K the Great Eraser

const LEVELS = (() => {
  const H = 15, TOP = 13;
  function build(w, fn) {
    const g = Array.from({ length: H }, () => Array(w).fill(' '));
    const set = (x, y, ch) => { if (x >= 0 && x < w && y >= 0 && y < H) g[y][x] = ch; };
    const A = {
      w, set,
      fill(x0, y0, x1, y1, ch) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, ch); },
      ground(x0, x1, top = TOP) { for (let x = x0; x <= x1; x++) { set(x, top, '#'); for (let y = top + 1; y < H; y++) set(x, y, 'D'); } },
      column(x, h, top = TOP) { for (let y = top - h; y < top; y++) set(x, y, 'X'); },
      stairs(x, n, dir = 1, top = TOP) { for (let i = 0; i < n; i++) for (let k = 0; k <= i; k++) set(x + (dir > 0 ? i : n - 1 - i), top - 1 - k, 'X'); },
      row(x, y, s) { [...s].forEach((ch, i) => { if (ch !== ' ') set(x + i, y, ch); }); },
      coins(x, y, n) { for (let i = 0; i < n; i++) set(x + i, y, 'o'); },
      arc(x, y, n) { for (let i = 0; i < n; i++) set(x + i, y - Math.round(Math.sin((i / (n - 1)) * Math.PI) * 2), 'o'); },
    };
    fn(A);
    return g.map((r) => r.join(''));
  }

  return [
    { name: ['종이 들판', 'Paper Meadow'], theme: 0, map: build(160, (A) => {
      A.ground(0, 40); A.ground(44, 72); A.ground(77, 108); A.ground(112, 159);
      A.set(3, 12, '@');
      A.coins(8, 10, 4);
      A.row(13, 9, 'B?B?B'); A.set(15, 5, 'H');
      A.set(22, 12, 'e'); A.column(27, 2); A.set(31, 12, 'e'); A.column(35, 3);
      A.arc(40, 10, 5);
      A.row(47, 9, '======'); A.coins(48, 8, 4); A.set(53, 12, 'e'); A.set(57, 12, 'e');
      A.column(63, 2); A.set(66, 12, 'e');
      A.arc(72, 10, 6);
      A.set(79, 12, 'c');
      A.stairs(84, 4); A.stairs(90, 4, -1);
      A.row(96, 9, 'BB?BLB'); A.set(99, 12, 'e'); A.set(103, 12, 'e');
      A.set(104, 8, 'p');
      A.arc(108, 10, 5);
      A.row(116, 10, '==='); A.row(121, 7, '==='); A.coins(121, 6, 3); A.set(126, 12, 'e');
      A.stairs(136, 7); A.fill(143, 6, 145, 12, 'X');
      A.set(153, 12, 'F');
    }) },
    { name: ['잉크 동굴', 'Ink Caves'], theme: 1, map: build(170, (A) => {
      A.fill(0, 0, 169, 1, 'X');
      A.ground(0, 30); A.ground(36, 62); A.ground(66, 100); A.ground(104, 169);
      A.fill(31, 14, 35, 14, '^'); A.fill(63, 14, 65, 14, '^'); A.fill(101, 14, 103, 14, '^');
      A.set(3, 12, '@');
      A.row(10, 9, 'B?B'); A.set(16, 12, 's'); A.set(21, 12, 'e');
      A.row(24, 5, 'BBBBBB'); A.coins(24, 4, 6);
      A.row(30, 10, '======'); A.set(40, 12, 'e'); A.set(44, 12, 's');
      A.fill(48, 2, 49, 8, 'X'); A.coins(46, 11, 6);
      A.row(52, 9, 'B?BHB'); A.set(58, 12, 'e');
      A.set(68, 12, 'c');
      A.fill(72, 11, 73, 12, 'X'); A.fill(78, 10, 79, 12, 'X'); A.fill(84, 9, 85, 12, 'X'); A.coins(78, 8, 2); A.coins(84, 7, 2);
      A.set(81, 12, 's'); A.set(90, 12, 'e'); A.set(94, 12, 'e');
      A.row(98, 8, '========'); A.coins(99, 7, 6);
      A.row(110, 9, 'BLB'); A.set(114, 12, 's'); A.set(118, 12, 's'); A.set(122, 12, 'e');
      A.fill(128, 12, 131, 12, '^'); A.row(127, 10, '======');
      A.set(136, 12, 'e'); A.set(140, 12, 'e'); A.set(144, 12, 's');
      A.stairs(150, 6); A.set(163, 12, 'F');
    }) },
    { name: ['하늘 페이지', 'Sky Pages'], theme: 2, map: build(170, (A) => {
      A.ground(0, 14); A.set(3, 12, '@');
      A.row(17, 11, '====='); A.row(24, 9, '===='); A.coins(24, 8, 4); A.row(31, 11, '======');
      A.set(28, 6, 'p'); A.row(40, 10, '===='); A.row(47, 8, '===='); A.row(54, 10, '=====');
      A.set(50, 5, 'p'); A.coins(47, 7, 4);
      A.ground(62, 80); A.set(65, 12, 'c'); A.row(70, 9, '?B?B?'); A.set(76, 12, 'e'); A.set(79, 12, 's');
      A.row(84, 11, '===='); A.row(90, 9, '===='); A.row(96, 7, '===='); A.set(99, 3, 'p'); A.coins(96, 6, 4);
      A.row(103, 9, '====='); A.set(106, 8, 'e'); A.row(111, 11, '===='); A.set(113, 6, 'p');
      A.ground(118, 135); A.row(122, 9, 'BHB'); A.set(128, 12, 'e'); A.set(131, 12, 'e');
      A.row(138, 10, '==='); A.row(143, 8, '==='); A.row(148, 10, '==='); A.set(146, 4, 'p');
      A.ground(153, 169); A.set(163, 12, 'F');
    }) },
    { name: ['지우개 성', 'Eraser Castle'], theme: 3, map: build(120, (A) => {
      A.fill(0, 0, 119, 1, 'X');
      A.ground(0, 119); for (let x = 0; x <= 119; x++) A.set(x, 13, 'X');
      A.set(3, 12, '@');
      A.fill(12, 13, 15, 13, '^'); A.row(11, 10, '======'); A.set(19, 12, 's');
      A.row(22, 9, 'B?B'); A.fill(28, 13, 33, 13, '^'); A.row(28, 10, '=='); A.row(32, 10, '==');
      A.set(37, 12, 'e'); A.set(40, 12, 's'); A.fill(44, 6, 45, 12, 'X'); A.row(37, 10, '=='); A.row(41, 8, '==='); A.coins(41, 7, 3);
      A.set(50, 12, 'c'); A.row(53, 9, 'BLB');
      A.fill(58, 13, 62, 13, '^'); A.row(58, 10, '=='); A.row(61, 8, '==');
      A.fill(66, 2, 66, 9, 'X');
      // the boss arena
      A.fill(70, 2, 70, 9, 'X'); A.row(74, 8, '==='); A.row(102, 8, '===');
      A.set(90, 12, 'K');
      A.fill(118, 2, 119, 12, 'X');
    }) },
  ];
})();
