// 畫面上的資訊：頭上血條、打中時飄的數字

const Hud = {
  popups: [],   // 飄在空中的字，例如「-20」

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

  // 小人頭上的血條；isMe：自己綠色、對手紅色
  drawHealthBar(ctx, p, isMe) {
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
    ctx.fillStyle = isMe ? '#4fd34f' : '#ff4b4b'; // 剩下的血
    ctx.fillRect(x, y, Math.round(w * ratio), h);
    ctx.restore();
  },

  // 上方中間：比數（藍 ● ● ○ ： 紅 ● ○ ○）＋回合剩幾秒
  // 這個跟下面的大字都畫在「畫面座標」，左上角是 (0,0)
  drawScore(ctx, myId) {
    const otherId = myId === 'host' ? 'guest' : 'host';
    const W = CONFIG.round.winsNeeded;
    const cx = ctx.canvas.width / 2;
    const y = 30;

    ctx.save();
    ctx.fillStyle = 'rgba(20, 22, 32, 0.75)';
    ctx.fillRect(cx - 150, 6, 300, 48);

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
      dot(cx - 50 - (W - 1 - i) * 26, i < Round.scores[myId], '#2f7bff');   // 自己在左邊、藍色
      dot(cx + 50 + i * 26, i < Round.scores[otherId], '#ff3b3b');         // 對手在右邊、紅色
    }

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
