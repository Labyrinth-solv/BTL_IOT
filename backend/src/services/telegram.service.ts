import { ENV } from '../config/env';

export class TelegramService {
  /**
   * Gửi cảnh báo khẩn cấp qua Telegram Bot tới Thủ kho / Quản trị viên
   */
  static async sendAlert(message: string, chatId?: string | null): Promise<boolean> {
    const targetChatId = chatId || ENV.TELEGRAM_CHAT_ID;
    const botToken = ENV.TELEGRAM_BOT_TOKEN;

    if (!botToken || !targetChatId || botToken === 'your_telegram_bot_token_here') {
      console.log(`[TelegramService] [MOCK NOTIFICATION] To: ${targetChatId || 'Default'}\nMessage: ${message}`);
      return true;
    }

    try {
      const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: targetChatId,
          text: `🚨 CẢNH BÁO BẢO QUẢN KHO NGŨ CỐC 🚨\n\n${message}\n\nThời gian: ${new Date().toLocaleString('vi-VN')}`,
          parse_mode: 'HTML',
        }),
      });

      if (!response.ok) {
        console.warn(`[TelegramService] Telegram API error: ${response.statusText}`);
        return false;
      }
      return true;
    } catch (error) {
      console.error('[TelegramService] Network error sending Telegram alert:', error);
      return false;
    }
  }
}
