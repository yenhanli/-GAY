// 所有數值都放這裡。想調手感，只改這個檔就好。
// 單位：距離 px、時間秒。

const CONFIG = {
  // 基本小人
  player: {
    hp: 100,
    speed: 200,      // 每秒走幾 px
    radius: 14,      // 碰撞半徑（撞牆用的圓有多大）
    cellSize: 8,     // 小人每一格畫多大
    regenDelay: 3,   // 幾秒沒被打到開始回血
    regenPerSec: 10, // 回血時每秒補多少
    flashTime: 0.12, // 被打中閃白幾秒
  },

  // 普攻（基本小人）
  attack: {
    damage: 20,          // 打中扣多少血
    bulletSpeed: 600,    // 子彈每秒飛幾 px
    range: 400,          // 飛多遠就消失
    cooldown: 0.5,       // 射完要等幾秒才能再射
    bulletSize: 8,       // 子彈畫多大（也是碰撞大小）
  },

  // 小人配色（改這裡換顏色）
  colors: {
    hair: '#4a2c1a',
    skin: '#f2c49b',
    eyes: '#1b1b1b',
    clothes: '#3b7dd8',
    button: '#ffd84a',
    shoes: '#2b2b2b',
  },

  // 加速板
  boost: {
    speedMul: 1.6,   // 速度變幾倍
    duration: 1.5,   // 加速幾秒
    cooldown: 3,     // 一塊用完要等幾秒才能再踩
  },

  // 場地
  arena: {
    radius: 480,         // 六角形中心到角
    tile: 40,            // 地圖每一格多大
    spawnDistance: 320,  // 出生點離中心多遠
  },

  // 草叢
  grass: {
    selfAlpha: 0.45,       // 自己躲草裡時畫多透明（0 看不到，1 完全不透明）
    revealDistance: 100,   // 對手靠多近就看得到草裡的你
    revealAfterShot: 1,    // 在草裡開槍後露出來幾秒
  },

  // 連線
  net: {
    stateRate: 20,         // 房主每秒送幾次畫面狀態
    timeout: 5,            // 幾秒沒收到東西算斷線
    inputHeartbeat: 0.5,   // 對手就算沒按鍵，也每幾秒送一次，讓房主知道還在
    smoothing: 15,         // 對手那台把小人滑到新位置的快慢（越大越快、越不滑順）
  },
};
