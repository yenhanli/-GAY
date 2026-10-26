// 所有數值都放這裡。想調手感，只改這個檔就好。
// 單位：距離 px、時間秒。

const CONFIG = {
  // 所有小人共用的（血量、速度每個部族不一樣，在下面 tribes 裡）
  player: {
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

  // 大招（基本小人）
  super: {
    bullets: 5,          // 一次射幾發
    spread: 30,          // 扇形往左右各張開幾度
    damage: 20,          // 每發扣多少血
  },

  // 部族（程式在 tribes/ 資料夾，一個部族一個檔）
  tribes: {
    basic: {
      hp: 100,
      speed: 200,          // 每秒走幾 px
      superHits: 5,        // 打中幾次集滿大招（普攻、大招的數字在上面 attack、super）
    },
    mecha: {
      hp: 130,             // 血比較厚
      speed: 230,          // 走比較快，用來彌補打不遠
      superHits: 3,        // 砍中 3 次集滿（一下普攻砍中算 1 次）
      reach: 60,           // 刀砍得到多遠
      arc: 70,             // 往前左右各幾度內砍得到
      slashDamage: 15,     // 每刀扣多少
      slashGap: 0.15,      // 兩刀之間隔幾秒
      cooldown: 0.6,       // 砍完要等幾秒才能再砍
      spinTime: 3,         // 大招：陀螺轉幾秒
      spinTick: 0.25,      // 每幾秒扣一次
      spinDamage: 10,      // 每次扣多少
      spinReach: 60,       // 轉的時候多近會被打到
    },
    future: {
      hp: 100,
      speed: 200,
      superHits: 5,        // 打中 5 發集滿
      cooldown: 0.5,       // 射完要等幾秒才能再射
      range: 450,          // 能量砲飛多遠
      bulletSpeed: 600,
      sizeMin: 4,          // 剛射出去多大顆
      sizeMax: 12,         // 飛到射程盡頭多大顆
      damageMin: 10,       // 剛射出去打中扣多少
      damageMax: 30,       // 飛到射程盡頭打中扣多少
      mechTime: 6,         // 大招：變身機甲幾秒
      shield: 50,          // 變身時多一條護盾（先扣護盾再扣血）
      sawReach: 50,        // 鋸子多近嚕得到
      sawArc: 60,          // 往前左右各幾度內嚕得到
      sawTick: 0.3,        // 每幾秒嚕一次
      sawDamage: 12,       // 每次扣多少
    },
  },

  // 小人配色（改這裡換顏色；部族自己的衣服顏色在 tribes/ 的檔案裡）
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
    cooldown: 1.5,   // 一塊用完要等幾秒才能再踩
  },

  // 回合
  round: {
    winsNeeded: 3,       // 1v1：先贏幾回合就贏整局（搶三）
    winsNeededFFA: 2,    // 3 人亂鬥：先贏幾回合（搶二）
    time: 60,            // 每回合限時幾秒
    countdown: 3,        // 開打前倒數幾秒
    pickTime: 8,         // 每回合開始前選部族的時間
    between: 2,          // 回合結束後顯示誰贏幾秒，再開下一回合
    zoneStart: 15,       // 剩幾秒時開始縮圈
    zoneEndRadius: 160,  // 縮到多小（六角形中心到角）
    zoneDamage: 15,      // 站在圈外每秒扣多少血
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

  // 練習模式的機器人（數字越小越難）
  bot: {
    thinkEvery: 0.1,          // 每幾秒想一次要怎麼走、要不要開槍
    reaction: 0.35,           // 看到人以後過幾秒才開始開槍
    aimError: 7,              // 瞄準最多偏幾度
    // 跟目標保持多遠、多近才攻擊，每個部族不一樣，寫在 tribes/ 各檔的 bot
  },

  // 連線
  net: {
    stateRate: 20,         // 房主每秒送幾次畫面狀態
    timeout: 5,            // 幾秒沒收到東西算斷線
    inputHeartbeat: 0.5,   // 對手就算沒按鍵，也每幾秒送一次，讓房主知道還在
    smoothing: 15,         // 對手那台把小人滑到新位置的快慢（越大越快、越不滑順）
    // Cloudflare 上的轉送伺服器（程式在 relay/ 資料夾）
    relayUrl: 'wss://six-cell-brawl-relay.yenhanli.workers.dev',
  },
};
