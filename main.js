// 遊戲迴圈：每一幀先更新、再畫
//
// 兩台電腦的分工：
//   房主（host）：跑完整的遊戲，兩個小人怎麼動都由房主算，每秒送 20 次狀態給對手
//   對手（guest）：只送按鍵和滑鼠過去，收到狀態就照著畫

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

Input.init(canvas);
Arena.build();

let mode = 'home';       // 'home' 還沒開打、'host' 我是房主、'guest' 我是加入的人
let players = {};        // { host: 小人, guest: 小人 }
let myId = 'host';
let sendTimer = 0;       // 房主：距離下次送狀態還有幾秒
let heartbeatTimer = 0;  // 對手：距離下次一定要送按鍵還有幾秒
let lastInputText = '';  // 對手：上次送出的按鍵，沒變就不送

// ===== 畫面切換 =====

const screens = ['home', 'waiting', 'result', 'message'];
let currentScreen = 'home';
function showScreen(id) {
  currentScreen = id;
  for (const s of screens) {
    document.getElementById(s).classList.toggle('hidden', s !== id);
  }
}

// 整局結束就跳結算畫面，重開了就關掉
function syncResultScreen() {
  const want = Round.phase === 'matchEnd' ? 'result' : null;
  if (currentScreen !== want) showScreen(want);
  if (want !== 'result') return;

  const otherId = myId === 'host' ? 'guest' : 'host';
  const won = Round.matchWinner === myId;
  document.getElementById('resultTitle').textContent = won ? '你贏了！' : '你輸了⋯';
  document.getElementById('resultScore').textContent = Round.scores[myId] + ' ： ' + Round.scores[otherId];
  const pressed = Round.rematch[myId];
  document.getElementById('btnRematch').disabled = pressed;
  document.getElementById('rematchHint').textContent = pressed
    ? '等對手按「再來一局」⋯'
    : Round.rematch[otherId] ? '對手想再來一局！' : '';
}

document.getElementById('btnRematch').onclick = () => {
  if (mode === 'host') Round.pressRematch('host');
  if (mode === 'guest') {
    Round.rematch.guest = true;   // 先在自己這邊顯示「等對手」，房主下次送狀態就會確認
    Net.send({ t: 'rematch' });
  }
};

function showHomeError(text) {
  document.getElementById('homeError').textContent = text;
  showScreen('home');
}

document.getElementById('btnCreate').onclick = () => {
  document.getElementById('homeError').textContent = '';
  document.getElementById('roomCode').textContent = '····';
  document.getElementById('waitingHint').textContent = '正在開房間⋯';
  showScreen('waiting');
  Net.createRoom((code) => {
    document.getElementById('roomCode').textContent = code;
    document.getElementById('waitingHint').textContent = '等對手加入⋯';
  });
};

function joinClicked() {
  const code = document.getElementById('codeInput').value.trim().toUpperCase();
  if (!/^[A-Z]{4}$/.test(code)) {
    showHomeError('房號是 4 個英文字母');
    return;
  }
  document.getElementById('homeError').textContent = '';
  document.getElementById('roomCode').textContent = code;
  document.getElementById('waitingHint').textContent = '連線中⋯';
  showScreen('waiting');
  Net.joinRoom(code);
}
document.getElementById('btnJoin').onclick = joinClicked;
document.getElementById('codeInput').onkeydown = (e) => {
  if (e.key === 'Enter') joinClicked();
};

document.getElementById('btnCancel').onclick = () => {
  Net.leave();
  showScreen('home');
};

Net.onError = showHomeError;
Net.onConnected = () => startMatch(Net.isHost);
Net.onMessage = (msg) => {
  if (msg.t === 'input' && mode === 'host') Object.assign(Net.remoteInput, msg);
  if (msg.t === 'shoot' && mode === 'host') {
    // 用對手點下去那一刻的滑鼠位置瞄準
    Net.remoteInput.mouseX = msg.mouseX;
    Net.remoteInput.mouseY = msg.mouseY;
    Net.remoteInput.shootPressed = true;
  }
  if (msg.t === 'state' && mode === 'guest') applyState(msg);
  if (msg.t === 'hit' && mode === 'guest') showHit(msg.id, msg.dmg);
  if (msg.t === 'rematch' && mode === 'host') Round.pressRematch('guest');
};

// ===== 開打 =====

function startMatch(asHost) {
  mode = asHost ? 'host' : 'guest';
  myId = asHost ? 'host' : 'guest';
  sendTimer = 0;
  heartbeatTimer = 0;
  lastInputText = '';
  Round.resetMatch();   // 比數歸零、開第一回合（會呼叫下面的 resetField）
  showScreen(null);
}

// 每回合開始：兩個人回出生點、血補滿，清掉場上的子彈
function resetField() {
  const D = CONFIG.arena.spawnDistance;
  players = {
    host: createPlayer('host', -D, 0),     // 房主在左邊
    guest: createPlayer('guest', D, 0),    // 對手在右邊
  };
  for (const t of Arena.tiles) {
    if (t.type === 'boost') t.cooldown = 0;
  }
  Bullets.list = [];
  Hud.popups = [];
  Input.shootPressed = false;
  Net.remoteInput.shootPressed = false;
}

// 對手斷線：剩下的人獲勝，回首頁
function opponentLeft() {
  Net.leave();
  mode = 'home';
  document.getElementById('messageText').textContent = '對手斷線了，你贏了！';
  showScreen('message');
  setTimeout(() => showScreen('home'), 2500);
}

// viewer 看不看得到 target：不在草裡就看得到；在草裡剛開過槍、或靠很近才看得到
function canSee(viewer, target) {
  if (!target.inGrass) return true;
  if (target.revealTime > 0) return true;
  return Math.hypot(viewer.x - target.x, viewer.y - target.y) <= CONFIG.grass.revealDistance;
}

// 打中的效果：閃白＋頭上飄「-20」。房主打中時自己呼叫，也傳給對手那台呼叫
function showHit(id, dmg) {
  const p = players[id];
  p.flash = CONFIG.player.flashTime;
  Hud.addPopup(p.x, Player.bodyRect(p).top - 16, '-' + dmg);
}

// ===== 房主 =====

// 子彈打中人（只有房主會算）
function onBulletHit(bullet, p) {
  const dmg = CONFIG.attack.damage;
  Player.takeDamage(p, dmg);
  showHit(p.id, dmg);
  Net.send({ t: 'hit', id: p.id, dmg });
}

// 還沒開打（倒數、回合結束、整局結束）：不能動、不能射，只能轉頭瞄準
function aimOnly(p, input, dt) {
  if (p.flash > 0) p.flash -= dt;
  p.angle = Math.atan2(input.mouseY - p.y, input.mouseX - p.x);
  input.shootPressed = false;
}

function updateHost(dt) {
  Arena.update(dt);
  if (Round.phase === 'fight') {
    Player.update(players.host, Input, dt);
    Player.update(players.guest, Net.remoteInput, dt);
    // 倒下的人不會再被打中
    const alive = Object.values(players).filter((p) => !p.dead);
    Bullets.update(dt, alive, onBulletHit);
  } else {
    aimOnly(players.host, Input, dt);
    aimOnly(players.guest, Net.remoteInput, dt);
    Bullets.update(dt, [], null);   // 還在飛的子彈飛完
  }
  Round.update(dt);

  sendTimer -= dt;
  if (sendTimer <= 0) {
    sendTimer = 1 / CONFIG.net.stateRate;
    Net.send(makeState());
  }
}

// 打包要送給對手的狀態。對手看不到的人就不送位置，想作弊也看不到。
function makeState() {
  const guestSeesHost = canSee(players.guest, players.host);
  return {
    t: 'state',
    round: Round.pack(),
    host: packPlayer(players.host, guestSeesHost),
    guest: packPlayer(players.guest, true),
    boosts: Arena.tiles.filter((t) => t.type === 'boost').map((t) => Math.max(0, Math.round(t.cooldown * 10) / 10)),
    // 子彈連速度一起送，對手那台在兩次狀態之間可以自己往前飛，看起來才順
    bullets: Bullets.list.map((b) => ({
      owner: b.owner,
      x: Math.round(b.x),
      y: Math.round(b.y),
      vx: Math.round(b.vx),
      vy: Math.round(b.vy),
      traveled: Math.round(b.traveled),
    })),
  };
}

function packPlayer(p, visible) {
  if (!visible) return { hidden: true };
  return {
    x: Math.round(p.x * 10) / 10,
    y: Math.round(p.y * 10) / 10,
    angle: Math.round(p.angle * 100) / 100,
    inGrass: p.inGrass,
    hp: Math.round(p.hp),
    dead: p.dead,
  };
}

// ===== 對手 =====

function applyState(msg) {
  Object.assign(Round, msg.round);
  for (const id of ['host', 'guest']) {
    const p = players[id];
    const s = msg[id];
    p.hidden = !!s.hidden;
    if (p.hidden) continue;
    // 先記下目標位置，每幀慢慢滑過去，看起來才不會一格一格跳
    if (p.targetX === undefined || Math.hypot(s.x - p.x, s.y - p.y) > 100) {
      p.x = s.x;   // 第一次或差太多（例如回出生點）就直接跳過去
      p.y = s.y;
    }
    p.targetX = s.x;
    p.targetY = s.y;
    p.inGrass = s.inGrass;
    p.hp = s.hp;
    p.dead = s.dead;
    if (id !== myId) p.angle = s.angle;
  }
  const boosts = Arena.tiles.filter((t) => t.type === 'boost');
  boosts.forEach((t, i) => (t.cooldown = msg.boosts[i]));
  Bullets.list = msg.bullets;
}

function updateGuest(dt) {
  const k = Math.min(1, dt * CONFIG.net.smoothing);
  for (const p of Object.values(players)) {
    if (p.flash > 0) p.flash -= dt;
    if (p.targetX === undefined) continue;
    p.x += (p.targetX - p.x) * k;
    p.y += (p.targetY - p.y) * k;
  }

  // 自己的面向直接用自己的滑鼠算，不用等房主，瞄起來才跟手
  const me = players[myId];
  me.angle = Math.atan2(Input.mouseY - me.y, Input.mouseX - me.x);

  // 子彈先自己往前飛，等房主下次送狀態再校正（打中誰還是房主說了算）
  Bullets.update(dt, [], null);

  // 點了左鍵就馬上告訴房主
  if (Input.shootPressed) {
    Input.shootPressed = false;
    Net.send({ t: 'shoot', mouseX: Math.round(Input.mouseX), mouseY: Math.round(Input.mouseY) });
  }

  // 按鍵有變才送；沒變也每 0.5 秒送一次，讓房主知道我還在
  const msg = {
    t: 'input',
    up: Input.up,
    down: Input.down,
    left: Input.left,
    right: Input.right,
    mouseX: Math.round(Input.mouseX),
    mouseY: Math.round(Input.mouseY),
  };
  const text = JSON.stringify(msg);
  heartbeatTimer -= dt;
  if (text !== lastInputText || heartbeatTimer <= 0) {
    Net.send(msg);
    lastInputText = text;
    heartbeatTimer = CONFIG.net.inputHeartbeat;
  }
}

// ===== 每一幀 =====

function update(dt) {
  if (mode === 'home') return;
  if (Net.isTimedOut()) {
    opponentLeft();
    return;
  }
  if (mode === 'host') updateHost(dt);
  if (mode === 'guest') updateGuest(dt);
  Hud.update(dt);
  syncResultScreen();
}

function draw() {
  ctx.fillStyle = '#1d1f2b';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 把原點移到畫面中心，場地座標 (0,0) 就在正中間
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  Arena.drawGround(ctx);
  Arena.drawGrass(ctx);
  if (mode !== 'home') Arena.drawZone(ctx, Round.zone);

  if (mode !== 'home') {
    const me = players[myId];
    const other = players[myId === 'host' ? 'guest' : 'host'];
    // 房主自己判斷看不看得到；對手那台只要房主沒送位置就是看不到
    const otherVisible = mode === 'host' ? canSee(me, other) : !other.hidden;
    if (otherVisible) Player.draw(ctx, other, false);
    Player.draw(ctx, me, true);
    Bullets.draw(ctx, myId);
    if (otherVisible) Hud.drawHealthBar(ctx, other, false);
    Hud.drawHealthBar(ctx, me, true);
    Hud.drawPopups(ctx);
  }
  ctx.restore();

  // 比數和大字畫在畫面座標
  if (mode !== 'home') {
    Hud.drawScore(ctx, myId);
    Hud.drawCenterText(ctx, myId);
  }
}

let last = performance.now();
function tick(now) {
  // 距離上一幀過了幾秒；最多補 1 秒
  let elapsed = Math.min((now - last) / 1000, 1);
  last = now;
  // 每次最多算 0.05 秒，過太久就切成好幾小段算，撞牆才不會穿過去
  while (elapsed > 0) {
    const dt = Math.min(elapsed, 0.05);
    update(dt);
    elapsed -= dt;
  }
  draw();
}

function loop(now) {
  tick(now);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// 視窗縮小或切到別的分頁時，瀏覽器會暫停 requestAnimationFrame。
// 超過 0.2 秒沒跑就改用計時器繼續跑，房主才會繼續送狀態，連線也不會被當成斷線。
// 計時器放在 Web Worker 裡：一般的 setInterval 在背景會被瀏覽器降到一秒一次，
// 放久了甚至一分鐘一次；Worker 裡的比較不會被降速。
function backupTick() {
  if (performance.now() - last > 200) tick(performance.now());
}
try {
  const code = 'setInterval(() => postMessage(0), 50);';
  const worker = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
  worker.onmessage = backupTick;
} catch (e) {
  setInterval(backupTick, 50);   // 不能用 Worker 的瀏覽器就用一般的
}
