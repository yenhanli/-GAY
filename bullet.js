// 子彈：飛行、打到牆或人就消失

const Bullets = {
  list: [],   // 場上所有子彈

  // shooter 往他面向的方向射一發
  spawn(shooter) {
    const a = shooter.angle;
    const speed = CONFIG.attack.bulletSpeed;
    this.list.push({
      type: 'bullet',
      owner: shooter.id,               // 誰射的（不會打到自己）
      x: shooter.x + Math.cos(a) * 18, // 從手的位置射出去
      y: shooter.y + Math.sin(a) * 18,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      traveled: 0,                     // 已經飛了多遠
    });
  },

  // targets：可以被打中的小人（對手那台傳空的，因為打中誰由房主決定）
  // onHit(子彈, 被打中的小人)：打中時要做什麼（扣血是 M4）
  update(dt, targets, onHit) {
    const size = CONFIG.attack.bulletSize;
    for (const b of this.list) {
      // 一次最多飛 10 px，才不會一下子穿過牆
      const dist = Math.hypot(b.vx, b.vy) * dt;
      const steps = Math.max(1, Math.ceil(dist / 10));
      for (let i = 0; i < steps && !b.dead; i++) {
        b.x += (b.vx * dt) / steps;
        b.y += (b.vy * dt) / steps;
        b.traveled += dist / steps;

        if (b.traveled >= CONFIG.attack.range) b.dead = true;          // 飛到射程
        else if (Arena.blocked(b.x, b.y, size / 2)) b.dead = true;     // 打到牆或邊界
        else {
          for (const p of targets) {
            if (p.id === b.owner) continue;
            // 子彈這個小方塊有沒有碰到小人畫出來的身體
            const body = Player.bodyRect(p);
            const half = size / 2;
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

  // myId：自己的子彈畫藍色、對手的畫紅色
  draw(ctx, myId) {
    const s = CONFIG.attack.bulletSize;
    for (const b of this.list) {
      ctx.fillStyle = '#3a2f22';
      ctx.fillRect(Math.round(b.x - s / 2) - 2, Math.round(b.y - s / 2) - 2, s + 4, s + 4);
      ctx.fillStyle = b.owner === myId ? '#8fd3ff' : '#ff7a5a';
      ctx.fillRect(Math.round(b.x - s / 2), Math.round(b.y - s / 2), s, s);
    }
  },
};
