// 連線：開房、加入、送收資料、斷線判定
//
// 所有人都連到 Cloudflare 上的轉送伺服器（程式在 relay/worker.js），由它轉送訊息。
// 房主（slot 0）跟每個對手（slot 1、2）說話；對手只跟房主說話。
// 房號 KBZQ → 連到 轉送伺服器/room/KBZQ

const ROOM_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // 拿掉 I 和 O，免得跟 1、0 搞混

function emptyInput() {
  return { up: false, down: false, left: false, right: false, mouseX: 0, mouseY: 0 };
}

const Net = {
  ws: null,
  isHost: false,
  slot: 0,             // 自己的編號：房主 0，對手 1、2
  joinTimer: null,

  // 房主這邊：每個對手的資料。slot → { input: 按鍵（格式跟 Input 一樣）, lastHeard: 最後收到的時間 }
  guests: {},
  // 對手這邊：最後一次收到房主東西的時間
  lastHeardHost: 0,

  // 房主會用到的
  onGuestJoined: null,   // (slot) 有人進房
  onGuestLeft: null,     // (slot) 有人離開（不管開打了沒）
  // 對手會用到的
  onWelcome: null,       // (slot) 進房成功
  onHostLeft: null,      // 房主離開了
  // 兩邊都會用到的
  onMessage: null,       // (msg, slot) 收到遊戲資料；房主這邊會附上是哪個對手送的
  onError: null,         // (text) 出錯了，參數是給玩家看的中文

  // 開房間：maxPlayers 是這間最多幾人（含自己）；拿到房號後呼叫 onCode(房號)
  createRoom(maxPlayers, onCode) {
    this.leave();
    this.isHost = true;
    this.slot = 0;
    const code = randomCode();
    this.open(code, 'host&max=' + maxPlayers, (msg) => {
      if (msg.ev === 'ready') onCode(code);
      if (msg.ev === 'taken') this.createRoom(maxPlayers, onCode);   // 房號剛好有人在用，換一個
      if (msg.ev === 'joined') {
        this.guests[msg.slot] = { input: emptyInput(), lastHeard: performance.now() };
        if (this.onGuestJoined) this.onGuestJoined(msg.slot);
      }
      if (msg.ev === 'left') this.dropGuest(msg.slot);
    });
  },

  // 加入房間
  joinRoom(code) {
    this.leave();
    this.isHost = false;
    this.open(code, 'guest', (msg) => {
      if (msg.ev === 'welcome') {
        clearTimeout(this.joinTimer);
        this.slot = msg.slot;
        this.lastHeardHost = performance.now();
        if (this.onWelcome) this.onWelcome(msg.slot);
      }
      if (msg.ev === 'not-found') this.fail('找不到這個房間，房號打錯了嗎？');
      if (msg.ev === 'full') this.fail('這個房間已經滿了或已經開打了');
      if (msg.ev === 'left') this.hostGone();
    });
  },

  // 連到轉送伺服器的房間；onSys 處理伺服器自己說的話
  open(code, roleQuery, onSys) {
    let ws;
    try {
      ws = new WebSocket(CONFIG.net.relayUrl + '/room/' + code + '?role=' + roleQuery);
    } catch (e) {
      this.fail('連不到連線伺服器，檢查一下網路');
      return;
    }
    this.ws = ws;
    let opened = false;

    ws.onmessage = (e) => {
      if (this.ws !== ws) return;   // 已經取消的舊連線
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch (err) {
        return;
      }
      opened = true;
      if (msg.t === 'sys') {
        onSys(msg);
      } else if (msg.t === 'from') {
        // 房主收到對手的訊息
        const g = this.guests[msg.f];
        if (!g) return;
        g.lastHeard = performance.now();
        if (this.onMessage) this.onMessage(msg.m, msg.f);
      } else {
        // 對手收到房主的訊息
        this.lastHeardHost = performance.now();
        if (this.onMessage) this.onMessage(msg, 0);
      }
    };

    // 連上之前就斷了 → 連不到伺服器；之後斷了 → 當成對方離開
    ws.onclose = () => {
      if (this.ws !== ws) return;
      if (!opened) this.fail('連不到連線伺服器，檢查一下網路');
      else if (!this.isHost) this.hostGone();
    };

    // 房主等人等很久時，每 20 秒送一下，免得連線因為太安靜被關掉
    const ping = setInterval(() => {
      if (this.ws !== ws) clearInterval(ping);
      else if (this.isHost) this.broadcast({ t: 'ping' });
    }, 20000);

    // 對手 8 秒還沒進房就放棄
    if (!this.isHost) {
      this.joinTimer = setTimeout(() => {
        if (this.ws === ws && !this.slot) this.fail('連不到連線伺服器，再試一次看看');
      }, 8000);
    }
  },

  // ===== 送東西 =====

  raw(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(data));
  },
  // 對手 → 房主
  send(msg) {
    this.raw(msg);
  },
  // 房主 → 某一個對手
  sendTo(slot, msg) {
    this.raw({ to: slot, m: msg });
  },
  // 房主 → 所有對手
  broadcast(msg) {
    this.raw({ to: 0, m: msg });
  },
  // 房主：開打了，不讓別人再進來
  lock() {
    this.raw({ lock: true });
  },

  // ===== 斷線 =====

  // 房主：有沒有對手超過 timeout 秒沒消息，有的話當成離開
  checkTimeouts() {
    const limit = CONFIG.net.timeout * 1000;
    for (const slot of Object.keys(this.guests)) {
      if (performance.now() - this.guests[slot].lastHeard > limit) this.dropGuest(Number(slot));
    }
  },

  // 對手：房主是不是超過 timeout 秒沒消息
  hostTimedOut() {
    return this.slot && performance.now() - this.lastHeardHost > CONFIG.net.timeout * 1000;
  },

  dropGuest(slot) {
    if (!this.guests[slot]) return;
    delete this.guests[slot];
    if (this.onGuestLeft) this.onGuestLeft(slot);
  },

  hostGone() {
    const cb = this.onHostLeft;
    this.leave();
    if (cb) cb();
  },

  fail(text) {
    this.leave();
    if (this.onError) this.onError(text);
  },

  // 關掉連線，回到什麼都沒連的狀態
  leave() {
    clearTimeout(this.joinTimer);
    const ws = this.ws;
    this.ws = null;
    if (ws) ws.close();
    this.slot = 0;
    this.guests = {};
    this.lastHeardHost = 0;
  },
};

function randomCode() {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += ROOM_LETTERS[Math.floor(Math.random() * ROOM_LETTERS.length)];
  }
  return code;
}
