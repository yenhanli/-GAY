// 子彈：飛行、打到牆或人就消失
//
// 子彈有兩種 kind：
//   'basic'   一般子彈：大小、傷害都固定（config.js 的 attack、super）
//   'energy'  未來科技的能量砲：飛越遠越大顆、越痛（config.js 的 tribes.future）

const Bullets = {
  list: [],   // 場上所有子彈

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

  // targets：可以被打中的小人（對手那台傳空的，因為打中誰由房主決定）
  // onHit(子彈, 被打中的小人)：打中時要做什麼
  update(dt, targets, onHit) {
    for (const b of this.list) {
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
            if (p.id === b.owner) continue;
            // 子彈這個小方塊有沒有碰到小人畫出來的身體
            const body = Player.bodyRect(p);
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
