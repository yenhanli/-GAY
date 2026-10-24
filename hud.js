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
    const ratio = Math.max(0, p.hp) / CONFIG.player.hp;

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
