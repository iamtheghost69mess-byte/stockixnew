import fs from "fs";
import crypto from "crypto";

function decrypt(ciphertext, secretKeyHex) {
  try {
    const parts = ciphertext.split(":");
    if (parts.length !== 5 || parts[0] !== "enc" || parts[1] !== "v1") return ciphertext;
    const key = Buffer.from(secretKeyHex, "hex");
    const iv = Buffer.from(parts[2], "base64url");
    const tag = Buffer.from(parts[3], "base64url");
    const data = Buffer.from(parts[4], "base64url");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString("utf8");
  } catch (e) {
    return ciphertext;
  }
}

const envPath = "C:\\Users\\Jad\\.stockix\\tenants\\dajo\\.env";
const content = fs.readFileSync(envPath, "utf-8");
let secretKey = "";
for (const line of content.split("\n")) {
  if (line.startsWith("DEPLOYMENT_SECRET_KEY=")) {
    secretKey = line.split("=")[1].trim();
  }
}

const newContent = content.split("\n").map(line => {
  const idx = line.indexOf("=");
  if (idx === -1) return line;
  const key = line.slice(0, idx);
  const val = line.slice(idx + 1).trim();
  if (val.startsWith("enc:v1:")) {
    return `${key}=${decrypt(val, secretKey)}`;
  }
  return line;
}).join("\n");

fs.writeFileSync(envPath, newContent);
console.log("Decrypted .env file successfully!");
