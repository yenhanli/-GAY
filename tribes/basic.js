// 基本小人：普攻射一發子彈，大招一次射 5 發扇形子彈
// 數值在 config.js 的 attack、super、tribes.basic

addTribe('basic', {
  name: '基本小人',
  desc: '射一發子彈（射程遠）\n大招：一次射 5 發扇形子彈',
  colors: {},   // 用 config.js 的預設顏色

  cooldown() {
    return CONFIG.attack.cooldown;
  },

  attack(p) {
    Bullets.spawn(p);
  },

  super(p) {
    Bullets.spawnFan(p);
  },

  // 機器人：保持中距離，射程內就射
  bot: { near: 170, far: 300, attackDist: CONFIG.attack.range - 10, superDist: 260 },
});
