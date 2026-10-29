import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
export type NotificationContent = { destination: string; subject: string; body: string };
export function encryptContent(content: NotificationContent, key: Buffer) { const iv=randomBytes(12); const cipher=createCipheriv('aes-256-gcm',key,iv); const encrypted=Buffer.concat([cipher.update(JSON.stringify(content),'utf8'),cipher.final()]); return Buffer.concat([iv,cipher.getAuthTag(),encrypted]); }
export function decryptContent(value: Buffer, key: Buffer): NotificationContent { const decipher=createDecipheriv('aes-256-gcm',key,value.subarray(0,12)); decipher.setAuthTag(value.subarray(12,28)); return JSON.parse(Buffer.concat([decipher.update(value.subarray(28)),decipher.final()]).toString('utf8')); }
