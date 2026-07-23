const fs = require("fs");
const vol = "qowhst4vgz1xxe4dl7igl35i-thm-data";
const nico = fs.readFileSync("data/nicovideo_cookies.txt", "utf8").trim();
const yt = fs.readFileSync("data/youtube_cookies.txt", "utf8").trim();
const crypto = require("crypto");

// 改行をエスケープしてbase64に
const nicoB64 = Buffer.from(nico).toString("base64");
const ytB64 = Buffer.from(yt).toString("base64");

console.log("# CoolifyのTerminalに貼り付けてください");
console.log("");
console.log("cd /var/lib/docker/volumes/" + vol + "/_data");
console.log('echo ' + nicoB64 + ' | base64 -d > nicovideo_cookies.txt');
console.log('echo ' + ytB64 + ' | base64 -d > youtube_cookies.txt');
console.log("ls -la *.txt");
console.log("# 完了したらCoolifyでDeploy");
