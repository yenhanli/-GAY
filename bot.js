// 練習模式的機器人
//
// 機器人跟真人一樣，是「按按鍵」來控制小人：每隔一小段時間想一下要往哪走、瞄哪裡、要不要開槍，
// 把結果寫進自己的 input（格式跟 Input 一樣），再交給 Player.update。所以規則跟真人完全一樣。
// 會用到 main.js 的 players、activeIds()、canSee()，和 round.js 的 Round

const Bots = {
  brains: {},   // id → 機器人的腦袋

  // 開打時：除了自己（p0）以外都是機器人
  setup(ids) {
    this.brains = {};
    for (const id of ids) {
      if (id === 'p0') continue;
      this.brains[id] = {
        id,
        input: emptyInput(),
        think: 0,                               // 還要等幾秒才再想一次
        strafe: Math.random() < 0.5 ? 1 : -1,   // 繞圈往左還是往右
        strafeTimer: 0,
        seenTime: 0,                            // 看到目標多久了（反應時間用）
        escape: null,                           // 卡牆時暫時亂走的方向
        escapeTimer: 0,
        stuck: 0,
        lastX: 0,
        lastY: 0,
        wander: null,                           // 沒看到人時要去的地方
        wanderTimer: 0,
      };
    }
  },

  isBot(id) {
    return !!this.brains[id];
  },

  inputOf(id) {
    return this.brains[id].input;
  },

  update(dt) {
    for (const brain of Object.values(this.brains)) {
      const me = players[brain.id];
      if (!me || me.dead || me.left) continue;
      brain.think -= dt;
      if (brain.think > 0) continue;   // 還沒到要想的時候，維持剛剛的按鍵
      brain.think = CONFIG.bot.thinkEvery;
      this.think(brain, me, CONFIG.bot.thinkEvery);
    }
  },

  think(brain, me, step) {
    const input = brain.input;
    const R = CONFIG.arena.radius;

    // 1. 找目標：看得到、還站著、最近的人
    let target = null;
    let best = Infinity;
    for (const id of activeIds()) {
      const p = players[id];
      if (p === me || p.dead || !canSee(me, p)) continue;
      const d = Math.hypot(p.x - me.x, p.y - me.y);
      if (d < best) {
        best = d;
        target = p;
      }
    }
    if (target && brain.target === target.id) brain.seenTime += step;
    else brain.seenTime = 0;
    brain.target = target ? target.id : null;

    // 2. 決定往哪走（vx, vy）
    let vx = 0;
    let vy = 0;
    const outsideZone = Round.zone < R && !Arena.insideHex(me.x, me.y, 40, Round.zone);
    if (outsideZone) {
      // 被縮圈：先往中間跑
      vx = -me.x;
      vy = -me.y;
    } else if (target) {
      // 有目標：保持一段距離，左右繞著閃子彈
      const ux = (target.x - me.x) / best;
      const uy = (target.y - me.y) / best;
      const [near, far] = CONFIG.bot.preferRange;
      const forward = best > far ? 1 : best < near ? -1 : 0;
      brain.strafeTimer -= step;
      if (brain.strafeTimer <= 0) {
        brain.strafe = -brain.strafe;
        brain.strafeTimer = 0.8 + Math.random() * 1.2;
      }
      vx = ux * forward - uy * brain.strafe * 0.8;
      vy = uy * forward + ux * brain.strafe * 0.8;
    } else {
      // 沒看到人：隨便走走，大概往中間
      brain.wanderTimer -= step;
      if (!brain.wander || brain.wanderTimer <= 0) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 220;
        brain.wander = { x: Math.cos(a) * r, y: Math.sin(a) * r };
        brain.wanderTimer = 2 + Math.random() * 2;
      }
      vx = brain.wander.x - me.x;
      vy = brain.wander.y - me.y;
      if (Math.hypot(vx, vy) < 30) vx = vy = 0;
    }

    // 卡牆了（想走卻沒動）：往隨便一個方向走一下
    const moved = Math.hypot(me.x - brain.lastX, me.y - brain.lastY);
    brain.lastX = me.x;
    brain.lastY = me.y;
    if ((vx || vy) && moved < 2) brain.stuck += step;
    else brain.stuck = 0;
    if (brain.stuck > 0.3) {
      const a = Math.random() * Math.PI * 2;
      brain.escape = { x: Math.cos(a), y: Math.sin(a) };
      brain.escapeTimer = 0.6;
      brain.stuck = 0;
    }
    if (brain.escapeTimer > 0) {
      brain.escapeTimer -= step;
      vx = brain.escape.x;
      vy = brain.escape.y;
    }

    // 方向 → WASD
    const len = Math.hypot(vx, vy) || 1;
    input.right = vx / len > 0.35;
    input.left = vx / len < -0.35;
    input.down = vy / len > 0.35;
    input.up = vy / len < -0.35;

    // 3. 瞄準和開槍
    if (target) {
      // 瞄準會偏一點點，不然太準了打不贏
      const err = ((Math.random() * 2 - 1) * CONFIG.bot.aimError * Math.PI) / 180;
      const a = Math.atan2(target.y - me.y, target.x - me.x) + err;
      input.mouseX = me.x + Math.cos(a) * best;
      input.mouseY = me.y + Math.sin(a) * best;

      const canShoot = brain.seenTime >= CONFIG.bot.reaction && clearShot(me, target);
      if (canShoot && best < CONFIG.attack.range - 10) input.shootPressed = true;
      if (canShoot && best < 260 && me.super >= CONFIG.super.hitsToCharge) input.superPressed = true;
    } else {
      // 沒目標就看著走的方向
      input.mouseX = me.x + vx;
      input.mouseY = me.y + vy;
    }
  },
};

// 從 a 到 b 中間有沒有牆擋住
function clearShot(a, b) {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.ceil(d / 10);
  for (let i = 1; i < steps; i++) {
    const x = a.x + ((b.x - a.x) * i) / steps;
    const y = a.y + ((b.y - a.y) * i) / steps;
    if (Arena.blocked(x, y, 4)) return false;
  }
  return true;
}
