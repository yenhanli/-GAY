// 六格小人亂鬥的轉送伺服器（跑在 Cloudflare）
//
// 每個房號是一個 Durable Object（一個小房間），裡面最多兩個人：房主和對手。
// 伺服器不算遊戲，只把一邊傳來的訊息原封不動轉給另一邊。
// 伺服器自己要說的話用 { t: 'sys', ev: '...' }：
//   ready      房主：房間開好了
//   taken      房主：這個房號有人在用，換一個
//   joined     房主：對手進來了
//   welcome    對手：進房成功
//   not-found  對手：沒有這個房間
//   full       對手：房間滿了
//   left       另一個人離開了

const CODE = /^[A-Z]{4}$/;
const MAX_MSG = 16384;   // 一則訊息最多幾個字，太大的直接丟掉

export class Room {
  constructor() {
    this.host = null;    // 房主的 WebSocket
    this.guest = null;   // 對手的 WebSocket
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected a WebSocket', { status: 426 });
    }
    const role = new URL(request.url).searchParams.get('role');
    if (role !== 'host' && role !== 'guest') return new Response('Bad role', { status: 400 });

    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    const say = (ws, ev) => {
      try { ws.send(JSON.stringify({ t: 'sys', ev })); } catch {}
    };
    const reject = (ev) => {
      say(server, ev);
      server.close(1000, ev);
      return new Response(null, { status: 101, webSocket: client });
    };

    if (role === 'host') {
      if (this.host) return reject('taken');
      this.host = server;
      say(server, 'ready');
    } else {
      if (!this.host) return reject('not-found');
      if (this.guest) return reject('full');
      this.guest = server;
      say(server, 'welcome');
      say(this.host, 'joined');
    }

    // 收到就轉給另一個人
    server.addEventListener('message', (ev) => {
      if (typeof ev.data !== 'string' || ev.data.length > MAX_MSG) return;
      const other = server === this.host ? this.guest : this.host;
      if (other) {
        try { other.send(ev.data); } catch {}
      }
    });

    // 有人離開：房主走了整個房間就收掉；對手走了就空出位子
    const gone = () => {
      if (server === this.host) {
        this.host = null;
        if (this.guest) {
          say(this.guest, 'left');
          try { this.guest.close(1000, 'host left'); } catch {}
          this.guest = null;
        }
      } else if (server === this.guest) {
        this.guest = null;
        if (this.host) say(this.host, 'left');
      }
    };
    server.addEventListener('close', gone);
    server.addEventListener('error', gone);

    return new Response(null, { status: 101, webSocket: client });
  }
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
