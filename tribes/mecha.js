// 機甲：拿雙刀近身砍兩下；大招變成旋轉陀螺，可以移動，碰到的人不斷受傷
// 數值在 config.js 的 tribes.mecha

const MECHA = () => CONFIG.tribes.mecha;

addTribe('mecha', {
  name: '機甲',
  desc: '雙刀近身砍兩下（血厚、跑得快）\n大招：變成旋轉陀螺 3 秒',
  colors: { clothes: '#7d8799', button: '#e04b3a', hair: '#3a3f4b' },

  cooldown() {
    return MECHA().cooldown;
  },

  // 普攻：馬上砍第一刀，過一下再砍第二刀
  attack(p) {
    p.attackCharged = false;   // 這一下普攻集過氣了沒（一下普攻最多集 1 次）
    slash(p);
    p.secondSlash = MECHA().slashGap;
  },

  // 大招：開始轉
  super(p) {
    p.spinTime = MECHA().spinTime;
    p.spinTick = 0;
  },

  // 轉的時候不能普攻、不能再放大招
  busy(p) {
    return p.spinTime > 0;
  },

  update(p, dt) {
    const M = MECHA();
    if (p.slashAnim > 0) p.slashAnim -= dt;

    // 第二刀
    if (p.secondSlash > 0) {
      p.secondSlash -= dt;
      if (p.secondSlash <= 0) slash(p);
    }

    // 陀螺：一開始轉就扣一次，之後每 0.25 秒扣一次（3 秒共 12 次，不會集氣）
    if (p.spinTime > 0) {
      p.spinTime -= dt;
      p.spinTick -= dt;
      if (p.spinTime > 0 && p.spinTick <= 0) {
        p.spinTick += M.spinTick;
        for (const target of enemiesOf(p)) {
          if (Math.hypot(target.x - p.x, target.y - p.y) <= M.spinReach + target.r) {
            dealDamage(p, target, M.spinDamage, false);
          }
        }
      }
    }
  },

  // 手上兩把刀；砍的時候畫一道弧；轉的時候畫一圈刀
  drawWeapon(ctx, p) {
    const M = MECHA();
    if (p.spinTime > 0 || p.spinning) {
      // 陀螺：四把刀繞著轉
      const t = performance.now() / 60;
      ctx.strokeStyle = '#d8dde6';
      ctx.lineWidth = 4;
      for (let i = 0; i < 4; i++) {
        const a = t + (i * Math.PI) / 2;
        ctx.beginPath();
        ctx.moveTo(p.x + Math.cos(a) * 14, p.y - 2 + Math.sin(a) * 14);
        ctx.lineTo(p.x + Math.cos(a) * M.spinReach, p.y - 2 + Math.sin(a) * M.spinReach);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y - 2, M.spinReach, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(216, 221, 230, 0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();
      return;
    }

    // 兩把刀：從手往前伸出去
    for (const side of [-1, 1]) {
      const a = p.angle + side * 0.35;
      const hx = p.x + Math.cos(a) * 14;
      const hy = p.y - 2 + Math.sin(a) * 14;
      ctx.strokeStyle = '#3a2f22';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx + Math.cos(p.angle) * 16, hy + Math.sin(p.angle) * 16);
      ctx.stroke();
      ctx.strokeStyle = '#d8dde6';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // 剛砍下去：前面畫一道白色的弧
    if (p.slashAnim > 0) {
      const arc = (M.arc * Math.PI) / 180;
      ctx.beginPath();
      ctx.arc(p.x, p.y - 2, M.reach, p.angle - arc, p.angle + arc);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = 6;
      ctx.stroke();
    }
  },

  // 機器人：要貼上去才砍得到
  bot: { near: 0, far: 40, attackDist: 70, superDist: 60 },
});

// 砍一刀：前面左右各 70 度、60 px 內的人都會被砍到
function slash(p) {
  const M = MECHA();
  p.slashAnim = 0.12;
  const arc = (M.arc * Math.PI) / 180;
  for (const target of enemiesOf(p)) {
    const dx = target.x - p.x;
    const dy = target.y - p.y;
    if (Math.hypot(dx, dy) > M.reach + target.r) continue;
    // 對方在不在前面那個扇形裡
    let diff = Math.atan2(dy, dx) - p.angle;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));   // 換成 -180～180 度
    if (Math.abs(diff) > arc) continue;
    const charge = !p.attackCharged;
    p.attackCharged = true;
    dealDamage(p, target, M.slashDamage, charge);
  }
}
