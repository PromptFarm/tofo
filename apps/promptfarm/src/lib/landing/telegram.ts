const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateLandingEmail(input: string): string | null {
  const value = input.trim().toLowerCase();
  if (!value || value.length > 254) return null;
  if (/[\u0000-\u001f\u007f\r\n]/.test(value)) return null;
  if (!EMAIL_REGEX.test(value)) return null;
  return value;
}

export function sanitizeLandingMessage(input: string): string | null {
  const value = input
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim();

  if (!value || value.length > 2000) return null;
  if (value.split("\n").length > 20) return null;
  return value;
}

async function sendTelegramMessage(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    const keys = Object.keys(process.env).filter(k => k.includes("TELEGRAM") || k.includes("telegram"));
    console.error("[telegram] missing vars, keys found: %s", keys.join(",") || "(none)");
    return false;
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error("[telegram] API error status=%d body=%s", response.status, body);
  }

  return response.ok;
}

export async function sendFeedbackLead(
  message: string,
  email?: string,
): Promise<boolean> {
  return await sendTelegramMessage(
    [
      "New TOFO feedback",
      `Email: ${email ?? "-"}`,
      "",
      message,
    ].join("\n"),
  );
}

export async function sendWaitlistLead(email: string): Promise<boolean> {
  return await sendTelegramMessage(
    ["New TOFO waitlist lead", `Email: ${email}`].join("\n"),
  );
}
