// 未來科技：能量砲直線射，飛越遠子彈越大顆、越痛
// 大招：變身機甲 6 秒，多一條護盾，普攻變成鋸子（自動一直嚕前面的人）
// 數值在 config.js 的 tribes.future

const FUTURE = () => CONFIG.tribes.future;

addTribe('future', {
  name: '未來科技',
  desc: '能量砲：飛越遠越大顆、越痛\n大招：變身機甲 6 秒，有護盾、鋸子嚕人',
  colors: { clothes: '#5b3fa8', button: '#7fe3ff', hair: '#e8e8f0' },

  cooldown() {
    return FUTURE().cooldown;
  },

  attack(p) {
    Bullets.spawn(p, p.angle, false, 'energy');
  },

  // 大招：變身
  super(p) {
    p.mechTime = FUTURE().mechTime;
    p.shield = FUTURE().shield;
    p.sawTick = 0;
  },

  // 變身時不能射能量砲、不能再放大招（鋸子會自己嚕）
  busy(p) {
    return p.mechTime > 0;
  },

  update(p, dt) {
    const F = FUTURE();
    if (!(p.mechTime > 0)) return;

    p.mechTime -= dt;
    if (p.mechTime <= 0) {
      p.shield = 0;   // 變回來，護盾沒了
      return;
    }

    // 鋸子：每 0.3 秒嚕一次前面的人（不會集氣）
    p.sawTick -= dt;
    if (p.sawTick <= 0) {
      p.sawTick += F.sawTick;
      const arc = (F.sawArc * Math.PI) / 180;
      for (const target of enemiesOf(p)) {
        const dx = target.x - p.x;
        const dy = target.y - p.y;
        if (Math.hypot(dx, dy) > F.sawReach + target.r) continue;
        let diff = Math.atan2(dy, dx) - p.angle;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));   // 換成 -180～180 度
        if (Math.abs(diff) > arc) continue;
        dealDamage(p, target, F.sawDamage, false);
      }
    }
  },

  drawWeapon(ctx, p) {
    const F = FUTURE();
    if (p.mechTime > 0 || p.mech) {
      // 機甲外殼：身體外面一圈青色的框
      const body = Player.bodyRect(p);
      ctx.strokeStyle = '#7fe3ff';
      ctx.lineWidth = 3;
      ctx.strokeRect(body.left - 4, body.top - 4, body.width + 8, body.height + 8);

      // 鋸子：前面一個會轉的圓鋸
      const sx = p.x + Math.cos(p.angle) * 30;
      const sy = p.y - 2 + Math.sin(p.angle) * 30;
      const spin = performance.now() / 40;
      ctx.fillStyle = '#c9ced8';
      ctx.beginPath();
      ctx.arc(sx, sy, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3a2f22';
      for (let i = 0; i < 6; i++) {
        const a = spin + (i * Math.PI) / 3;
        ctx.fillRect(Math.round(sx + Math.cos(a) * 11) - 2, Math.round(sy + Math.sin(a) * 11) - 2, 4, 4);
      }
      ctx.beginPath();
      ctx.arc(sx, sy, 3, 0, Math.PI * 2);
      ctx.fill();
      // 嚕得到的範圍（淡淡的扇形）
      const arc = (F.sawArc * Math.PI) / 180;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - 2);
      ctx.arc(p.x, p.y - 2, F.sawReach, p.angle - arc, p.angle + arc);
      ctx.closePath();
      ctx.fillStyle = 'rgba(127, 227, 255, 0.15)';
      ctx.fill();
      return;
    }

    // 平常：手上一支能量砲（紫色長方塊，前端發光）
    const hx = p.x + Math.cos(p.angle) * 16;
    const hy = p.y - 2 + Math.sin(p.angle) * 16;
    ctx.strokeStyle = '#3a2f22';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(hx - Math.cos(p.angle) * 4, hy - Math.sin(p.angle) * 4);
    ctx.lineTo(hx + Math.cos(p.angle) * 10, hy + Math.sin(p.angle) * 10);
    ctx.stroke();
    ctx.strokeStyle = '#5b3fa8';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = '#a8fff4';
    ctx.fillRect(Math.round(hx + Math.cos(p.angle) * 10) - 2, Math.round(hy + Math.sin(p.angle) * 10) - 2, 4, 4);
  },

  // 機器人：平常站遠一點射（越遠越痛）；變身後衝上去嚕
  bot(p) {
    if (p.mechTime > 0 || p.mech) return { near: 0, far: 30, attackDist: 0, superDist: 0 };
    return { near: 220, far: 380, attackDist: FUTURE().range - 10, superDist: 400 };
  },
});
