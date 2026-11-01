// 子彈：飛行、打到牆或人就消失
//
// 子彈有三種 kind：
//   'basic'   一般子彈：大小、傷害都固定（config.js 的 attack、super）
//   'energy'  未來科技的能量砲：飛越遠越大顆、越痛（config.js 的 tribes.future）
//   'egg'     EGG 蛋丟的蛋：走拋物線、飛過牆，落地才砸人（config.js 的 tribes.egg）

const Bullets = {
  list: [],   // 場上所有子彈
  nextEggId: 1,
  landed: new Set(),   // 已經落地的蛋（對手那台用來避免同一顆蛋砸兩次的特效）

  // shooter 往 angle 方向射一發（沒給 angle 就是他面向的方向）
  // isSuper：是不是大招的子彈（大招打中不會再集氣）
  spawn(shooter, angle = shooter.angle, isSuper = false, kind = 'basic') {
    const a = angle;
    const speed = kind === 'energy' ? CONFIG.tribes.future.bulletSpeed : CONFIG.attack.bulletSpeed;
    this.list.push({
      type: 'bullet',
      kind,
      owner: shooter.id,               // 誰射的（不會打到自己）
      x: shooter.x + Math.cos(a) * 18, // 從手的位置射出去
      y: shooter.y + Math.sin(a) * 18,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      traveled: 0,                     // 已經飛了多遠
      isSuper,
    });
  },

  // 丟一顆蛋到 (tx, ty)；boosted：劑量滿的那顆
  spawnEgg(shooter, tx, ty, boosted) {
    this.list.push({
      type: 'bullet',
      kind: 'egg',
      id: shooter.id + '-' + this.nextEggId++,
      owner: shooter.id,
      sx: shooter.x,   // 從哪裡丟
      sy: shooter.y,
      tx,              // 落在哪裡
      ty,
      x: shooter.x,
      y: shooter.y,
      t: 0,            // 飛了幾秒
      boosted,
    });
  },

  // 大招：一次射好幾發，排成扇形（例如 5 發、左右各 30 度 → 每發差 15 度）
  spawnFan(shooter) {
    const n = CONFIG.super.bullets;
    const spread = (CONFIG.super.spread * Math.PI) / 180;
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1) * 2 - 1;   // -1 到 1
      this.spawn(shooter, shooter.angle + t * spread, true);
    }
  },

  // 這顆子彈最遠飛多遠
  rangeOf(b) {
    return b.kind === 'energy' ? CONFIG.tribes.future.range : CONFIG.attack.range;
  },

  // 飛了多遠的比例：0 剛射出，1 到射程盡頭
  progress(b) {
    return Math.min(1, b.traveled / this.rangeOf(b));
  },

  // 現在多大顆
  sizeOf(b) {
    if (b.kind !== 'energy') return CONFIG.attack.bulletSize;
    const F = CONFIG.tribes.future;
    return F.sizeMin + (F.sizeMax - F.sizeMin) * this.progress(b);
  },

  // 打中的話扣多少
  damageOf(b) {
    if (b.kind === 'energy') {
      const F = CONFIG.tribes.future;
      return Math.round(F.damageMin + (F.damageMax - F.damageMin) * this.progress(b));
    }
    return b.isSuper ? CONFIG.super.damage : CONFIG.attack.damage;
  },

  // 被打的東西（小人或小生物）身上哪個方塊算打中
  hitBoxOf(t) {
    if (t.type === 'critter') return { left: t.x - 8, top: t.y - 10, width: 16, height: 16 };
    return Player.bodyRect(t);
  },

  // targets：可以被打中的小人和小生物（對手那台傳空的，因為打中誰由房主決定）
  // onHit(子彈, 被打中的東西)：打中時要做什麼
  // onLand(蛋)：蛋落地時要做什麼（只有房主會給）
  update(dt, targets, onHit, onLand) {
    for (const b of this.list) {
      if (b.kind === 'egg') {
        // 蛋：照時間沿直線往落點移動（高度只是畫的），不會撞牆
        b.t += dt;
        const k = Math.min(1, b.t / CONFIG.tribes.egg.flightTime);
        b.x = b.sx + (b.tx - b.sx) * k;
        b.y = b.sy + (b.ty - b.sy) * k;
        if (k >= 1) {
          b.dead = true;
          this.landed.add(b.id);
          if (this.landed.size > 200) this.landed.clear();   // 太多了就清掉，舊的蛋早就不會再出現
          Hud.addSplash(b.tx, b.ty, CONFIG.tribes.egg.splashRadius, b.boosted);
          if (onLand) onLand(b);
        }
        continue;
      }

      // 一次最多飛 10 px，才不會一下子穿過牆
      const dist = Math.hypot(b.vx, b.vy) * dt;
      const steps = Math.max(1, Math.ceil(dist / 10));
      for (let i = 0; i < steps && !b.dead; i++) {
        b.x += (b.vx * dt) / steps;
        b.y += (b.vy * dt) / steps;
        b.traveled += dist / steps;
        const half = this.sizeOf(b) / 2;

        if (b.traveled >= this.rangeOf(b)) b.dead = true;         // 飛到射程
        else if (Arena.blocked(b.x, b.y, half)) b.dead = true;     // 打到牆或邊界
        else {
          for (const p of targets) {
            if (p.id === b.owner || p.owner === b.owner) continue;   // 不打自己、不打自己的小生物
            // 子彈這個小方塊有沒有碰到小人畫出來的身體
            const body = this.hitBoxOf(p);
            const hit = b.x + half > body.left && b.x - half < body.left + body.width &&
                        b.y + half > body.top && b.y - half < body.top + body.height;
            if (hit) {
              b.dead = true;
              if (onHit) onHit(b, p);
              break;
            }
          }
        }
      }
    }
    // 把消失的子彈清掉
    this.list = this.list.filter((b) => !b.dead);
  },

  // 子彈用開槍那個人的顏色（自己藍色）；大招的子彈是金色，外框用他的顏色
  // 能量砲是發光的青色圓球，外圈用開槍那個人的顏色
  draw(ctx) {
    for (const b of this.list) {
      const color = Hud.colorOf(b.owner);
      if (b.kind === 'egg') {
        drawEgg(ctx, b, color);
        continue;
      }
      const s = this.sizeOf(b);
      if (b.kind === 'energy') {
        ctx.beginPath();
        ctx.arc(b.x, b.y, s / 2 + 2, 0, Math.PI * 2);
        ctx.fillStyle = color.ring;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(b.x, b.y, s / 2, 0, Math.PI * 2);
        ctx.fillStyle = '#a8fff4';
        ctx.fill();
        continue;
      }
      ctx.fillStyle = b.isSuper ? color.ring : '#3a2f22';
      ctx.fillRect(Math.round(b.x - s / 2) - 2, Math.round(b.y - s / 2) - 2, s + 4, s + 4);
      ctx.fillStyle = b.isSuper ? '#ffe066' : color.bullet;
      ctx.fillRect(Math.round(b.x - s / 2), Math.round(b.y - s / 2), s, s);
    }
  },
};

// 畫一顆飛在空中的蛋：地上一個影子，蛋本身照拋物線抬高；劑量滿的蛋是綠色發光的
function drawEgg(ctx, b, color) {
  const E = CONFIG.tribes.egg;
  const k = Math.min(1, b.t / E.flightTime);
  const h = Math.sin(Math.PI * k) * E.arcHeight;
  // 影子
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.beginPath();
  ctx.ellipse(b.x, b.y, 7, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  // 落點的圈（讓被丟的人看得到要躲哪裡）
  ctx.strokeStyle = b.boosted ? 'rgba(120, 255, 120, 0.6)' : 'rgba(255, 255, 255, 0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(b.tx, b.ty, E.splashRadius, 0, Math.PI * 2);
  ctx.stroke();
  // 蛋
  ctx.fillStyle = color.ring;
  ctx.beginPath();
  ctx.ellipse(b.x, b.y - h, 7, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = b.boosted ? '#9dff7a' : '#fffbea';
  ctx.beginPath();
  ctx.ellipse(b.x, b.y - h, 5, 7, 0, 0, Math.PI * 2);
  ctx.fill();
}
