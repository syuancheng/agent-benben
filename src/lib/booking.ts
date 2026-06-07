import type { ChatMessage, ChatResult } from "./types";

type BookingDetails = {
  className: string;
  sessionLabel: string;
  location: string;
  route: string;
  needsDateTime?: boolean;
};

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const NIGHT_RUN_PACES = ["7'30\"", "7'00\"", "6'30\"", "6'00\"", "5'50\"", "5'30\""];

export async function handleBookingShortcut(messages: ChatMessage[]): Promise<ChatResult | null> {
  const latest = getLatestUserMessage(messages);
  if (!latest) {
    return null;
  }

  const context = messages.map((message) => message.content).join("\n");
  const wantsSignup = hasSignupIntent(context);

  if (!wantsSignup) {
    return null;
  }

  const booking = extractBookingDetails(context);

  const email = extractEmail(latest.content) || extractEmail(context);
  const name = extractName(context);
  const pace = extractPace(context);

  if (!booking) {
    return buildBookingReply(
      "Sure, I can help you sign up. Which class and session would you like to join? Please include your name and email address.",
    );
  }

  if (booking.needsDateTime) {
    return buildBookingReply(
      [
        `Sure, I can help you sign up for ${booking.className}.`,
        "",
        "Please provide your name, email address, and preferred class date/time.",
      ].join("\n"),
    );
  }

  if (!name || !email || (booking.className === "Night Run" && !pace)) {
    const missing = [
      !name ? "name" : null,
      !email ? "email address" : null,
      booking.className === "Night Run" && !pace ? `pace group (${NIGHT_RUN_PACES.join(", ")})` : null,
    ].filter(Boolean);

    return buildBookingReply(
      [
        `Sure, I can help you sign up for ${booking.className}.`,
        "",
        `Session: ${booking.sessionLabel}`,
        `Meeting point: ${booking.location}`,
        `Route: ${booking.route}`,
        "",
        `Please provide your ${formatMissing(missing)} to complete the signup.`,
      ].join("\n"),
    );
  }

  return buildBookingReply(
    [
      "预约成功！",
      "",
      `Booking Code：${createBookingCode()}`,
      `Name：${name}`,
      `Email：${email}`,
      `Time：${booking.sessionLabel}`,
      `Class：${booking.className}${booking.className === "Night Run" && pace ? ` (${pace} pace group)` : ""}`,
      `Meeting Point：${booking.location}`,
      `Route：${booking.route}`,
      "",
      "Reminder: Please arrive early. For Night Run, choose a comfortable pace and do not force a faster group. If you have pain, injury, pregnancy, high blood pressure, cardiovascular disease, recent surgery, medication concerns, or any other medical condition, please consult a doctor first and inform the coach before class.",
      "Cancellation policy: Cancel more than 12 hours before class for a full credit refund. Late cancel (within 12 hours) or no-show will forfeit the class credit. Unlimited pass users may be charged an additional SGD 10–15 penalty.",
    ].join("\n"),
  );
}

function extractBookingDetails(text: string): BookingDetails | null {
  const lower = text.toLowerCase();

  if (/(night\s*run|夜跑)/i.test(text)) {
    if (lower.includes("tuesday") || lower.includes("周二") || lower.includes("星期二")) {
      return {
        className: "Night Run",
        sessionLabel: "Tuesday 19:00",
        location: "Red Dot Design Museum, Marina Bay, Singapore",
        route: "Marina Bay",
      };
    }

    if (lower.includes("thursday") || lower.includes("周四") || lower.includes("星期四")) {
      return {
        className: "Night Run",
        sessionLabel: "Thursday 19:00",
        location: "Red Dot Design Museum, Marina Bay, Singapore",
        route: "Marina Bay",
      };
    }

    if (lower.includes("saturday") || lower.includes("周六") || lower.includes("星期六")) {
      return {
        className: "Night Run",
        sessionLabel: "Saturday 07:00",
        location: "Parkland Green, East Coast, Singapore",
        route: "East Coast",
      };
    }

    return {
      className: "Night Run",
      sessionLabel: "Please choose Tuesday 19:00, Thursday 19:00, or Saturday 07:00",
      location: "Tuesday/Thursday meet at Red Dot Design Museum; Saturday meets at Parkland Green",
      route: "Tuesday/Thursday: Marina Bay; Saturday: East Coast",
    };
  }

  if (/cycling|单车/i.test(text)) {
    return genericClass("Cycling class", text);
  }

  if (/yoga|瑜伽/i.test(text)) {
    return genericClass("Yoga class", text);
  }

  if (/hiit/i.test(text)) {
    return genericClass("HIIT class", text);
  }

  return null;
}

function genericClass(className: string, text: string): BookingDetails {
  const dateTime = extractGenericDateTime(text);

  return {
    className,
    sessionLabel: dateTime || "Preferred class date and time needed",
    location: "Tempo Fitness, Singapore 53 Havelock Road",
    route: "Indoor studio class",
    needsDateTime: !dateTime,
  };
}

function extractGenericDateTime(text: string) {
  const match = text.match(
    /(monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|next\s+\w+|周一|周二|周三|周四|周五|周六|周日|星期一|星期二|星期三|星期四|星期五|星期六|星期日).{0,30}?(\d{1,2}(:\d{2})?\s*(am|pm)?|\d{1,2}点)/i,
  );

  return match?.[0]?.trim();
}

function hasSignupIntent(text: string) {
  return /(sign\s*up|register|registration|book|booking|join|participate|reserve|报名|预约|参加|加入)/i.test(text);
}

function extractEmail(text: string) {
  return text.match(EMAIL_RE)?.[0];
}

function extractName(text: string) {
  const english = text.match(/(?:my name is|name is|i am|i'm)\s+([A-Za-z][A-Za-z\s'-]{1,40})(?:,|\.|\n|$)/i)?.[1];
  if (english) {
    return english.trim();
  }

  const chinese = text.match(/(?:我叫|名字是|姓名是)\s*([\u4e00-\u9fffA-Za-z\s]{2,20})/)?.[1];
  return chinese?.trim();
}

function extractPace(text: string) {
  const normalized = text.toLowerCase();
  const paceRules: Array<[RegExp, string]> = [
    [/(7[':：]\s*30|7\s*30|7\.5|7\s*min|7\s*分钟半)/i, "7'30\""],
    [/(7[':：]\s*00|7\s*['’′]|7\s*pace|配速\s*7|7\s*分)/i, "7'00\""],
    [/(6[':：]\s*30|6\s*30|6\.5|6\s*分钟半)/i, "6'30\""],
    [/(6[':：]\s*00|6\s*['’′]|6\s*pace|配速\s*6|6\s*分)/i, "6'00\""],
    [/(5[':：]\s*50|5\s*50|5\.?50)/i, "5'50\""],
    [/(5[':：]\s*30|5\s*30|5\.5)/i, "5'30\""],
  ];

  return paceRules.find(([rule]) => rule.test(normalized))?.[1];
}

function formatMissing(items: Array<string | null>) {
  const present = items.filter(Boolean);
  if (present.length <= 1) {
    return present[0] || "details";
  }

  return `${present.slice(0, -1).join(", ")} and ${present[present.length - 1]}`;
}

function createBookingCode() {
  return `TP-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${Math.random()
    .toString(36)
    .slice(2, 8)
    .toUpperCase()}`;
}

function getLatestUserMessage(messages: ChatMessage[]) {
  return [...messages].reverse().find((message) => message.role === "user");
}

function buildBookingReply(content: string): ChatResult {
  return {
    message: {
      role: "assistant",
      content,
    },
    sources: ["booking-policy.md", "classes.md", "faq.md"],
    selectedSkill: "booking_shortcut",
    handoffRecommended: false,
  };
}
