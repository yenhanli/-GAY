// 連線：開房、加入、送收資料、斷線判定
// 用 PeerJS 讓兩個瀏覽器直接連。房號 KBZQ → PeerJS 上的名字是 ROOM_PREFIX + 'KBZQ'。

const ROOM_PREFIX = 'six-cell-brawl-v1-';
const ROOM_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // 拿掉 I 和 O，免得跟 1、0 搞混

const Net = {
  peer: null,
  conn: null,
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
    this.peer = new Peer(ROOM_PREFIX + code);

    this.peer.on('open', () => onCode(code));

    this.peer.on('connection', (conn) => {
      // 已經有對手了，第二個人來就告訴他房間滿了
      if (this.conn) {
        conn.on('open', () => {
          conn.send({ t: 'full' });
          setTimeout(() => conn.close(), 500);
        });
        return;
      }
      this.setupConn(conn);
      conn.on('open', () => {
        conn.send({ t: 'welcome' });
        this.markConnected();
      });
    });

    this.peer.on('error', (err) => {
      // 房號剛好被別人用走了，換一個再開
      if (err.type === 'unavailable-id') {
        this.createRoom(onCode);
        return;
      }
      this.fail(errorText(err));
    });
  },

  // 加入房間
  joinRoom(code) {
    this.leave();
    this.isHost = false;
    this.peer = new Peer();

    this.peer.on('open', () => {
      const conn = this.peer.connect(ROOM_PREFIX + code, { serialization: 'json' });
      this.setupConn(conn);
      // 8 秒還沒連上就放棄
      this.joinTimer = setTimeout(() => {
        if (!this.connected) this.fail('連不上這個房間，房號打錯了嗎？');
      }, 8000);
    });

    this.peer.on('error', (err) => this.fail(errorText(err)));
  },

  setupConn(conn) {
    this.conn = conn;
    conn.on('data', (msg) => {
      this.lastHeard = performance.now();
      if (msg.t === 'full') {
        this.fail('這個房間已經滿了');
      } else if (msg.t === 'welcome') {
        this.markConnected();
      } else if (this.onMessage) {
        this.onMessage(msg);
      }
    });
  },

  markConnected() {
    clearTimeout(this.joinTimer);
    this.connected = true;
    this.lastHeard = performance.now();
    if (this.onConnected) this.onConnected();
  },

  send(msg) {
    if (this.conn && this.conn.open) this.conn.send(msg);
  },

  // 超過 timeout 秒沒收到東西就算斷線
  isTimedOut() {
    return this.connected && performance.now() - this.lastHeard > CONFIG.net.timeout * 1000;
  },

  fail(text) {
    // 已經在打了就不管這些錯誤（例如跟 PeerJS 伺服器斷了，但兩人之間還連著），
    // 真的斷了會由 isTimedOut 抓到
    if (this.connected) return;
    this.leave();
    if (this.onError) this.onError(text);
  },

  // 關掉連線，回到什麼都沒連的狀態
  leave() {
    clearTimeout(this.joinTimer);
    if (this.peer) this.peer.destroy();
    this.peer = null;
    this.conn = null;
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

// PeerJS 的錯誤 → 給玩家看的中文
function errorText(err) {
  if (err.type === 'peer-unavailable') return '找不到這個房間，房號打錯了嗎？';
  if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error') {
    return '連不到連線伺服器，檢查一下網路';
  }
  if (err.type === 'browser-incompatible') return '這個瀏覽器不支援連線，換 Chrome 試試';
  return '連線出錯了（' + err.type + '）';
}
