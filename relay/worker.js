// 六格小人亂鬥的轉送伺服器（跑在 Cloudflare）
//
// 每個房號是一個 Durable Object（一個小房間）：一個房主＋最多 max-1 個對手（1v1 是 2 人、亂鬥是 3 人）。
// 伺服器不算遊戲，只負責轉送：
//   對手 → 房主：包成 { t: 'from', f: 對手編號, m: 原本的訊息 }
//   房主 → 對手：房主送 { to: 對手編號（0 = 全部）, m: 訊息 }，伺服器把 m 轉給對方
//   房主 → 伺服器：{ lock: true } 開打了，不讓別人再進來
// 伺服器自己要說的話用 { t: 'sys', ev: '...' }：
//   ready             房主：房間開好了
//   taken             房主：這個房號有人在用，換一個
//   joined / left     房主：某個對手進來／離開了（附 slot 編號）
//   welcome           對手：進房成功（附 slot 編號）
//   not-found         對手：沒有這個房間
//   full              對手：房間滿了或已經開打
//   left (slot 0)     對手：房主離開了

const CODE = /^[A-Z]{4}$/;
const MAX_MSG = 16384;   // 一則訊息最多幾個字，太大的直接丟掉

export class Room {
  constructor() {
    this.host = null;          // 房主的 WebSocket
    this.max = 2;              // 這間房最多幾個人（含房主）
    this.locked = false;       // 開打了就不讓人進來
    this.guests = new Map();   // 對手編號（1、2…）→ WebSocket
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected a WebSocket', { status: 426 });
    }
    const params = new URL(request.url).searchParams;
    const role = params.get('role');
    if (role !== 'host' && role !== 'guest') return new Response('Bad role', { status: 400 });

    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    const reply = () => new Response(null, { status: 101, webSocket: client });
    const reject = (ev) => {
      say(server, { ev });
      server.close(1000, ev);
      return reply();
    };

    if (role === 'host') {
      if (this.host) return reject('taken');
      this.host = server;
      this.max = Math.min(3, Math.max(2, Number(params.get('max')) || 2));
      this.locked = false;
      say(server, { ev: 'ready' });
      server.addEventListener('message', (ev) => this.fromHost(ev.data));
      const gone = () => this.hostLeft(server);
      server.addEventListener('close', gone);
      server.addEventListener('error', gone);
      return reply();
    }

    // 對手：找一個空的編號
    if (!this.host) return reject('not-found');
    if (this.locked) return reject('full');
    let slot = 0;
    for (let i = 1; i < this.max; i++) {
      if (!this.guests.has(i)) {
        slot = i;
        break;
      }
    }
    if (!slot) return reject('full');

    this.guests.set(slot, server);
    say(server, { ev: 'welcome', slot });
    say(this.host, { ev: 'joined', slot });

    server.addEventListener('message', (ev) => {
      if (typeof ev.data !== 'string' || ev.data.length > MAX_MSG || !this.host) return;
      try { this.host.send('{"t":"from","f":' + slot + ',"m":' + ev.data + '}'); } catch {}
    });
    const gone = () => {
      if (this.guests.get(slot) !== server) return;
      this.guests.delete(slot);
      if (this.host) say(this.host, { ev: 'left', slot });
    };
    server.addEventListener('close', gone);
    server.addEventListener('error', gone);
    return reply();
  }

  fromHost(data) {
    if (typeof data !== 'string' || data.length > MAX_MSG) return;
    let env;
    try { env = JSON.parse(data); } catch { return; }
    if (env.lock) {
      this.locked = true;
      return;
    }
    if (!env.m) return;
    const text = JSON.stringify(env.m);
    for (const [slot, ws] of this.guests) {
      if (env.to && env.to !== slot) continue;
      try { ws.send(text); } catch {}
    }
  }

  // 房主走了：通知所有對手，整個房間收掉
  hostLeft(ws) {
    if (this.host !== ws) return;
    this.host = null;
    for (const g of this.guests.values()) {
      say(g, { ev: 'left', slot: 0 });
      try { g.close(1000, 'host left'); } catch {}
    }
    this.guests.clear();
  }
}

function say(ws, data) {
  try { ws.send(JSON.stringify({ t: 'sys', ...data })); } catch {}
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/room\/([A-Z]{4})$/);
    if (m && CODE.test(m[1])) {
      return env.ROOM.get(env.ROOM.idFromName(m[1])).fetch(request);
    }
    return new Response('六格小人亂鬥轉送伺服器', { status: 200 });
  },
};
