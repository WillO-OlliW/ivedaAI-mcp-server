import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, renameSync, unlinkSync, openSync, closeSync, fsyncSync, existsSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** Single-process encrypted grant snapshots. The key is provisioned separately. */
export class GrantStore {
  private readonly key: Buffer;
  private readonly lock: string;
  private closed = false;
  constructor(private readonly file: string, keyFile: string, private readonly context: string) {
    if (resolve(file) === resolve(keyFile)) throw new Error("Grant store and key must be separate files");
    this.key = readFileSync(keyFile);
    if (this.key.length !== 32) throw new Error("Grant key must contain exactly 32 random bytes");
    if (process.platform !== "win32" && ((statSync(keyFile).mode & 0o027) || (statSync(dirname(file)).mode & 0o077))) throw new Error("Restrict grant directory and key permissions");
    if (existsSync(file + ".pending")) throw new Error("Incomplete grant write; administrator recovery required");
    this.lock = file + ".lock";
    if (existsSync(this.lock)) {
      const pid = Number(readFileSync(this.lock, "utf8"));
      if (!Number.isSafeInteger(pid) || pid < 1) throw new Error("Invalid grant store lock");
      try { process.kill(pid, 0); throw new Error("Grant store already in use"); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
      unlinkSync(this.lock);
    }
    writeFileSync(this.lock, String(process.pid), { flag: "wx", mode: 0o600 });
  }
  load(): unknown {
    if (!existsSync(this.file)) return undefined;
    if (statSync(this.file).size > 16777216) throw new Error("Grant store exceeds size limit");
    const data = readFileSync(this.file);
    if (data.subarray(0, 4).toString() !== "IVG1" || data.length < 32) throw new Error("Invalid grant store");
    const decipher = createDecipheriv("aes-256-gcm", this.key, data.subarray(4, 16));
    decipher.setAAD(Buffer.from(this.context));
    decipher.setAuthTag(data.subarray(16, 32));
    return JSON.parse(Buffer.concat([decipher.update(data.subarray(32)), decipher.final()]).toString());
  }
  private syncDirectory() {
    if (process.platform !== "win32") { const dir = openSync(dirname(this.file), "r"); try { fsyncSync(dir); } finally { closeSync(dir); } }
  }
  save(value: unknown) {
    if (this.closed) throw new Error("Grant store is closed");
    const plain = Buffer.from(JSON.stringify(value));
    if (plain.length > 16777184) throw new Error("Grant store exceeds size limit");
    const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(this.context));
    const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
    const marker = openSync(this.file + ".pending", "wx", 0o600);
    try { fsyncSync(marker); } finally { closeSync(marker); }
    this.syncDirectory();
    const temporary = this.file + ".tmp";
    const fd = openSync(temporary, "w", 0o600);
    try { writeFileSync(fd, Buffer.concat([Buffer.from("IVG1"), iv, cipher.getAuthTag(), encrypted])); fsyncSync(fd); }
    finally { closeSync(fd); }
    renameSync(temporary, this.file);
    this.syncDirectory();
    unlinkSync(this.file + ".pending");
    this.syncDirectory();
  }
  close() { if (!this.closed) { this.closed = true; this.key.fill(0); unlinkSync(this.lock); } }
}
