import net from 'node:net';
import dgram from 'node:dgram';
import dns from 'node:dns/promises';
import { isPrivateOrReservedIp } from '../../utils/ssrf.js';

export interface GameRconClient {
  connect(): Promise<void>;
  execute(command: string): Promise<string>;
  disconnect(): Promise<void>;
}

export class RconError extends Error {
  constructor(message: string, public readonly code: string = 'RCON_ERROR', public readonly statusCode = 502) {
    super(message);
    this.name = 'RconError';
  }
}

async function validateHost(host: string): Promise<string> {
  const isTest = process.env['NODE_ENV'] === 'test';
  let ip = host;
  if (!net.isIP(host)) {
    const lookup = await dns.lookup(host, { family: 4 });
    ip = lookup.address;
  }
  if (!isTest && isPrivateOrReservedIp(ip)) {
    throw new RconError(`SSRF blocked: ${host} resolves to a private or reserved address.`, 'SSRF_BLOCKED', 403);
  }
  return ip;
}

const SERVERDATA_AUTH = 3;
const SERVERDATA_AUTH_RESPONSE = 2;
const SERVERDATA_EXECCOMMAND = 2;
const SERVERDATA_RESPONSE_VALUE = 0;

/** Valve Source & Minecraft RCON client over TCP */
export class SourceRconClient implements GameRconClient {
  private socket: net.Socket | null = null;
  private reqId = 1;
  private authed = false;
  private buffer = Buffer.alloc(0);

  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly password: string,
    private readonly timeoutMs = 4000
  ) {}

  async connect(): Promise<void> {
    if (this.socket && this.authed) return;
    const ip = await validateHost(this.host);

    return new Promise<void>((resolve, reject) => {
      const sock = new net.Socket();
      let timer: NodeJS.Timeout;

      const cleanup = () => {
        clearTimeout(timer);
        sock.removeAllListeners('data');
        sock.removeAllListeners('error');
      };

      timer = setTimeout(() => {
        cleanup();
        sock.destroy();
        reject(new RconError(`RCON connection to ${this.host}:${this.port} timed out`, 'TIMEOUT', 504));
      }, this.timeoutMs);

      sock.connect(this.port, ip, () => {
        this.socket = sock;
        // Authenticate immediately
        const authReqId = ++this.reqId;
        const authPacket = this.encodePacket(authReqId, SERVERDATA_AUTH, this.password);

        const onAuthData = (data: Buffer) => {
          this.buffer = Buffer.concat([this.buffer, data]);
          while (this.buffer.length >= 12) {
            const size = this.buffer.readInt32LE(0);
            if (this.buffer.length < size + 4) break; // incomplete packet

            const packet = this.buffer.subarray(0, size + 4);
            this.buffer = this.buffer.subarray(size + 4);

            const id = packet.readInt32LE(4);
            const type = packet.readInt32LE(8);

            if (type === SERVERDATA_AUTH_RESPONSE) {
              cleanup();
              if (id === -1) {
                sock.destroy();
                this.socket = null;
                reject(new RconError('RCON authentication failed: bad password', 'AUTH_FAILED', 401));
                return;
              }
              this.authed = true;
              resolve();
              return;
            }
          }
        };

        sock.on('data', onAuthData);
        sock.write(authPacket);
      });

      sock.on('error', (err) => {
        cleanup();
        this.socket = null;
        reject(new RconError(`RCON network error: ${err.message}`, 'CONNECTION_FAILED', 502));
      });
    });
  }

  async execute(command: string): Promise<string> {
    if (!this.socket || !this.authed) await this.connect();
    const sock = this.socket!;
    const cmdId = ++this.reqId;
    const packet = this.encodePacket(cmdId, SERVERDATA_EXECCOMMAND, command);

    return new Promise<string>((resolve) => {
      let timer: NodeJS.Timeout;
      let output = '';

      const cleanup = () => {
        clearTimeout(timer);
        sock.removeAllListeners('data');
      };

      timer = setTimeout(() => {
        cleanup();
        resolve(output.trim()); // Return whatever was received before timeout
      }, this.timeoutMs);

      const onData = (data: Buffer) => {
        this.buffer = Buffer.concat([this.buffer, data]);
        while (this.buffer.length >= 12) {
          const size = this.buffer.readInt32LE(0);
          if (this.buffer.length < size + 4) break;

          const p = this.buffer.subarray(0, size + 4);
          this.buffer = this.buffer.subarray(size + 4);

          const id = p.readInt32LE(4);
          const type = p.readInt32LE(8);

          if (id === cmdId && type === SERVERDATA_RESPONSE_VALUE) {
            // Null-terminated string starting at offset 12
            let end = 12;
            while (end < p.length - 2 && p[end] !== 0) end++;
            const text = p.subarray(12, end).toString('utf8');
            output += text;

            // In Source RCON, response ends when packet is done or small
            cleanup();
            resolve(output.trim());
            return;
          }
        }
      };

      sock.on('data', onData);
      sock.write(packet);
    });
  }

  async disconnect(): Promise<void> {
    if (this.socket) {
      try { this.socket.destroy(); } catch {}
      this.socket = null;
      this.authed = false;
      this.buffer = Buffer.alloc(0);
    }
  }

  private encodePacket(id: number, type: number, body: string): Buffer {
    const bodyBuf = Buffer.from(body, 'utf8');
    const size = 4 + 4 + bodyBuf.length + 1 + 1; // ID + Type + Body + 2 null bytes
    const buf = Buffer.alloc(size + 4);
    buf.writeInt32LE(size, 0);
    buf.writeInt32LE(id, 4);
    buf.writeInt32LE(type, 8);
    bodyBuf.copy(buf, 12);
    buf.writeInt8(0, 12 + bodyBuf.length);
    buf.writeInt8(0, 13 + bodyBuf.length);
    return buf;
  }
}

/** Valve GoldSrc (CS 1.6, Half-Life) UDP RCON Client */
export class GoldSrcRconClient implements GameRconClient {
  private client: dgram.Socket | null = null;
  private challenge: string | null = null;

  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly password: string,
    private readonly timeoutMs = 3500
  ) {}

  async connect(): Promise<void> {
    if (this.client && this.challenge) return;
    const ip = await validateHost(this.host);
    const client = dgram.createSocket('udp4');
    this.client = client;

    return new Promise<void>((resolve, reject) => {
      let timer: NodeJS.Timeout;

      const cleanup = () => {
        clearTimeout(timer);
        client.removeAllListeners('message');
        client.removeAllListeners('error');
      };

      timer = setTimeout(() => {
        cleanup();
        client.close();
        this.client = null;
        reject(new RconError(`GoldSrc challenge query to ${this.host}:${this.port} timed out`, 'TIMEOUT', 504));
      }, this.timeoutMs);

      client.on('error', (err) => {
        cleanup();
        this.client = null;
        reject(new RconError(`GoldSrc UDP error: ${err.message}`, 'CONNECTION_FAILED', 502));
      });

      client.on('message', (msg) => {
        const str = msg.toString('utf8');
        // Response format: \xFF\xFF\xFF\xFFrcon challenge <challenge_id>\n
        const match = str.match(/challenge\s+(\d+)/i);
        if (match && match[1]) {
          cleanup();
          this.challenge = match[1];
          resolve();
        }
      });

      // Request challenge: \xFF\xFF\xFF\xFFchallenge rcon\n
      const req = Buffer.concat([Buffer.from([0xff, 0xff, 0xff, 0xff]), Buffer.from('challenge rcon\n', 'ascii')]);
      client.send(req, this.port, ip);
    });
  }

  async execute(command: string): Promise<string> {
    if (!this.client || !this.challenge) await this.connect();
    const ip = await validateHost(this.host);
    const client = this.client!;

    return new Promise<string>((resolve, reject) => {
      let timer: NodeJS.Timeout;

      const cleanup = () => {
        clearTimeout(timer);
        client.removeAllListeners('message');
      };

      timer = setTimeout(() => {
        cleanup();
        resolve('Command dispatched (no response received)');
      }, this.timeoutMs);

      client.on('message', (msg) => {
        cleanup();
        // Response header: \xFF\xFF\xFF\xFFl<response> or \xFF\xFF\xFF\xFF<response>
        let res = msg.toString('utf8');
        res = res.replace(/^\xff{4}l?/, '').trim();
        resolve(res);
      });

      // Send command: \xFF\xFF\xFF\xFFrcon <challenge> "<password>" <command>\n
      const cmdStr = `rcon ${this.challenge} "${this.password}" ${command}\n`;
      const packet = Buffer.concat([Buffer.from([0xff, 0xff, 0xff, 0xff]), Buffer.from(cmdStr, 'utf8')]);
      client.send(packet, this.port, ip, (err) => {
        if (err) { cleanup(); reject(err); }
      });
    });
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try { this.client.close(); } catch {}
      this.client = null;
      this.challenge = null;
    }
  }
}

/** Moderation command builders by game engine */
export function buildKickCommand(gameType: string, targetIdentifier: string, targetName: string, reason?: string): string {
  const safeReason = (reason ?? 'Kicked by administrator').replace(/["\r\n]/g, ' ').slice(0, 120);
  const safeTarget = targetName.replace(/["\r\n]/g, '').slice(0, 60);

  switch (gameType) {
    case 'minecraft':
      return `kick ${safeTarget} ${safeReason}`;
    case 'source':
      // Source Engine supports kickid <userid> or kick "<name>"
      if (/^\d+$/.test(targetIdentifier)) {
        return `kickid ${targetIdentifier} "${safeReason}"`;
      }
      return `kick "${safeTarget}" ${safeReason}`;
    case 'goldsrc':
      if (/^\d+$/.test(targetIdentifier)) {
        return `kick #${targetIdentifier} "${safeReason}"`;
      }
      return `kick "${safeTarget}"`;
    case 'rust':
      return `kick "${targetIdentifier || safeTarget}" "${safeReason}"`;
    default:
      throw new RconError(`Moderation is unsupported for game type: ${gameType}`, 'UNSUPPORTED_GAME', 422);
  }
}

export function buildBanCommand(
  gameType: string,
  targetIdentifier: string,
  targetName: string,
  durationMinutes = 0,
  reason?: string
): string {
  const safeReason = (reason ?? 'Banned by administrator').replace(/["\r\n]/g, ' ').slice(0, 120);
  const safeTarget = targetName.replace(/["\r\n]/g, '').slice(0, 60);
  const minutes = Math.max(0, Math.floor(durationMinutes));

  switch (gameType) {
    case 'minecraft':
      // Minecraft Java: /ban <player> [reason]
      return `ban ${safeTarget} ${safeReason} (${minutes > 0 ? `${minutes}m` : 'Permanent'})`;
    case 'source':
      // Source Engine: banid <minutes> <steamid_or_userid> kick
      const id = targetIdentifier && targetIdentifier !== '0' ? targetIdentifier : safeTarget;
      return `banid ${minutes} "${id}" kick; writeid`;
    case 'goldsrc':
      const gId = targetIdentifier && targetIdentifier !== '0' ? targetIdentifier : safeTarget;
      return `banid ${minutes} "${gId}" kick; writeid`;
    case 'rust':
      return `ban "${targetIdentifier || safeTarget}" "${safeReason}"`;
    default:
      throw new RconError(`Moderation is unsupported for game type: ${gameType}`, 'UNSUPPORTED_GAME', 422);
  }
}
