import dgram from 'node:dgram';
import net from 'node:net';
import dns from 'node:dns/promises';
import { isPrivateOrReservedIp } from '../../utils/ssrf.js';
import type { PlayerInfo, ServerInfo } from './types.js';

const A2S_HEADER = Buffer.from([0xff, 0xff, 0xff, 0xff]);
const A2S_INFO_REQ = Buffer.concat([A2S_HEADER, Buffer.from([0x54]), Buffer.from('Source Engine Query\0', 'ascii')]);
const A2S_PLAYER_REQ = Buffer.concat([A2S_HEADER, Buffer.from([0x55, 0xff, 0xff, 0xff, 0xff])]);

/** Validates host IP against SSRF unless in test environment */
async function resolveAndValidateHost(host: string): Promise<string> {
  const isTest = process.env['NODE_ENV'] === 'test';
  let ip = host;
  if (!net.isIP(host)) {
    const lookup = await dns.lookup(host, { family: 4 });
    ip = lookup.address;
  }
  if (!isTest && isPrivateOrReservedIp(ip)) {
    throw new Error(`SSRF blocked: ${host} (${ip}) is a private or reserved address.`);
  }
  return ip;
}

class BufferReader {
  private offset = 0;
  constructor(private readonly buf: Buffer) {}

  remaining(): number {
    return this.buf.length - this.offset;
  }

  readByte(): number {
    if (this.offset >= this.buf.length) return 0;
    return this.buf.readUInt8(this.offset++);
  }

  readInt16LE(): number {
    if (this.offset + 2 > this.buf.length) return 0;
    const v = this.buf.readInt16LE(this.offset);
    this.offset += 2;
    return v;
  }

  readUInt16LE(): number {
    if (this.offset + 2 > this.buf.length) return 0;
    const v = this.buf.readUInt16LE(this.offset);
    this.offset += 2;
    return v;
  }

  readInt32LE(): number {
    if (this.offset + 4 > this.buf.length) return 0;
    const v = this.buf.readInt32LE(this.offset);
    this.offset += 4;
    return v;
  }

  readFloatLE(): number {
    if (this.offset + 4 > this.buf.length) return 0;
    const v = this.buf.readFloatLE(this.offset);
    this.offset += 4;
    return v;
  }

  readString(): string {
    const start = this.offset;
    while (this.offset < this.buf.length && this.buf[this.offset] !== 0) {
      this.offset++;
    }
    const str = this.buf.toString('utf8', start, this.offset);
    if (this.offset < this.buf.length) this.offset++; // skip null
    return str;
  }

  readBytes(len: number): Buffer {
    const slice = this.buf.subarray(this.offset, this.offset + len);
    this.offset += len;
    return slice;
  }
}

/** Parses A2S_INFO payload (Source 0x49 or GoldSrc 0x6D) */
export function parseA2SInfoResponse(buf: Buffer, pingMs: number): ServerInfo {
  if (buf.length < 5) throw new Error('A2S_INFO response too short');
  const reader = new BufferReader(buf);
  // Skip 4-byte header
  reader.readBytes(4);
  const type = reader.readByte();

  if (type === 0x49) {
    // Source Engine response
    const protocol = reader.readByte();
    const name = reader.readString();
    const map = reader.readString();
    const folder = reader.readString();
    const game = reader.readString();
    reader.readUInt16LE(); // steam app id
    const players = reader.readByte();
    const maxPlayers = reader.readByte();
    const bots = reader.readByte();
    const typeChar = String.fromCharCode(reader.readByte());
    const envChar = String.fromCharCode(reader.readByte());
    const visibilityByte = reader.readByte();
    const vacByte = reader.readByte();
    const version = reader.readString();

    return {
      name,
      map,
      folder,
      game,
      players,
      maxPlayers,
      bots,
      serverType: typeChar === 'd' ? 'dedicated' : typeChar === 'p' ? 'proxy' : 'non-dedicated',
      environment: envChar === 'l' ? 'linux' : envChar === 'w' ? 'windows' : 'mac',
      visibility: visibilityByte === 0 ? 'public' : 'private',
      vac: vacByte === 1,
      version,
      pingMs,
      protocol,
    };
  } else if (type === 0x6d) {
    // GoldSrc response
    reader.readString(); // server address
    const name = reader.readString();
    const map = reader.readString();
    const folder = reader.readString();
    const game = reader.readString();
    const players = reader.readByte();
    const maxPlayers = reader.readByte();
    const protocol = reader.readByte();
    const typeChar = String.fromCharCode(reader.readByte());
    const envChar = String.fromCharCode(reader.readByte());
    const visibilityByte = reader.readByte();

    return {
      name,
      map,
      folder,
      game,
      players,
      maxPlayers,
      bots: 0,
      serverType: typeChar === 'd' ? 'dedicated' : typeChar === 'p' ? 'proxy' : 'non-dedicated',
      environment: envChar === 'l' ? 'linux' : envChar === 'w' ? 'windows' : 'mac',
      visibility: visibilityByte === 0 ? 'public' : 'private',
      vac: false,
      version: `protocol ${protocol}`,
      pingMs,
      protocol,
    };
  }

  throw new Error(`Unknown A2S_INFO response type: 0x${type.toString(16)}`);
}

/** Parses A2S_PLAYER payload (0x44) */
export function parseA2SPlayerResponse(buf: Buffer): PlayerInfo[] {
  if (buf.length < 5) return [];
  const reader = new BufferReader(buf);
  reader.readBytes(4); // 0xffffffff
  const type = reader.readByte();
  if (type !== 0x44) return [];

  const count = reader.readByte();
  const players: PlayerInfo[] = [];

  for (let i = 0; i < count && reader.remaining() > 0; i++) {
    const index = reader.readByte();
    const name = reader.readString();
    const score = reader.readInt32LE();
    const duration = Math.round(reader.readFloatLE());
    // Filter empty bot placeholders if name is empty
    if (name.trim()) {
      players.push({
        index,
        name,
        score,
        duration: Math.max(0, duration),
      });
    }
  }

  return players.sort((a, b) => b.score - a.score);
}

/** Sends A2S_INFO query with challenge handling */
export async function queryA2SInfo(host: string, port: number, timeoutMs = 2500): Promise<ServerInfo> {
  const ip = await resolveAndValidateHost(host);
  const client = dgram.createSocket('udp4');
  const startTime = Date.now();

  return new Promise<ServerInfo>((resolve, reject) => {
    let timer: NodeJS.Timeout;

    const cleanup = () => {
      clearTimeout(timer);
      try { client.close(); } catch {}
    };

    timer = setTimeout(() => {
      cleanup();
      reject(new Error(`A2S_INFO query to ${host}:${port} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    client.on('error', (err) => {
      cleanup();
      reject(err);
    });

    client.on('message', (msg) => {
      const pingMs = Math.max(1, Date.now() - startTime);
      // Check if server sent challenge (0x41)
      if (msg.length >= 9 && msg.readInt32LE(0) === -1 && msg[4] === 0x41) {
        const challenge = msg.subarray(5, 9);
        const retryPacket = Buffer.concat([A2S_INFO_REQ, challenge]);
        client.send(retryPacket, port, ip, (err) => {
          if (err) { cleanup(); reject(err); }
        });
        return;
      }

      try {
        const res = parseA2SInfoResponse(msg, pingMs);
        cleanup();
        resolve(res);
      } catch (err) {
        cleanup();
        reject(err);
      }
    });

    client.send(A2S_INFO_REQ, port, ip, (err) => {
      if (err) { cleanup(); reject(err); }
    });
  });
}

/** Sends A2S_PLAYER query with challenge handling */
export async function queryA2SPlayers(host: string, port: number, timeoutMs = 2500): Promise<PlayerInfo[]> {
  const ip = await resolveAndValidateHost(host);
  const client = dgram.createSocket('udp4');

  return new Promise<PlayerInfo[]>((resolve, reject) => {
    let timer: NodeJS.Timeout;

    const cleanup = () => {
      clearTimeout(timer);
      try { client.close(); } catch {}
    };

    timer = setTimeout(() => {
      cleanup();
      reject(new Error(`A2S_PLAYER query to ${host}:${port} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    client.on('error', (err) => {
      cleanup();
      reject(err);
    });

    client.on('message', (msg) => {
      if (msg.length >= 9 && msg.readInt32LE(0) === -1 && msg[4] === 0x41) {
        // Challenge received, send A2S_PLAYER with challenge
        const challenge = msg.subarray(5, 9);
        const playerWithChallenge = Buffer.concat([A2S_HEADER, Buffer.from([0x55]), challenge]);
        client.send(playerWithChallenge, port, ip, (err) => {
          if (err) { cleanup(); reject(err); }
        });
        return;
      }

      if (msg.length >= 5 && msg.readInt32LE(0) === -1 && msg[4] === 0x44) {
        const list = parseA2SPlayerResponse(msg);
        cleanup();
        resolve(list);
      }
    });

    client.send(A2S_PLAYER_REQ, port, ip, (err) => {
      if (err) { cleanup(); reject(err); }
    });
  });
}

// ---- VarInt and Minecraft Server List Ping (SLP) ----

function writeVarInt(val: number): Buffer {
  const bytes: number[] = [];
  let v = val;
  while (true) {
    if ((v & ~0x7f) === 0) {
      bytes.push(v);
      break;
    }
    bytes.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  return Buffer.from(bytes);
}

function readVarInt(buf: Buffer, offset: number): { value: number; bytesRead: number } {
  let numRead = 0;
  let result = 0;
  let read: number;
  do {
    if (offset + numRead >= buf.length) throw new Error('VarInt exceeded buffer bounds');
    read = buf[offset + numRead]!;
    result |= (read & 0x7f) << (7 * numRead);
    numRead++;
    if (numRead > 5) throw new Error('VarInt is too big');
  } while ((read & 0x80) !== 0);

  return { value: result, bytesRead: numRead };
}

/** Queries Minecraft Server List Ping (SLP) over TCP */
export async function queryMinecraftPing(
  host: string,
  port: number,
  timeoutMs = 3000
): Promise<{ info: ServerInfo; players: PlayerInfo[] }> {
  const ip = await resolveAndValidateHost(host);
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let timer: NodeJS.Timeout;
    const chunks: Buffer[] = [];

    const cleanup = () => {
      clearTimeout(timer);
      socket.destroy();
    };

    timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Minecraft SLP ping to ${host}:${port} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    socket.connect(port, ip, () => {
      // 1. Handshake Packet (ID 0x00)
      const hostBuf = Buffer.from(host, 'utf8');
      const handshakePayload = Buffer.concat([
        Buffer.from([0x00]), // packet ID
        writeVarInt(765), // protocol version (1.20.4)
        writeVarInt(hostBuf.length),
        hostBuf,
        Buffer.from([(port >> 8) & 0xff, port & 0xff]), // port uint16 BE
        writeVarInt(1), // next state: status (1)
      ]);
      const handshakePacket = Buffer.concat([writeVarInt(handshakePayload.length), handshakePayload]);

      // 2. Status Request Packet (ID 0x00, empty payload)
      const statusReqPayload = Buffer.from([0x00]);
      const statusReqPacket = Buffer.concat([writeVarInt(statusReqPayload.length), statusReqPayload]);

      socket.write(Buffer.concat([handshakePacket, statusReqPacket]));
    });

    socket.on('data', (data) => {
      chunks.push(data);
      const all = Buffer.concat(chunks);
      try {
        const { value: packetLen, bytesRead: lenBytes } = readVarInt(all, 0);
        if (all.length < packetLen + lenBytes) return; // wait for more data

        let cursor = lenBytes;
        const { value: packetId, bytesRead: idBytes } = readVarInt(all, cursor);
        cursor += idBytes;
        if (packetId !== 0x00) throw new Error(`Unexpected packet ID: 0x${packetId.toString(16)}`);

        const { value: strLen, bytesRead: strBytes } = readVarInt(all, cursor);
        cursor += strBytes;

        const jsonStr = all.subarray(cursor, cursor + strLen).toString('utf8');
        const parsed = JSON.parse(jsonStr);
        const pingMs = Math.max(1, Date.now() - startTime);

        const onlineCount = Number(parsed.players?.online ?? 0);
        const maxCount = Number(parsed.players?.max ?? 0);
        const sample: Array<{ name: string; id: string }> = parsed.players?.sample ?? [];

        const players: PlayerInfo[] = sample.map((p, idx) => ({
          index: idx,
          name: p.name,
          score: 0,
          duration: 0,
          steamId: p.id,
        }));

        let motd = 'Minecraft Server';
        if (typeof parsed.description === 'string') motd = parsed.description;
        else if (typeof parsed.description?.text === 'string') motd = parsed.description.text;

        const info: ServerInfo = {
          name: motd.replace(/§[0-9a-fk-or]/gi, '').trim() || 'Minecraft Server',
          map: 'world',
          folder: 'minecraft',
          game: 'Minecraft',
          players: onlineCount,
          maxPlayers: maxCount,
          bots: 0,
          serverType: 'dedicated',
          environment: 'linux',
          visibility: 'public',
          vac: false,
          version: String(parsed.version?.name ?? 'Minecraft Java'),
          pingMs,
        };

        cleanup();
        resolve({ info, players });
      } catch (err) {
        // If buffer was incomplete, wait; otherwise throw
        if (chunks.reduce((acc, c) => acc + c.length, 0) > 65536) {
          cleanup();
          reject(err);
        }
      }
    });

    socket.on('error', (err) => {
      cleanup();
      reject(err);
    });
  });
}
