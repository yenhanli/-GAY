// 遊戲迴圈：每一幀先更新、再畫
//
// 電腦之間的分工：
//   房主（p0）：跑完整的遊戲，所有小人怎麼動都由房主算，每秒送 20 次狀態給每個對手
//   對手（p1、p2）：只送按鍵和滑鼠過去，收到狀態就照著畫
// 模式：'1v1' 兩個人、'ffa' 三個人亂鬥

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

Input.init(canvas);
Arena.build('1v1');   // 首頁背景先放 1v1 的地圖

let mode = 'home';       // 'home' 還沒開打、'host' 我是房主、'guest' 我是加入的人
let gameMode = '1v1';    // '1v1' 或 'ffa'
let ids = [];            // 這局有哪些人，例如 ['p0', 'p1', 'p2']
let players = {};        // id → 小人
let myId = 'p0';
let leftIds = new Set(); // 房主：中途斷線的人
let practice = false;    // 練習模式：不連線，其他人都是機器人
let sendTimer = 0;       // 房主：距離下次送狀態還有幾秒
let heartbeatTimer = 0;  // 對手：距離下次一定要送按鍵還有幾秒
let lastInputText = '';  // 對手：上次送出的按鍵，沒變就不送

const MAX_PLAYERS = { '1v1': 2, ffa: 3 };

// 還在場上（沒斷線）的人
function activeIds() {
  return ids.filter((id) => !players[id] || !players[id].left);
}

// ===== 畫面切換 =====

const screens = ['home', 'waiting', 'pick', 'result', 'message'];
let currentScreen = 'home';
function showScreen(id) {
  currentScreen = id;
  for (const s of screens) {
    document.getElementById(s).classList.toggle('hidden', s !== id);
  }
}

function showHomeError(text) {
  document.getElementById('homeError').textContent = text;
  showScreen('home');
}

function setWaiting(code, hint) {
  if (code !== null) document.getElementById('roomCode').textContent = code;
  document.getElementById('waitingHint').textContent = hint;
}

// 大字訊息，過一下回首頁
function endWithMessage(text) {
  Net.leave();
  mode = 'home';
  document.getElementById('messageText').textContent = text;
  showScreen('message');
  setTimeout(() => {
    if (mode === 'home') showScreen('home');
  }, 2500);
}

// ===== 選部族畫面 =====

// 一個部族一個按鈕（名字＋說明＋血量速度）
for (const tribeId of TRIBE_ORDER) {
  const t = TRIBES[tribeId];
  const stats = CONFIG.tribes[tribeId];
  const btn = document.createElement('button');
  btn.className = 'tribe';
  btn.dataset.tribe = tribeId;
  btn.innerHTML = '<b>' + t.name + '</b><small>' + t.desc.replace('\n', '<br>') +
    '<br>血 ' + stats.hp + '・速度 ' + stats.speed + '</small>';
  btn.onclick = () => pickClicked(tribeId);
  document.getElementById('pickList').appendChild(btn);
}

function pickClicked(tribeId) {
  if (Round.phase !== 'pick') return;
  if (mode === 'host') Round.pick(myId, tribeId);
  if (mode === 'guest') {
    Round.picks[myId] = tribeId;   // 先在自己這邊亮起來，房主下次送狀態就會確認
    Round.picked[myId] = true;
    Net.send({ t: 'pick', tribe: tribeId });
  }
}

function syncPickScreen() {
  const mine = Round.picks[myId] || 'basic';
  for (const btn of document.querySelectorAll('#pickList .tribe')) {
    btn.classList.toggle('chosen', btn.dataset.tribe === mine);
  }
  const done = activeIds().filter((id) => Round.picked[id]).length;
  document.getElementById('pickHint').textContent =
    '還有 ' + Math.max(0, Math.ceil(Round.timer)) + ' 秒（沒選就用上一回合的）　' +
    (Round.picked[myId] ? '已選好，' : '') + done + '/' + activeIds().length + ' 人選好了';
}

// 依照回合的階段切換畫面：選部族、整局結束跳結算畫面，其他時候不蓋東西
function syncScreens() {
  const want = Round.phase === 'matchEnd' ? 'result' : Round.phase === 'pick' ? 'pick' : null;
  if (currentScreen !== want) showScreen(want);
  if (want === 'pick') syncPickScreen();
  if (want !== 'result') return;

  const won = Round.matchWinner === myId;
  document.getElementById('resultTitle').textContent = won ? '你贏了！' : '你輸了⋯';
  const order = Hud.order();   // 自己排第一個
  document.getElementById('resultScore').textContent = gameMode === '1v1'
    ? order.map((id) => Round.scores[id]).join(' ： ')
    : order.map((id) => Hud.colorOf(id).name + ' ' + Round.scores[id]).join('　');

  const pressed = Round.rematch[myId];
  const othersPressed = activeIds().filter((id) => id !== myId && Round.rematch[id]).length;
  document.getElementById('btnRematch').disabled = pressed;
  let hint = '';
  if (practice) hint = '';
  else if (pressed) hint = gameMode === '1v1' ? '等對手按「再來一局」⋯' : '等其他人按「再來一局」⋯';
  else if (othersPressed) hint = gameMode === '1v1' ? '對手想再來一局！' : '有 ' + othersPressed + ' 個人想再來一局！';
  document.getElementById('rematchHint').textContent = hint;
}

document.getElementById('btnRematch').onclick = () => {
  if (mode === 'host') Round.pressRematch(myId);
  if (mode === 'guest') {
    Round.rematch[myId] = true;   // 先在自己這邊顯示「等其他人」，房主下次送狀態就會確認
    Net.send({ t: 'rematch' });
  }
};

// 回首頁（結算畫面的按鈕、練習中按 Esc）
function goHome() {
  Net.leave();
  mode = 'home';
  practice = false;
  Bots.setup([]);
  showScreen('home');
}
document.getElementById('btnHome').onclick = goHome;
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && practice && mode !== 'home') goHome();
});

// ===== 首頁 =====

// 練習模式：不用連線，直接跟機器人打
function startPractice(chosenMode) {
  Net.leave();
  practice = true;
  const list = [];
  for (let i = 0; i < MAX_PLAYERS[chosenMode]; i++) list.push('p' + i);
  Bots.setup(list);
  startMatch('host', chosenMode, list, 'p0');
}
document.getElementById('btnPractice1v1').onclick = () => startPractice('1v1');
document.getElementById('btnPracticeFFA').onclick = () => startPractice('ffa');

function createClicked(chosenMode) {
  practice = false;
  Bots.setup([]);
  gameMode = chosenMode;
  const max = MAX_PLAYERS[gameMode];
  document.getElementById('homeError').textContent = '';
  setWaiting('····', '正在開房間⋯');
  showScreen('waiting');
  Net.createRoom(max, (code) => setWaiting(code, lobbyText(1, max)));
}
document.getElementById('btnCreate1v1').onclick = () => createClicked('1v1');
document.getElementById('btnCreateFFA').onclick = () => createClicked('ffa');

function lobbyText(count, max) {
  if (max === 2) return '等對手加入⋯';
  return '等其他人加入⋯（' + count + '/' + max + '）';
}

function joinClicked() {
  const code = document.getElementById('codeInput').value.trim().toUpperCase();
  if (!/^[A-Z]{4}$/.test(code)) {
    showHomeError('房號是 4 個英文字母');
    return;
  }
  practice = false;
  Bots.setup([]);
  document.getElementById('homeError').textContent = '';
  setWaiting(code, '連線中⋯');
  showScreen('waiting');
  Net.joinRoom(code);
}
document.getElementById('btnJoin').onclick = joinClicked;
document.getElementById('codeInput').onkeydown = (e) => {
  if (e.key === 'Enter') joinClicked();
};

document.getElementById('btnCancel').onclick = () => {
  Net.leave();
  mode = 'home';
  showScreen('home');
};

// ===== 連線事件 =====

Net.onError = showHomeError;

// 房主：有人進房；人到齊就開打
Net.onGuestJoined = () => {
  const max = MAX_PLAYERS[gameMode];
  const count = 1 + Object.keys(Net.guests).length;
  setWaiting(null, lobbyText(count, max));
  Net.broadcast({ t: 'lobby', count, max });
  if (count === max) {
    Net.lock();
    const list = [];
    for (let i = 0; i < max; i++) list.push('p' + i);
    Net.broadcast({ t: 'start', mode: gameMode, ids: list });
    startMatch('host', gameMode, list, 'p0');
  }
};

// 房主：有人離開（開打前就更新人數；開打後就是斷線）
Net.onGuestLeft = (slot) => {
  if (mode === 'home') {
    const max = MAX_PLAYERS[gameMode];
    const count = 1 + Object.keys(Net.guests).length;
    setWaiting(null, lobbyText(count, max));
    Net.broadcast({ t: 'lobby', count, max });
    return;
  }
  playerLeft('p' + slot);
};

// 對手：進房成功
Net.onWelcome = () => setWaiting(null, '已加入！等房主開始⋯');

// 對手：房主走了
Net.onHostLeft = () => {
  if (mode === 'home') {
    showHomeError('房主離開了');
    return;
  }
  endWithMessage(gameMode === '1v1' ? '對手斷線了，你贏了！' : '房主斷線了，這局結束');
};

Net.onMessage = (msg, slot) => {
  if (Net.isHost) {
    hostReceive(msg, 'p' + slot, Net.guests[slot]);
    return;
  }
  // 對手收到房主的訊息
  if (msg.t === 'lobby') setWaiting(null, msg.max === 2 ? '已加入！' : '已加入！等其他人⋯（' + msg.count + '/' + msg.max + '）');
  if (msg.t === 'start') startMatch('guest', msg.mode, msg.ids, 'p' + Net.slot);
  if (mode !== 'guest') return;
  if (msg.t === 'state') applyState(msg);
  if (msg.t === 'hit') showHit(msg.id, msg.dmg);
};

// 房主收到某個對手的訊息
function hostReceive(msg, id, guest) {
  if (mode !== 'host' || !guest) return;
  const input = guest.input;
  if (msg.t === 'input') Object.assign(input, msg);
  if (msg.t === 'shoot' || msg.t === 'super') {
    // 用對手點下去那一刻的滑鼠位置瞄準
    input.mouseX = msg.mouseX;
    input.mouseY = msg.mouseY;
    if (msg.t === 'shoot') input.shootPressed = true;
    else input.superPressed = true;
  }
  if (msg.t === 'rematch') Round.pressRematch(id);
  if (msg.t === 'pick') Round.pick(id, msg.tribe);
}

// 房主：某個人的按鍵從哪裡來
function inputOf(id) {
  if (id === 'p0') return Input;
  if (Bots.isBot(id)) return Bots.inputOf(id);
  const g = Net.guests[Number(id.slice(1))];
  return g ? g.input : emptyInput();
}

// ===== 開打 =====

function startMatch(asMode, chosenMode, idList, me) {
  mode = asMode;
  gameMode = chosenMode;
  ids = idList;
  myId = me;
  leftIds = new Set();
  sendTimer = 0;
  heartbeatTimer = 0;
  lastInputText = '';
  // 剛開打，等人的時間不算在斷線計時裡
  Net.lastHeardHost = performance.now();
  for (const g of Object.values(Net.guests)) g.lastHeard = performance.now();

  Arena.build(gameMode);
  Hud.setupColors(ids, myId);
  Round.picks = {};
  Round.resetMatch();   // 比數歸零、開第一回合（會呼叫下面的 resetField）
  showScreen(null);
}

// 每回合開始：大家回出生點、血補滿，清掉場上的子彈
function resetField() {
  players = {};
  ids.forEach((id, i) => {
    const s = Arena.spawns[i];
    players[id] = createPlayer(id, s.x, s.y, Round.picks[id] || 'basic');
    if (leftIds.has(id)) {
      players[id].left = true;
      players[id].dead = true;
    }
  });
  for (const t of Arena.tiles) {
    if (t.type === 'boost') t.cooldown = 0;
  }
  Bullets.list = [];
  Hud.popups = [];
  for (const id of ids) {
    const input = mode === 'host' ? inputOf(id) : id === myId ? Input : null;
    if (!input) continue;
    input.shootPressed = false;
    input.superPressed = false;
  }
}

// 房主：有人中途斷線。只剩自己一個就直接贏
function playerLeft(id) {
  if (!players[id]) return;
  leftIds.add(id);
  players[id].left = true;
  players[id].dead = true;
  delete Round.rematch[id];
  if (activeIds().length <= 1) {
    endWithMessage(gameMode === '1v1' ? '對手斷線了，你贏了！' : '其他人都斷線了，你贏了！');
  }
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
  if (!p) return;
  p.flash = CONFIG.player.flashTime;
  Hud.addPopup(p.x, Player.bodyRect(p).top - 16, '-' + dmg);
}

// ===== 房主 =====

// p 的敵人：還在場上、還站著的其他人（部族的近戰、陀螺會用到）
function enemiesOf(p) {
  return activeIds().map((id) => players[id]).filter((t) => t !== p && !t.dead);
}

// 打中人：扣血、閃白飄字、（charge 為 true 時）幫攻擊的人集大招氣。只有房主會算
function dealDamage(attacker, target, dmg, charge) {
  if (target.dead) return;
  Player.takeDamage(target, dmg);
  if (charge && attacker) attacker.super = Math.min(attacker.superMax, attacker.super + 1);
  showHit(target.id, dmg);
  // 告訴對手們：被打的、攻擊的、或看得到被打的人，才會收到
  for (const slot of Object.keys(Net.guests)) {
    const viewer = players['p' + slot];
    if (!viewer) continue;
    if (viewer === target || viewer === attacker || canSee(viewer, target)) {
      Net.sendTo(Number(slot), { t: 'hit', id: target.id, dmg });
    }
  }
}

// 子彈打中人：普攻子彈會集氣，大招子彈不會
function onBulletHit(bullet, p) {
  dealDamage(players[bullet.owner], p, Bullets.damageOf(bullet), !bullet.isSuper);
}

// 還沒開打（倒數、回合結束、整局結束）：不能動、不能射，只能轉頭瞄準
function aimOnly(p, input, dt) {
  if (p.flash > 0) p.flash -= dt;
  p.angle = Math.atan2(input.mouseY - p.y, input.mouseX - p.x);
  input.shootPressed = false;
  input.superPressed = false;
}

function updateHost(dt) {
  Net.checkTimeouts();
  if (mode !== 'host') return;   // 可能剛剛因為大家都斷線而結束

  Arena.update(dt);
  const active = activeIds().map((id) => players[id]);
  if (Round.phase === 'fight') {
    Bots.update(dt);   // 機器人先「按按鍵」
    for (const p of active) Player.update(p, inputOf(p.id), dt);
    // 倒下的人不會再被打中
    Bullets.update(dt, active.filter((p) => !p.dead), onBulletHit);
  } else {
    for (const p of active) aimOnly(p, inputOf(p.id), dt);
    Bullets.update(dt, [], null);   // 還在飛的子彈飛完
  }
  // 機器人：選部族時隨便挑一個；整局結束永遠想再來一局
  if (Round.phase === 'pick') {
    for (const id of ids) {
      if (Bots.isBot(id) && !Round.picked[id]) Round.pick(id, TRIBE_ORDER[Math.floor(Math.random() * TRIBE_ORDER.length)]);
    }
  }
  Round.update(dt);
  if (Round.phase === 'matchEnd') {
    for (const id of ids) if (Bots.isBot(id)) Round.rematch[id] = true;
  }

  sendTimer -= dt;
  if (sendTimer <= 0) {
    sendTimer = 1 / CONFIG.net.stateRate;
    for (const slot of Object.keys(Net.guests)) {
      Net.sendTo(Number(slot), makeState('p' + slot));
    }
  }
}

// 打包要送給某個對手的狀態。他看不到的人就不送位置，想作弊也看不到。
function makeState(viewerId) {
  const viewer = players[viewerId];
  const packed = {};
  for (const id of ids) {
    const p = players[id];
    packed[id] = packPlayer(p, id === viewerId || canSee(viewer, p));
  }
  return {
    t: 'state',
    round: Round.pack(),
    players: packed,
    boosts: Arena.tiles.filter((t) => t.type === 'boost').map((t) => Math.max(0, Math.round(t.cooldown * 10) / 10)),
    // 子彈連速度一起送，對手那台在兩次狀態之間可以自己往前飛，看起來才順
    bullets: Bullets.list.map((b) => ({
      owner: b.owner,
      x: Math.round(b.x),
      y: Math.round(b.y),
      vx: Math.round(b.vx),
      vy: Math.round(b.vy),
      traveled: Math.round(b.traveled),
      isSuper: b.isSuper,
      kind: b.kind,
    })),
  };
}

function packPlayer(p, visible) {
  if (p.left) return { left: true, hidden: true };
  if (!visible) return { hidden: true };
  return {
    x: Math.round(p.x * 10) / 10,
    y: Math.round(p.y * 10) / 10,
    angle: Math.round(p.angle * 100) / 100,
    inGrass: p.inGrass,
    hp: Math.round(p.hp),
    dead: p.dead,
    super: p.super,
    tribe: p.tribe,
    slash: p.slashAnim > 0 ? Math.round(p.slashAnim * 100) / 100 : 0,   // 機甲剛砍下去
    spinning: p.spinTime > 0,                                          // 機甲在轉
    mech: p.mechTime > 0,                                              // 未來科技變身中
    shield: Math.round(p.shield),
  };
}

// ===== 對手 =====

function applyState(msg) {
  Object.assign(Round, msg.round);
  for (const id of ids) {
    const p = players[id];
    const s = msg.players[id];
    if (!p || !s) continue;
    p.left = !!s.left;
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
    p.super = s.super;
    if (p.tribe !== s.tribe) {
      p.tribe = s.tribe;
      p.maxHp = CONFIG.tribes[s.tribe].hp;
      p.superMax = CONFIG.tribes[s.tribe].superHits;
    }
    if (s.slash > 0) p.slashAnim = s.slash;
    p.spinning = s.spinning;
    p.mech = s.mech;
    p.shield = s.shield;
    if (id !== myId) p.angle = s.angle;
  }
  const boosts = Arena.tiles.filter((t) => t.type === 'boost');
  boosts.forEach((t, i) => (t.cooldown = msg.boosts[i]));
  Bullets.list = msg.bullets;
}

function updateGuest(dt) {
  if (Net.hostTimedOut()) {
    Net.hostGone();
    return;
  }

  const k = Math.min(1, dt * CONFIG.net.smoothing);
  for (const p of Object.values(players)) {
    if (p.flash > 0) p.flash -= dt;
    if (p.slashAnim > 0) p.slashAnim -= dt;
    if (p.targetX === undefined) continue;
    p.x += (p.targetX - p.x) * k;
    p.y += (p.targetY - p.y) * k;
  }

  // 自己的面向直接用自己的滑鼠算，不用等房主，瞄起來才跟手
  const me = players[myId];
  me.angle = Math.atan2(Input.mouseY - me.y, Input.mouseX - me.x);

  // 子彈先自己往前飛，等房主下次送狀態再校正（打中誰還是房主說了算）
  Bullets.update(dt, [], null);

  // 點了左鍵／右鍵就馬上告訴房主
  if (Input.shootPressed) {
    Input.shootPressed = false;
    Net.send({ t: 'shoot', mouseX: Math.round(Input.mouseX), mouseY: Math.round(Input.mouseY) });
  }
  if (Input.superPressed) {
    Input.superPressed = false;
    Net.send({ t: 'super', mouseX: Math.round(Input.mouseX), mouseY: Math.round(Input.mouseY) });
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
  if (mode === 'host') updateHost(dt);
  if (mode === 'guest') updateGuest(dt);
  if (mode === 'home') return;   // 剛剛斷線結束了
  Hud.update(dt);
  syncScreens();
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
    Arena.drawZone(ctx, Round.zone);
    const me = players[myId];
    // 房主自己判斷看不看得到；對手那台只要房主沒送位置就是看不到
    const others = ids.filter((id) => id !== myId)
      .map((id) => players[id])
      .filter((p) => !p.left && (mode === 'host' ? canSee(me, p) : !p.hidden));
    for (const p of others) Player.draw(ctx, p, Hud.colorOf(p.id).ring);
    Player.draw(ctx, me, Hud.colorOf(myId).ring);
    Bullets.draw(ctx);
    for (const p of others) Hud.drawHealthBar(ctx, p, Hud.colorOf(p.id).bar);
    Hud.drawHealthBar(ctx, me, Hud.colorOf(myId).bar);
    Hud.drawPopups(ctx);
  }
  ctx.restore();

  // 比數和大字畫在畫面座標
  if (mode !== 'home') {
    Hud.drawScore(ctx);
    Hud.drawSuperBar(ctx, players[myId]);
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
