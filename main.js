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

const screens = ['home', 'waiting', 'message'];
function showScreen(id) {
  for (const s of screens) {
    document.getElementById(s).classList.toggle('hidden', s !== id);
  }
}

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
};

// ===== 開打 =====

function startMatch(asHost) {
  mode = asHost ? 'host' : 'guest';
  myId = asHost ? 'host' : 'guest';
  const D = CONFIG.arena.spawnDistance;
  players = {
    host: createPlayer('host', -D, 0),     // 房主在左邊
    guest: createPlayer('guest', D, 0),    // 對手在右邊
  };
  for (const t of Arena.tiles) {
    if (t.type === 'boost') t.cooldown = 0;
  }
  Bullets.list = [];
  Input.shootPressed = false;
  sendTimer = 0;
  heartbeatTimer = 0;
  lastInputText = '';
  showScreen(null);
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

// ===== 房主 =====

function updateHost(dt) {
  Arena.update(dt);
  Player.update(players.host, Input, dt);
  Player.update(players.guest, Net.remoteInput, dt);
  Bullets.update(dt, [players.host, players.guest], null);

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
  };
}

// ===== 對手 =====

function applyState(msg) {
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
    if (id !== myId) p.angle = s.angle;
  }
  const boosts = Arena.tiles.filter((t) => t.type === 'boost');
  boosts.forEach((t, i) => (t.cooldown = msg.boosts[i]));
  Bullets.list = msg.bullets;
}

function updateGuest(dt) {
  const k = Math.min(1, dt * CONFIG.net.smoothing);
  for (const p of Object.values(players)) {
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
}

function draw() {
  ctx.fillStyle = '#1d1f2b';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 把原點移到畫面中心，場地座標 (0,0) 就在正中間
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  Arena.drawGround(ctx);
  Arena.drawGrass(ctx);

  if (mode !== 'home') {
    const me = players[myId];
    const other = players[myId === 'host' ? 'guest' : 'host'];
    // 房主自己判斷看不看得到；對手那台只要房主沒送位置就是看不到
    const otherVisible = mode === 'host' ? canSee(me, other) : !other.hidden;
    if (otherVisible) Player.draw(ctx, other, false);
    Player.draw(ctx, me, true);
    Bullets.draw(ctx, myId);
  }
  ctx.restore();
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
