import type { NotificationProvider } from './types';
export class FakeNotificationProvider implements NotificationProvider {
  readonly messages: Array<{ deliveryId:string; channel:string; destination:string; subject:string; body:string }> = [];
  async send(message: Parameters<NotificationProvider['send']>[0]) { this.messages.push(message); return { messageId: `fake-${message.deliveryId}` }; }
}
export class HttpNotificationProvider implements NotificationProvider {
  constructor(private readonly url:string,private readonly token:string) { if(!url.startsWith('https://')) throw new Error('Notification provider URL must use HTTPS'); }
  async send(message: Parameters<NotificationProvider['send']>[0]) { const response=await fetch(this.url,{method:'POST',headers:{authorization:`Bearer ${this.token}`,'content-type':'application/json'},body:JSON.stringify(message),signal:AbortSignal.timeout(5000)}); if(!response.ok) throw Object.assign(new Error('Notification provider failed'),{code:`PROVIDER_${response.status}`}); const body=await response.json() as {messageId?:string}; if(!body.messageId) throw new Error('Provider response missing messageId'); return {messageId:body.messageId}; }
}
