// 連線：開房、加入、送收資料、斷線判定
//
// 兩台電腦都連到 Cloudflare 上的轉送伺服器（程式在 relay/worker.js），
// 伺服器把一邊的訊息轉給另一邊。這樣不管兩邊在什麼網路都連得上。
// 房號 KBZQ → 連到 轉送伺服器/room/KBZQ

const ROOM_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // 拿掉 I 和 O，免得跟 1、0 搞混

const Net = {
  ws: null,
  isHost: false,
  connected: false,
  lastHeard: 0,        // 最後一次收到對方東西的時間（performance.now()）
  joinTimer: null,

  // 房主這邊：對手送來的按鍵，格式跟 Input 一樣，可以直接丟給 Player.update
  remoteInput: { up: false, down: false, left: false, right: false, mouseX: 0, mouseY: 0 },

  onConnected: null,   // 兩人連上時呼叫
  onMessage: null,     // 收到遊戲資料時呼叫
  onError: null,       // 出錯時呼叫，參數是給玩家看的中文

  // 開房間：拿到房號後呼叫 onCode(房號)
  createRoom(onCode) {
    this.leave();
    this.isHost = true;
    const code = randomCode();
    this.open(code, 'host', (ev) => {
      if (ev === 'ready') onCode(code);
      if (ev === 'taken') this.createRoom(onCode);   // 房號剛好有人在用，換一個再開
      if (ev === 'joined') this.markConnected();
    });
  },

  // 加入房間
  joinRoom(code) {
    this.leave();
    this.isHost = false;
    this.open(code, 'guest', (ev) => {
      if (ev === 'welcome') this.markConnected();
      if (ev === 'not-found') this.fail('找不到這個房間，房號打錯了嗎？');
      if (ev === 'full') this.fail('這個房間已經滿了');
    });
  },

  // 連到轉送伺服器的房間；onSys 處理伺服器自己說的話
  open(code, role, onSys) {
    let ws;
    try {
      ws = new WebSocket(CONFIG.net.relayUrl + '/room/' + code + '?role=' + role);
    } catch (e) {
      this.fail('連不到連線伺服器，檢查一下網路');
      return;
    }
    this.ws = ws;

    ws.onmessage = (e) => {
      if (this.ws !== ws) return;   // 已經取消的舊連線
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch (err) {
        return;
      }
      this.lastHeard = performance.now();
      if (msg.t === 'sys') onSys(msg.ev);
      else if (this.onMessage) this.onMessage(msg);
    };

    // 還沒開打就斷了 → 一定是連不到伺服器；開打後斷了交給 isTimedOut 判斷
    ws.onclose = () => {
      if (this.ws === ws && !this.connected) this.fail('連不到連線伺服器，檢查一下網路');
    };

    // 房主等人等很久時，每 20 秒送一下，免得連線因為太安靜被關掉
    const ping = setInterval(() => {
      if (this.ws !== ws) clearInterval(ping);
      else if (!this.connected) this.send({ t: 'ping' });
    }, 20000);

    // 8 秒還沒進房就放棄
    this.joinTimer = setTimeout(() => {
      if (this.ws === ws && !this.connected && role === 'guest') {
        this.fail('連不到連線伺服器，再試一次看看');
      }
    }, 8000);
  },

  markConnected() {
    clearTimeout(this.joinTimer);
    this.connected = true;
    this.lastHeard = performance.now();
    if (this.onConnected) this.onConnected();
  },

  send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  },

  // 超過 timeout 秒沒收到東西就算斷線
  isTimedOut() {
    return this.connected && performance.now() - this.lastHeard > CONFIG.net.timeout * 1000;
  },

  fail(text) {
    if (this.connected) return;   // 已經在打了，斷線交給 isTimedOut
    this.leave();
    if (this.onError) this.onError(text);
  },

  // 關掉連線，回到什麼都沒連的狀態
  leave() {
    clearTimeout(this.joinTimer);
    const ws = this.ws;
    this.ws = null;
    if (ws) ws.close();
    this.connected = false;
    this.lastHeard = 0;
    this.remoteInput = { up: false, down: false, left: false, right: false, mouseX: 0, mouseY: 0 };
  },
};

function randomCode() {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += ROOM_LETTERS[Math.floor(Math.random() * ROOM_LETTERS.length)];
  }
  return code;
}
