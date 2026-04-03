const ChatLog = require("../models/ChatLog");
const { postJson } = require("../utils/aiHttpClient");

exports.generateAIReply = async ({ accidentId, userId }) => {
  const aiServiceUrl =
    process.env.AI_CHAT_SERVICE_URL ||
    process.env.AI_NEW_SERVICE_URL ||
    process.env.AI_SERVICE_URL ||
    "http://127.0.0.1:8001";

  const history = (
    await ChatLog.find({ accidentId, userId })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean()
  ).reverse();

  const response = await postJson(`${aiServiceUrl.replace(/\/+$/, "")}/chat-reply`, {
    accidentId: String(accidentId),
    userId: String(userId),
    history: history.map((item) => ({
      senderType: item.senderType,
      message: item.message,
      createdAt: item.createdAt,
    })),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.reply) {
    throw new Error(payload.detail || payload.message || "AI chat service failed");
  }

  return String(payload.reply).trim();
};
