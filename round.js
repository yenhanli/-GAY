// 回合、比數、倒數、搶三
// 只有房主會跑 update；對手那台直接用房主送來的資料蓋掉這裡的值，照著畫

const Round = {
  phase: 'countdown',   // 'countdown' 倒數、'fight' 開打、'roundEnd' 這回合結束、'matchEnd' 整局結束
  timer: 0,             // 這個階段還剩幾秒
  scores: { host: 0, guest: 0 },
  zone: 0,              // 安全區大小（六角形中心到角）
  roundWinner: null,    // 這回合誰贏：'host'、'guest'，平手不算就是 null
  reason: '',           // 怎麼結束的：'ko' 有人倒下、'time' 時間到
  matchWinner: null,    // 整局誰贏
  rematch: { host: false, guest: false },   // 誰按了「再來一局」

  // 整局重來：比數歸零
  resetMatch() {
    this.scores = { host: 0, guest: 0 };
    this.matchWinner = null;
    this.rematch = { host: false, guest: false };
    this.startRound();
  },

  // 開新的一回合：大家回出生點、血補滿，倒數 3 秒
  startRound() {
    resetField();   // 在 main.js
    this.phase = 'countdown';
    this.timer = CONFIG.round.countdown;
    this.zone = CONFIG.arena.radius;
    this.roundWinner = null;
    this.reason = '';
  },

  update(dt) {
    this.timer -= dt;

    if (this.phase === 'countdown') {
      if (this.timer <= 0) {
        this.phase = 'fight';
        this.timer = CONFIG.round.time;
      }
    } else if (this.phase === 'fight') {
      this.updateZone(dt);
      this.checkRoundOver();
    } else if (this.phase === 'roundEnd') {
      if (this.timer <= 0) {
        const W = CONFIG.round.winsNeeded;
        if (this.scores.host >= W || this.scores.guest >= W) {
          this.phase = 'matchEnd';
          this.matchWinner = this.scores.host >= W ? 'host' : 'guest';
        } else {
          this.startRound();
        }
      }
    }
  },

  // 最後 15 秒縮圈；站在圈外的人每秒扣血
  updateZone(dt) {
    const R = CONFIG.arena.radius;
    const start = CONFIG.round.zoneStart;
    if (this.timer > start) {
      this.zone = R;
      return;
    }
    const t = 1 - Math.max(0, this.timer) / start;   // 0 → 1
    this.zone = R + (CONFIG.round.zoneEndRadius - R) * t;

    for (const p of Object.values(players)) {
      if (p.dead || Arena.insideHex(p.x, p.y, 0, this.zone)) continue;
      p.hp -= CONFIG.round.zoneDamage * dt;
      p.sinceHit = 0;   // 在圈外不會回血
      if (p.hp <= 0) {
        p.hp = 0;
        p.dead = true;
      }
    }
  },

  checkRoundOver() {
    const h = players.host;
    const g = players.guest;

    if (h.dead || g.dead) {
      // 兩個同時倒下就不算
      this.endRound(h.dead && g.dead ? null : h.dead ? 'guest' : 'host', 'ko');
    } else if (this.timer <= 0) {
      // 時間到：比剩下的血％，一樣多就不算
      const hp = Math.round((h.hp / h.maxHp) * 100);
      const gp = Math.round((g.hp / g.maxHp) * 100);
      this.endRound(hp === gp ? null : hp > gp ? 'host' : 'guest', 'time');
    }
  },

  endRound(winner, reason) {
    this.phase = 'roundEnd';
    this.timer = CONFIG.round.between;
    this.roundWinner = winner;
    this.reason = reason;
    if (winner) this.scores[winner] += 1;
  },

  // 有人按了「再來一局」；兩個都按了就重開
  pressRematch(id) {
    if (this.phase !== 'matchEnd') return;
    this.rematch[id] = true;
    if (this.rematch.host && this.rematch.guest) this.resetMatch();
  },

  // 打包給對手那台
  pack() {
    return {
      phase: this.phase,
      timer: Math.round(this.timer * 10) / 10,
      scores: this.scores,
      zone: Math.round(this.zone),
      roundWinner: this.roundWinner,
      reason: this.reason,
      matchWinner: this.matchWinner,
      rematch: this.rematch,
    };
  },
};
