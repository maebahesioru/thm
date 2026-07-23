// Proxmox経由でVMにコマンド実衁E& クチE��ー配置
const https = require("https");
const fs = require("fs");

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const HOST = "192.168.1.210";
const PORT = 8006;
const AUTH_BODY = "username=root@pam&password=ibeharu09212010";

function api(method: string, path: string, body?: string | object, cookie?: string, csrf?: string, contentType?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined;
    const opts: https.RequestOptions = {
      hostname: HOST, port: PORT, path, method, rejectUnauthorized: false,
      headers: {},
    };
    if (cookie) opts.headers!["Cookie"] = `PVEAuthCookie=${cookie}`;
    if (csrf) opts.headers!["CSRFPreventionToken"] = csrf;
    if (bodyStr) {
      opts.headers!["Content-Type"] = contentType || "application/json";
      opts.headers!["Content-Length"] = String(Buffer.byteLength(bodyStr));
    }
    const req = https.request(opts, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        if (res.statusCode && res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
        else resolve(body);
      });
    });
    req.on("error", reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error("timeout")); });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function exec(cookie: string, csrf: string, cmd: string): Promise<string> {
  const r = await api("POST", "/api2/json/nodes/pve/qemu/100/agent/exec", { command: cmd }, cookie, csrf);
  const pid = JSON.parse(r).data?.pid;
  if (!pid) { console.log("EXEC FAIL, response:", r.slice(0, 300)); return `FAIL: ${r.slice(0, 200)}`; }
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const s = await api("GET", `/api2/json/nodes/pve/qemu/100/agent/exec-status?pid=${pid}`, undefined, cookie, csrf);
    const j = JSON.parse(s);
    if (j.data?.exited) {
      return (j.data["out-data"] || "") + (j.data["err-data"] || "");
    }
  }
  return "TIMEOUT";
}

async function main() {
  // Auth
  const authRes = JSON.parse(await api("POST", "/api2/json/access/ticket", AUTH_BODY, undefined, undefined, "application/x-www-form-urlencoded"));
  const ticket = authRes.data.ticket;
  const csrf = authRes.data.CSRFPreventionToken;
  console.log("Auth OK");

  const volPath = "/var/lib/docker/volumes/qowhst4vgz1xxe4dl7igl35i-thm-data/_data";

  // Test connection
  const test = await exec(ticket, csrf, `ls ${volPath}`);
  console.log("Volume test:", test.slice(0, 200));

  if (test.includes("FAIL") || test.includes("No such file")) {
    console.log("Volume not found at expected path, trying to find...");
    const find = await exec(ticket, csrf, "find /var/lib/docker/volumes -name '*thm*' -type d 2>/dev/null");
    console.log("Find:", find);
    return;
  }

  // Write nico cookies (split into chunks for command line limits)
  const nico = fs.readFileSync("data/nicovideo_cookies.txt");
  const yt = fs.readFileSync("data/youtube_cookies.txt");
  const mp3 = fs.readFileSync("data/sokuhou.mp3");

  for (const [name, data] of [["nicovideo_cookies.txt", nico], ["youtube_cookies.txt", yt], ["sokuhou.mp3", mp3]] as [string, Buffer][]) {
    const b64 = data.toString("base64");
    console.log(`\nWriting ${name} (${data.length} bytes)...`);
    // Use python to decode (handles large base64 well)
    const pyCmd = `python3 -c "
import base64
data = base64.b64decode('${b64}')
with open('${volPath}/${name}', 'wb') as f:
    f.write(data)
print('OK')
"`;
    const out = await exec(ticket, csrf, pyCmd);
    console.log(name, ":", out.trim());
  }

  // Verify
  console.log("\nVerification:");
  console.log(await exec(ticket, csrf, `ls -la ${volPath}/`));
  console.log("Done!");
}

main().catch((e) => console.error("FATAL:", e));
