// 畫面上的資訊：頭上血條、打中時飄的數字、比數、大字、大招氣條

// 每個人的顏色：自己永遠是第一組（藍），其他人照順序拿紅、橘
const PLAYER_COLORS = [
  { name: '你', ring: '#2f7bff', bar: '#4fd34f', bullet: '#8fd3ff', dot: '#2f7bff' },
  { name: '紅色', ring: '#ff3b3b', bar: '#ff4b4b', bullet: '#ff7a5a', dot: '#ff3b3b' },
  { name: '橘色', ring: '#ff9f1a', bar: '#ffa93a', bullet: '#ffc04d', dot: '#ff9f1a' },
];

const Hud = {
  popups: [],   // 飄在空中的字，例如「-20」
  colorIndex: {},   // id → 用第幾組顏色
  myOrder: [],      // 自己排第一個的 id 順序

  // 開打時決定誰是什麼顏色
  setupColors(ids, myId) {
    this.myOrder = [myId, ...ids.filter((id) => id !== myId)];
    this.colorIndex = {};
    this.myOrder.forEach((id, i) => (this.colorIndex[id] = i));
  },

  colorOf(id) {
    return PLAYER_COLORS[this.colorIndex[id] || 0];
  },

  order() {
    return this.myOrder;
  },

  // 在 (x, y) 飄一個字
  addPopup(x, y, text) {
    this.popups.push({ x, y, text, time: 0 });
  },

  update(dt) {
    for (const p of this.popups) {
      p.time += dt;
      p.y -= 40 * dt;          // 慢慢往上飄
    }
    this.popups = this.popups.filter((p) => p.time < 0.8);   // 0.8 秒後消失
  },

  // 小人頭上的血條；color：自己綠色、其他人用自己的顏色
  drawHealthBar(ctx, p, color) {
    if (p.dead) return;
    const w = 36;
    const h = 6;
    const x = Math.round(p.x - w / 2);
    const y = Math.round(Player.bodyRect(p).top - 12);
    const ratio = Math.max(0, p.hp) / p.maxHp;

    ctx.save();
    if (p.inGrass) ctx.globalAlpha = CONFIG.grass.selfAlpha;
    ctx.fillStyle = '#3a2f22';                    // 黑框
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = '#5a4a3a';                    // 空掉的部分
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;                        // 剩下的血
    ctx.fillRect(x, y, Math.round(w * ratio), h);
    ctx.restore();
  },

  // 上方中間：比數（自己藍點在左，其他人在右）＋回合剩幾秒
  // 這個跟下面的大字都畫在「畫面座標」，左上角是 (0,0)
  drawScore(ctx) {
    const W = Round.winsNeeded();
    const cx = ctx.canvas.width / 2;
    const y = 30;
    const [me, ...others] = this.myOrder;
    const groupW = W * 26;
    const leftEdge = cx - 50 - groupW;
    const rightEdge = cx + 50 + others.length * groupW + (others.length - 1) * 24;

    ctx.save();
    ctx.fillStyle = 'rgba(20, 22, 32, 0.75)';
    ctx.fillRect(leftEdge - 14, 6, rightEdge - leftEdge + 28, 48);

    // 圓點：贏幾回合就塗滿幾顆
    const dot = (x, filled, color) => {
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = color;
      ctx.stroke();
      if (filled) {
        ctx.fillStyle = color;
        ctx.fill();
      }
    };
    for (let i = 0; i < W; i++) {
      dot(cx - 50 - (W - 1 - i) * 26 - 13, i < Round.scores[me], this.colorOf(me).dot);   // 自己在左邊
    }
    others.forEach((id, k) => {
      const start = cx + 50 + k * (groupW + 24);
      const left = players[id] && players[id].left;   // 斷線的人變灰
      for (let i = 0; i < W; i++) dot(start + i * 26 + 13, i < Round.scores[id], left ? '#666a78' : this.colorOf(id).dot);
    });

    // 中間的秒數；最後 15 秒變紅色
    ctx.font = 'bold 26px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let text = '：';
    if (Round.phase === 'fight') text = String(Math.max(0, Math.ceil(Round.timer)));
    ctx.fillStyle = Round.phase === 'fight' && Round.timer <= CONFIG.round.zoneStart ? '#ff5a5a' : '#f4ecd8';
    ctx.fillText(text, cx, y + 1);
    ctx.restore();
  },

  // 畫面中間的大字：倒數、開打、這回合誰贏
  drawCenterText(ctx, myId) {
    let text = '';
    let color = '#f4ecd8';
    if (Round.phase === 'countdown') {
      text = String(Math.ceil(Round.timer));
    } else if (Round.phase === 'fight' && Round.timer > CONFIG.round.time - 0.8) {
      text = '開打！';
      color = '#ffd84a';
    } else if (Round.phase === 'fight' && Round.timer <= CONFIG.round.zoneStart && Round.timer > CONFIG.round.zoneStart - 2) {
      text = '安全區縮小中！';
      color = '#ff5a5a';
    } else if (Round.phase === 'roundEnd') {
      if (Round.roundWinner === null) {
        text = '平手，這回合不算';
      } else if (Round.roundWinner === myId) {
        text = '你贏了這回合！';
        color = '#ffd84a';
      } else if (gameMode === 'ffa') {
        // 亂鬥：說是誰贏，用他的顏色
        text = this.colorOf(Round.roundWinner).name + '贏了這回合';
        color = this.colorOf(Round.roundWinner).ring;
      } else {
        text = Round.reason === 'time' ? '時間到，血比較少⋯' : '被打倒了！';
        color = '#ff5a5a';
      }
    }
    if (!text) return;

    ctx.save();
    ctx.font = 'bold 64px "Microsoft JhengHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#1d1f2b';
    ctx.strokeText(text, ctx.canvas.width / 2, ctx.canvas.height / 2 - 40);
    ctx.fillStyle = color;
    ctx.fillText(text, ctx.canvas.width / 2, ctx.canvas.height / 2 - 40);
    ctx.restore();
  },

  // 左下：大招氣條，集滿會閃（畫面座標）
  drawSuperBar(ctx, p) {
    const full = p.superMax;
    const ratio = Math.min(1, p.super / full);
    const x = 20;
    const y = ctx.canvas.height - 44;
    const w = 220;
    const h = 22;
    const ready = ratio >= 1;
    const blink = ready && Math.floor(performance.now() / 200) % 2 === 0;   // 每 0.2 秒換一次顏色

    ctx.save();
    ctx.fillStyle = '#3a2f22';
    ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
    ctx.fillStyle = '#5a4a3a';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = ready ? (blink ? '#fff3a0' : '#ffd84a') : '#d9a520';
    ctx.fillRect(x, y, Math.round(w * ratio), h);
    // 一格一格的分隔線，看得出還差幾發
    ctx.fillStyle = '#3a2f22';
    for (let i = 1; i < full; i++) ctx.fillRect(x + Math.round((w * i) / full) - 1, y, 2, h);

    ctx.font = 'bold 16px "Microsoft JhengHei", sans-serif';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = ready ? '#ffd84a' : '#f4ecd8';
    ctx.fillText(ready ? '大招好了！按右鍵' : '大招', x, y - 6);
    ctx.restore();
  },

  drawPopups(ctx) {
    ctx.save();
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    for (const p of this.popups) {
      ctx.globalAlpha = 1 - p.time / 0.8;        // 越來越淡
      ctx.fillStyle = '#3a2f22';
      ctx.fillText(p.text, p.x + 2, p.y + 2);     // 影子
      ctx.fillStyle = '#ff3b3b';
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.restore();
  },
};
