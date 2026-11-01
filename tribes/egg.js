// EGG 蛋：丟蛋（拋物線、可以丟過牆），落地砸到附近的人
// 沒有大招，劑量條就是它的大招：砸中 3 次劑量滿，下一顆蛋
//   打中人 → 雙倍傷害；沒打中 → 在落點孵出一隻小生物去咬人
// 數值在 config.js 的 tribes.egg

const EGG = () => CONFIG.tribes.egg;

addTribe('egg', {
  name: 'EGG 蛋',
  desc: '丟蛋（拋物線、可以丟過牆）\n劑量滿：下一顆打中雙倍，沒中孵小生物',
  colors: { clothes: '#f2e6b8', button: '#ff9f1a', hair: '#fff7d6' },
  superLabel: { name: '劑量', ready: '劑量滿！下一顆蛋加強' },

  cooldown() {
    return EGG().cooldown;
  },

  // 丟到滑鼠點的地方，太遠就丟到最遠能到的地方
  attack(p) {
    const E = EGG();
    let dx = p.aimX - p.x;
    let dy = p.aimY - p.y;
    const d = Math.hypot(dx, dy);
    if (d > E.throwRange) {
      dx *= E.throwRange / d;
      dy *= E.throwRange / d;
    }
    // 劑量滿了：這顆是加強的蛋，劑量歸零
    const boosted = p.super >= p.superMax;
    if (boosted) p.super = 0;
    Bullets.spawnEgg(p, p.x + dx, p.y + dy, boosted);
  },

  // 沒有 super：按右鍵沒有用

  // 手上拿著一顆蛋
  drawWeapon(ctx, p) {
    const hx = p.x + Math.cos(p.angle) * 16;
    const hy = p.y - 2 + Math.sin(p.angle) * 16;
    const full = p.super >= p.superMax;
    ctx.fillStyle = '#3a2f22';
    ctx.beginPath();
    ctx.ellipse(hx, hy, 6, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = full ? '#9dff7a' : '#fffbea';
    ctx.beginPath();
    ctx.ellipse(hx, hy, 4, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  },

  // 機器人：中距離丟，蛋會飛過牆所以不用管有沒有牆擋
  bot: { near: 180, far: 320, attackDist: 400, superDist: 0, lob: true },
});

// 蛋落地（只有房主會算）
function eggLanded(b) {
  const E = EGG();
  const thrower = players[b.owner];
  if (!thrower) return;
  const dmg = b.boosted ? E.damage * E.boostedMul : E.damage;
  let hitPlayer = false;
  for (const target of enemiesOf(thrower)) {
    if (Math.hypot(target.x - b.tx, target.y - b.ty) > E.splashRadius) continue;
    // 一顆蛋砸中人只集 1 格劑量；加強的蛋不集
    const charge = !b.boosted && !hitPlayer && target.type === 'player';
    if (target.type === 'player') hitPlayer = true;
    dealDamage(thrower, target, dmg, charge);
  }
  // 加強的蛋沒砸到人 → 孵出小生物
  if (b.boosted && !hitPlayer) Critters.spawn(b.owner, b.tx, b.ty);
}

// ===== 小生物 =====
// 會追最近的敵人、貼上去咬；活 5 秒，也可以被打死

const Critters = {
  list: [],
  nextId: 1,

  spawn(owner, x, y) {
    const E = EGG();
    // 落點如果在牆裡（蛋可以丟過牆），往丟的人那邊一步一步找空位
    const from = players[owner];
    for (let i = 0; i < 60 && Arena.blocked(x, y, 8) && from; i++) {
      const a = Math.atan2(from.y - y, from.x - x);
      x += Math.cos(a) * 10;
      y += Math.sin(a) * 10;
    }
    this.list.push({
      type: 'critter',
      id: 'c' + this.nextId++,
      owner,
      x,
      y,
      r: 8,
      hp: E.critterHp,
      life: E.critterLife,
      bite: 0,     // 距離下一口還有幾秒
      angle: 0,
    });
  },

  // 只有房主會跑
  update(dt) {
    const E = EGG();
    for (const c of this.list) {
      c.life -= dt;
      // 找最近、還站著的敵人（不咬自己人）
      let target = null;
      let best = Infinity;
      for (const id of activeIds()) {
        const p = players[id];
        if (p.id === c.owner || p.dead) continue;
        const d = Math.hypot(p.x - c.x, p.y - c.y);
        if (d < best) {
          best = d;
          target = p;
        }
      }
      if (!target) continue;
      c.angle = Math.atan2(target.y - c.y, target.x - c.x);

      if (best > 22) {
        // 要往哪走：中間沒牆就直直衝過去；有牆就用找路（每 0.25 秒重算一次）
        c.repath = (c.repath || 0) - dt;
        if (c.repath <= 0) {
          c.repath = 0.25;
          c.goal = clearShot(c, target) ? null : Arena.pathStep(c.x, c.y, target.x, target.y, c.r);
        }
        const gx = c.goal ? c.goal.x : target.x;
        const gy = c.goal ? c.goal.y : target.y;
        const heading = Math.atan2(gy - c.y, gx - c.x);
        // 走過去：還是撞到牆的話就試著往旁邊滑
        const step = E.critterSpeed * dt;
        if (!c.side) c.side = Math.random() < 0.5 ? 1 : -1;
        const tries = [0, 0.8, -0.8, Math.PI / 2, -Math.PI / 2].map((a) => heading + a * c.side);
        for (const a of tries) {
          const nx = c.x + Math.cos(a) * step;
          const ny = c.y + Math.sin(a) * step;
          if (!Arena.blocked(nx, ny, c.r)) {
            c.x = nx;
            c.y = ny;
            break;
          }
        }
      } else {
        // 貼到了：咬
        c.bite -= dt;
        if (c.bite <= 0) {
          c.bite = E.critterBiteEvery;
          dealDamage(players[c.owner], target, E.critterBite, false);
        }
      }
    }
    this.list = this.list.filter((c) => c.life > 0 && c.hp > 0);
  },

  // 小雞：黃色身體、橘色嘴巴朝著要咬的人，腳下一圈是主人的顏色，頭上小血條
  draw(ctx) {
    const E = EGG();
    for (const c of this.list) {
      const color = Hud.colorOf(c.owner);
      ctx.beginPath();
      ctx.ellipse(c.x, c.y + 6, 10, 5, 0, 0, Math.PI * 2);
      ctx.strokeStyle = color.ring;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#3a2f22';
      ctx.fillRect(Math.round(c.x - 8), Math.round(c.y - 10), 16, 16);
      ctx.fillStyle = '#ffe14d';
      ctx.fillRect(Math.round(c.x - 6), Math.round(c.y - 8), 12, 12);
      ctx.fillStyle = '#ff8c1a';
      ctx.fillRect(Math.round(c.x + Math.cos(c.angle) * 8) - 2, Math.round(c.y - 2 + Math.sin(c.angle) * 8) - 2, 4, 4);
      ctx.fillStyle = '#1b1b1b';
      ctx.fillRect(Math.round(c.x - 3), Math.round(c.y - 5), 2, 2);
      ctx.fillRect(Math.round(c.x + 2), Math.round(c.y - 5), 2, 2);
      // 血條
      ctx.fillStyle = '#3a2f22';
      ctx.fillRect(Math.round(c.x - 9), Math.round(c.y - 17), 18, 4);
      ctx.fillStyle = color.bar;
      ctx.fillRect(Math.round(c.x - 8), Math.round(c.y - 16), Math.round(16 * Math.max(0, c.hp) / E.critterHp), 2);
    }
  },
};
