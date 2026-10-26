// 回合、比數、倒數、搶三（亂鬥是搶二）
// 只有房主會跑 update；對手那台直接用房主送來的資料蓋掉這裡的值，照著畫
// 會用到 main.js 的 players、ids、activeIds()、gameMode、resetField()

const Round = {
  phase: 'countdown',   // 'countdown' 倒數、'fight' 開打、'roundEnd' 這回合結束、'matchEnd' 整局結束
  timer: 0,             // 這個階段還剩幾秒
  scores: {},           // id → 贏了幾回合
  zone: 0,              // 安全區大小（六角形中心到角）
  roundWinner: null,    // 這回合誰贏（id），平手不算就是 null
  reason: '',           // 怎麼結束的：'ko' 有人倒下、'time' 時間到
  matchWinner: null,    // 整局誰贏
  rematch: {},          // id → 有沒有按「再來一局」

  // 贏幾回合就贏整局
  winsNeeded() {
    return gameMode === 'ffa' ? CONFIG.round.winsNeededFFA : CONFIG.round.winsNeeded;
  },

  // 整局重來：比數歸零
  resetMatch() {
    this.scores = {};
    for (const id of ids) this.scores[id] = 0;
    this.matchWinner = null;
    this.rematch = {};
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
        const winner = Object.keys(this.scores).find((id) => this.scores[id] >= this.winsNeeded());
        if (winner) {
          this.phase = 'matchEnd';
          this.matchWinner = winner;
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
    const alive = activeIds().filter((id) => !players[id].dead);

    if (alive.length <= 1) {
      // 只剩一個人站著就是他贏；同時全倒就不算
      this.endRound(alive.length === 1 ? alive[0] : null, 'ko');
    } else if (this.timer <= 0) {
      // 時間到：還站著的人比血％，最多的贏；最多的不只一個就不算
      const pct = (id) => Math.round((players[id].hp / players[id].maxHp) * 100);
      const best = Math.max(...alive.map(pct));
      const top = alive.filter((id) => pct(id) === best);
      this.endRound(top.length === 1 ? top[0] : null, 'time');
    }
  },

  endRound(winner, reason) {
    this.phase = 'roundEnd';
    this.timer = CONFIG.round.between;
    this.roundWinner = winner;
    this.reason = reason;
    if (winner) this.scores[winner] += 1;
  },

  // 有人按了「再來一局」；還在的人都按了就重開
  pressRematch(id) {
    if (this.phase !== 'matchEnd') return;
    this.rematch[id] = true;
    if (activeIds().every((pid) => this.rematch[pid])) this.resetMatch();
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
