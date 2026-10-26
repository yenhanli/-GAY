// 六角形場地：牆、草叢、加速板

// ===== 地圖（新手畫這裡）=====
// 只畫「左半邊」，右半邊程式會自動左右翻過去，所以一定對稱。
// 每一行 12 個字、共 21 行，每個字是一格 40 px。
//   .  空地
//   #  牆
//   g  草叢
//   > < ^ v  加速板（箭頭往哪就往哪衝；翻到右邊時 > 和 < 會自動對調）
// 六角形外面的格子不會出現，所以四個角畫什麼都沒差。
// 左邊出生點大概在第 11 行（正中間那行）、第 4～5 個字附近，那裡要留空地。
const MAP_LEFT_HALF = [
  '............',
  '........##..',
  '......#.ggg.',
  '.....##.ggg.',
  '....#.......',
  '...gg...##..',
  '...gg....#..',
  '..#...>.....',
  '..#.....gg.#',
  '........gg.#',
  '......#.....',
  '........gg.#',
  '..#.....gg.#',
  '..#...>.....',
  '...gg....#..',
  '...gg...##..',
  '....#.......',
  '.....##.ggg.',
  '......#.ggg.',
  '........##..',
  '............',
];

// ===== 3 人亂鬥的地圖 =====
// 三個出生點在六角形裡各隔 120 度。為了三個人都公平，只寫「一個人那邊」的東西，
// 程式會左右各放一個、再轉 120 度、240 度各複製一份，所以三邊長得一模一樣。
// 每一項是 [東西, 偏幾度, 離中心多遠]：
//   偏幾度 = 從「中心看向出生點」那條線往左右偏幾度（0 就是正對出生點那條線上）
//   加速板一律朝中心衝
const FFA_FEATURES = [
  ['wall', 0, 100], ['wall', 0, 140],                     // 中間 Y 字形的牆
  ['wall', 20, 230], ['wall', 16, 270],                   // 出生點前面左右的掩護
  ['wall', 60, 250], ['wall', 60, 290], ['wall', 60, 330], // 兩個出生點中間的隔牆
  ['wall', 44, 120], ['wall', 85, 180],                   // 中間附近多幾塊掩護
  ['wall', 30, 380],                                       // 出生點旁邊的牆
  ['grass', 34, 160], ['grass', 40, 200], ['grass', 30, 200], // 往中間路上的草
  ['grass', 52, 390], ['grass', 46, 370],                 // 邊邊的草
  ['boost', 32, 300],                                      // 往中間衝的加速板
];

// 加速板箭頭 → 方向
const BOOST_DIRS = {
  '>': { x: 1, y: 0 },
  '<': { x: -1, y: 0 },
  '^': { x: 0, y: -1 },
  'v': { x: 0, y: 1 },
};

const SQRT3 = Math.sqrt(3);

const Arena = {
  grid: [],    // grid[row][col] = 格子資料，空地或六角形外面是 null
  tiles: [],   // 所有格子排成一串，畫圖時方便
  cols: 0,
  rows: 0,
  spawns: [],  // 出生點，第 0 個給房主

  // 蓋場地。mode：'1v1' 用上面畫的地圖，'ffa' 用 3 人亂鬥的地圖
  build(mode) {
    this.rows = MAP_LEFT_HALF.length;
    this.cols = MAP_LEFT_HALF[0].length * 2;
    this.grid = [];
    for (let r = 0; r < this.rows; r++) this.grid.push(new Array(this.cols).fill(null));

    const D = CONFIG.arena.spawnDistance;
    if (mode === 'ffa') {
      this.buildFFA();
      // 左邊、右上、右下，各隔 120 度
      this.spawns = [180, 300, 60].map((deg) => ({
        x: Math.cos((deg * Math.PI) / 180) * D,
        y: Math.sin((deg * Math.PI) / 180) * D,
      }));
    } else {
      this.build1v1();
      this.spawns = [{ x: -D, y: 0 }, { x: D, y: 0 }];
    }

    this.tiles = [];
    for (const row of this.grid) {
      for (const t of row) if (t) this.tiles.push(t);
    }
  },

  // 1v1：把文字地圖變成格子
  build1v1() {
    for (let r = 0; r < this.rows; r++) {
      const left = MAP_LEFT_HALF[r];
      const right = left.split('').reverse().map(mirrorChar).join('');
      const line = left + right;
      for (let c = 0; c < this.cols; c++) {
        const ch = line[c];
        if (ch === '#') this.setTile(r, c, 'wall');
        else if (ch === 'g') this.setTile(r, c, 'grass');
        else if (BOOST_DIRS[ch]) this.setTile(r, c, 'boost', BOOST_DIRS[ch]);
      }
    }
  },

  // 3 人亂鬥：每樣東西左右各一個、再轉三個方向
  buildFFA() {
    const T = CONFIG.arena.tile;
    for (const [type, offset, dist] of FFA_FEATURES) {
      for (const side of [-1, 1]) {
        for (const base of [180, 300, 60]) {
          const a = ((base + side * offset) * Math.PI) / 180;
          const x = Math.cos(a) * dist;
          const y = Math.sin(a) * dist;
          // 換算成第幾格
          const c = Math.floor((x + (this.cols * T) / 2) / T);
          const r = Math.floor((y + (this.rows * T) / 2) / T);
          const dir = { x: -Math.cos(a), y: -Math.sin(a) };   // 朝中心
          this.setTile(r, c, type, dir);
        }
      }
    }
  },

  // 在第 r 行第 c 格放東西（六角形外面的不放）
  setTile(r, c, type, dir) {
    if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return;
    const T = CONFIG.arena.tile;
    // 格子中心的座標（場地中心是 0,0）
    const x = (c + 0.5) * T - (this.cols * T) / 2;
    const y = (r + 0.5) * T - (this.rows * T) / 2;
    if (!this.insideHex(x, y, 0)) return;
    const tile = { type, x, y };
    if (type === 'boost') {
      tile.dir = dir;
      tile.cooldown = 0;
    }
    this.grid[r][c] = tile;
  },

  // 點 (x,y) 有沒有在六角形裡面；margin = 離邊界至少要多遠
  // 六角形是平頂的：左右兩個尖角，上下是平邊
  // R 是六角形大小，沒給就是整個場地（縮圈時會給比較小的）
  insideHex(x, y, margin, R = CONFIG.arena.radius) {
    return Math.abs(y) <= (R * SQRT3) / 2 - margin &&
           SQRT3 * Math.abs(x) + Math.abs(y) <= SQRT3 * R - 2 * margin;
  },

  // 這個座標底下是哪一格
  tileAt(x, y) {
    const T = CONFIG.arena.tile;
    const c = Math.floor((x + (this.cols * T) / 2) / T);
    const r = Math.floor((y + (this.rows * T) / 2) / T);
    if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return null;
    return this.grid[r][c];
  },

  // 半徑 radius 的圓放在 (x,y) 會不會卡到牆或出界
  blocked(x, y, radius) {
    if (!this.insideHex(x, y, radius)) return true;
    const half = CONFIG.arena.tile / 2;
    for (const t of this.tiles) {
      if (t.type !== 'wall') continue;
      // 圓心到方塊最近的點的距離
      const dx = Math.max(Math.abs(x - t.x) - half, 0);
      const dy = Math.max(Math.abs(y - t.y) - half, 0);
      if (dx * dx + dy * dy < radius * radius) return true;
    }
    return false;
  },

  update(dt) {
    for (const t of this.tiles) {
      if (t.type === 'boost' && t.cooldown > 0) t.cooldown -= dt;
    }
  },

  // ===== 畫圖 =====

  hexPath(ctx, R = CONFIG.arena.radius) {
    ctx.beginPath();
    this.addHex(ctx, R);
  },

  addHex(ctx, R) {
    ctx.moveTo(R, 0);
    for (let i = 1; i < 6; i++) {
      const a = (Math.PI / 3) * i;
      ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R);
    }
    ctx.closePath();
  },

  // 縮圈：安全區外面塗紅色，邊界畫紅線
  drawZone(ctx, zoneR) {
    if (zoneR >= CONFIG.arena.radius) return;
    ctx.save();
    ctx.beginPath();
    this.addHex(ctx, CONFIG.arena.radius);
    this.addHex(ctx, zoneR);
    ctx.fillStyle = 'rgba(220, 40, 40, 0.28)';
    ctx.fill('evenodd');   // 大六角形挖掉小六角形，只塗中間那圈
    this.hexPath(ctx, zoneR);
    ctx.lineWidth = 4;
    ctx.setLineDash([12, 8]);
    ctx.strokeStyle = '#d42828';
    ctx.stroke();
    ctx.restore();
  },

  // 地板、加速板、牆（畫在小人下面）
  drawGround(ctx) {
    const T = CONFIG.arena.tile;

    ctx.save();
    this.hexPath(ctx);
    ctx.fillStyle = '#d9c99a';
    ctx.fill();
    ctx.clip();

    // 地板棋盤格，淡淡的
    ctx.fillStyle = '#d0bf8e';
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if ((r + c) % 2 === 0) continue;
        ctx.fillRect(c * T - (this.cols * T) / 2, r * T - (this.rows * T) / 2, T, T);
      }
    }

    for (const t of this.tiles) {
      if (t.type === 'boost') drawBoost(ctx, t, T);
    }
    for (const t of this.tiles) {
      if (t.type === 'wall') drawWall(ctx, t, T);
    }
    ctx.restore();

    // 六角形邊框
    this.hexPath(ctx);
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#3a2f22';
    ctx.stroke();
  },

  // 草叢（畫在對手上面，才藏得住；自己的小人另外處理）
  drawGrass(ctx) {
    const T = CONFIG.arena.tile;
    ctx.save();
    this.hexPath(ctx);
    ctx.clip();
    for (const t of this.tiles) {
      if (t.type === 'grass') drawGrassTile(ctx, t, T);
    }
    ctx.restore();
  },
};

function mirrorChar(ch) {
  if (ch === '>') return '<';
  if (ch === '<') return '>';
  return ch;
}

function drawWall(ctx, t, T) {
  const x = t.x - T / 2;
  const y = t.y - T / 2;
  ctx.fillStyle = '#4b4f5c';
  ctx.fillRect(x, y, T, T);
  ctx.fillStyle = '#6b7080';      // 上面亮一點，看起來有高度
  ctx.fillRect(x, y, T, 8);
  ctx.fillStyle = '#353843';      // 下面暗一點
  ctx.fillRect(x, y + T - 4, T, 4);
}

function drawGrassTile(ctx, t, T) {
  const x = t.x - T / 2;
  const y = t.y - T / 2;
  ctx.fillStyle = '#2f7a35';
  ctx.fillRect(x, y, T, T);
  // 葉子：幾個亮綠色小方塊，位置用座標算，每格都一樣固定
  ctx.fillStyle = '#4fa84f';
  const leaves = [[4, 6], [20, 2], [30, 14], [10, 22], [24, 28], [2, 32], [32, 34]];
  for (const [lx, ly] of leaves) {
    ctx.fillRect(x + lx, y + ly, 4, 8);
    ctx.fillRect(x + lx + 4, y + ly - 4, 4, 8);
  }
}

function drawBoost(ctx, t, T) {
  const ready = t.cooldown <= 0;
  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.rotate(Math.atan2(t.dir.y, t.dir.x));
  ctx.globalAlpha = ready ? 1 : 0.35;
  ctx.fillStyle = '#b8902c';
  ctx.fillRect(-T / 2 + 2, -T / 2 + 2, T - 4, T - 4);
  ctx.fillStyle = '#ffd84a';
  // 像素箭頭（朝右畫，再整個轉向）
  ctx.fillRect(-14, -4, 16, 8);
  ctx.fillRect(2, -12, 4, 24);
  ctx.fillRect(6, -8, 4, 16);
  ctx.fillRect(10, -4, 4, 8);
  ctx.restore();
}
