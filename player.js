// 小人：移動、瞄準、像素畫法

function createPlayer(id, x, y) {
  return {
    type: 'player',
    id,
    x,
    y,
    r: CONFIG.player.radius,
    hp: CONFIG.player.hp,
    maxHp: CONFIG.player.hp,
    angle: 0,          // 面向哪個方向（弧度），0 是正右邊
    super: 0,
    boostTime: 0,      // 加速還剩幾秒
    boostDir: { x: 0, y: 0 },
    inGrass: false,
    shootCooldown: 0,  // 還要等幾秒才能再射
    revealTime: 0,     // 在草裡開槍後，還會露出來幾秒
    sinceHit: 99,      // 距離上次被打中幾秒（回血用）
    flash: 0,          // 閃白還剩幾秒
    dead: false,       // 倒下了沒
  };
}

// 小人的 6 格，排法等新手定稿再改這裡。
// col / row 是第幾格（每格 cellSize px），col 可以是 0.5 代表置中。
// 有寫 side 的格子，面向左邊時會左右對調（鈕扣永遠在前面）。
const PLAYER_CELLS = [
  { col: 0.5, row: 0, color: 'hair' },
  { col: 0.5, row: 1, color: 'skin', eyes: true },
  { col: 0, row: 2, color: 'clothes', side: 'back' },
  { col: 1, row: 2, color: 'button', side: 'front' },
  { col: 0, row: 3, color: 'shoes' },
  { col: 1, row: 3, color: 'shoes' },
];

const Player = {
  update(p, input, dt) {
    if (p.flash > 0) p.flash -= dt;

    // 倒下了就不能動、不能射
    if (p.dead) {
      input.shootPressed = false;
      input.superPressed = false;
      return;
    }

    // 回血：太久沒被打到就慢慢補
    p.sinceHit += dt;
    if (p.sinceHit >= CONFIG.player.regenDelay) {
      p.hp = Math.min(p.maxHp, p.hp + CONFIG.player.regenPerSec * dt);
    }

    // 方向鍵 → 方向
    let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);

    // 斜走不加速：把方向的長度變成 1
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      dx /= len;
      dy /= len;
    }

    let speed = CONFIG.player.speed;

    // 踩到加速板
    const tile = Arena.tileAt(p.x, p.y);
    if (tile && tile.type === 'boost' && tile.cooldown <= 0) {
      tile.cooldown = CONFIG.boost.cooldown;
      p.boostTime = CONFIG.boost.duration;
      p.boostDir = tile.dir;
    }
    if (p.boostTime > 0) {
      p.boostTime -= dt;
      speed *= CONFIG.boost.speedMul;
      // 沒按方向鍵就順著箭頭衝
      if (len === 0) {
        dx = p.boostDir.x;
        dy = p.boostDir.y;
      }
    }

    // 分成每步最多 2 px 慢慢走，才能剛好貼到牆，不會停在牆前面一段距離
    // x 和 y 分開走：撞牆時另一個方向還能滑過去
    const steps = Math.max(1, Math.ceil((speed * dt) / 2));
    const stepX = (dx * speed * dt) / steps;
    const stepY = (dy * speed * dt) / steps;
    for (let i = 0; i < steps; i++) {
      if (!Arena.blocked(p.x + stepX, p.y, p.r)) p.x += stepX;
      if (!Arena.blocked(p.x, p.y + stepY, p.r)) p.y += stepY;
    }

    // 面向滑鼠
    p.angle = Math.atan2(input.mouseY - p.y, input.mouseX - p.x);

    const under = Arena.tileAt(p.x, p.y);
    p.inGrass = !!under && under.type === 'grass';

    // 射擊：點一下射一發；還在冷卻就不射（這一下就算了）
    if (p.shootCooldown > 0) p.shootCooldown -= dt;
    if (p.revealTime > 0) p.revealTime -= dt;
    if (input.shootPressed) {
      input.shootPressed = false;
      if (p.shootCooldown <= 0) {
        Bullets.spawn(p);
        p.shootCooldown = CONFIG.attack.cooldown;
        p.revealTime = CONFIG.grass.revealAfterShot;
      }
    }

    // 大招：集滿才能放，放完歸零；沒集滿按了就算了
    if (input.superPressed) {
      input.superPressed = false;
      if (p.super >= CONFIG.super.hitsToCharge) {
        Bullets.spawnFan(p);
        p.super = 0;
        p.revealTime = CONFIG.grass.revealAfterShot;
      }
    }
  },

  // 被打中：扣血、閃白，血歸零就倒下（只有房主會呼叫）
  takeDamage(p, amount) {
    p.hp = Math.max(0, p.hp - amount);
    p.sinceHit = 0;
    p.flash = CONFIG.player.flashTime;
    if (p.hp <= 0) p.dead = true;
  },

  // 小人身體畫在哪個方塊裡（寬 2 格、高 4 格，腳踩在圈上）
  // 畫圖和子彈打中判定都用這個，所以「看起來打到」就是「真的打到」
  bodyRect(p) {
    const S = CONFIG.player.cellSize;
    return { left: p.x - S, top: p.y + 14 - S * 4, width: S * 2, height: S * 4 };
  },

  // ringColor：腳下圈圈的顏色（自己藍色，其他人紅、橘）
  draw(ctx, p, ringColor) {
    const S = CONFIG.player.cellSize;
    const C = CONFIG.colors;
    const facingLeft = Math.cos(p.angle) < 0;

    ctx.save();
    if (p.inGrass) ctx.globalAlpha = CONFIG.grass.selfAlpha;

    // 腳下的圈
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 10, p.r + 2, (p.r + 2) * 0.55, 0, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = ringColor;
    ctx.stroke();

    // 倒下：整個人轉 90 度躺平、變淡
    if (p.dead) {
      ctx.globalAlpha *= 0.6;
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.PI / 2);
      ctx.translate(-p.x, -p.y);
    }

    // 6 格身體
    const body = this.bodyRect(p);
    const left = Math.round(body.left);
    const top = Math.round(body.top);
    for (const cell of PLAYER_CELLS) {
      let col = cell.col;
      if (facingLeft && cell.side) col = 1 - col;   // 面向左邊時鈕扣換到左邊
      const cx = left + col * S;
      const cy = top + cell.row * S;
      ctx.fillStyle = p.flash > 0 ? '#ffffff' : C[cell.color];   // 被打中閃白
      ctx.fillRect(cx, cy, S, S);

      if (cell.eyes && p.flash <= 0) {
        // 眼睛往瞄準的方向看
        const ex = Math.round(Math.cos(p.angle) * 1.5);
        const ey = Math.round(Math.sin(p.angle) * 1.5);
        ctx.fillStyle = C.eyes;
        ctx.fillRect(cx + 2 + ex, cy + 3 + ey, 2, 2);
        ctx.fillRect(cx + 5 + ex, cy + 3 + ey, 2, 2);
      }
    }

    if (p.dead) {
      ctx.restore();
      return;
    }

    // 手（一個小方塊，繞著小人指向滑鼠）
    const hx = p.x + Math.cos(p.angle) * 18;
    const hy = p.y - 2 + Math.sin(p.angle) * 18;
    ctx.fillStyle = C.skin;
    ctx.fillRect(Math.round(hx - 3), Math.round(hy - 3), 6, 6);
    ctx.strokeStyle = '#3a2f22';
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(hx - 3) + 0.5, Math.round(hy - 3) + 0.5, 5, 5);

    ctx.restore();
  },
};
