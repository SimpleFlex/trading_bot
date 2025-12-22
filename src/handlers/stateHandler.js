const axios = require("axios");
const { Markup } = require("telegraf");

const BOOST_WALLET = process.env.BOOST_WALLET;

// In-memory users passed from bot.js
let users = {};

/* =========================
   FETCH TOKEN INFO
========================= */
async function getTokenInfo(ca) {
  try {
    const res = await axios.get(
      `https://api.dexscreener.com/latest/dex/tokens/${ca}`
    );
    const p = res.data?.pairs?.[0];
    if (!p) return null;

    return {
      name: p.baseToken?.name,
      symbol: p.baseToken?.symbol,
      priceUsd: p.priceUsd,
      liquidityUsd: p.liquidity?.usd,
      volume24h: p.volume?.h24,
      image: p.info?.imageUrl || null,
      ca,
    };
  } catch {
    return null;
  }
}

/* =========================
   SAFE SEND MESSAGE/PHOTO
========================= */
async function safeSend(ctx, img, text) {
  try {
    if (img) {
      await ctx.replyWithPhoto(img, { caption: text, parse_mode: "Markdown" });
    } else {
      await ctx.reply(text, { parse_mode: "Markdown" });
    }
  } catch {
    await ctx.reply(text, { parse_mode: "Markdown" });
  }
}

/* =========================
   TEXT HANDLER
========================= */
async function handleText(ctx, usersMap) {
  users = usersMap; // use the shared in-memory users
  const telegramId = ctx.from.id;
  const user = users[telegramId];
  if (!user) return;

  if (user.step === "AWAITING_CA") {
    const token = await getTokenInfo(ctx.message.text.trim());
    if (!token) return ctx.reply("❌ Token not found on DexScreener.");

    user.tokenCA = token.ca;
    user.tokenName = token.name;
    user.tokenSymbol = token.symbol;
    user.tokenImage = token.image;
    user.step = "AWAITING_BIND";

    await safeSend(
      ctx,
      token.image,
      `✅ *Token Detected*

*Name:* ${token.name}
*Symbol:* ${token.symbol}
*Liquidity:* $${token.liquidityUsd}
*24h Volume:* $${token.volume24h}

*CA:* \`${token.ca}\`

Use /bind in your group or /skip to continue`
    );
  } else if (user.step === "AWAITING_PAYMENT_PROOF") {
    user.paymentProof =
      ctx.message.text || ctx.message.photo?.slice(-1)[0]?.file_id;
    user.step = "PAYMENT_SUBMITTED";

    await ctx.reply(
      "✅ Payment proof received.\nYour boost will be activated after confirmation 🔥"
    );
  } else if (user.step === "AWAITING_BIND" && ctx.chat.type === "private") {
    const groupId = ctx.message.text.trim();
    if (/^-?\d+$/.test(groupId)) {
      user.groupId = parseInt(groupId);
      user.step = "AWAITING_BOOST";
      await ctx.reply("✅ Group ID saved.\n\nSelect boost duration:", {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "⚡ 4H — 1.9 SOL", callback_data: "BOOST_4H" },
              { text: "⚡ 8H — 3.4 SOL", callback_data: "BOOST_8H" },
            ],
            [
              { text: "🔥 12H — 4.9 SOL", callback_data: "BOOST_12H" },
              { text: "🚀 24H — 6.5 SOL", callback_data: "BOOST_24H" },
            ],
          ],
        },
      });
    }
  }
}

/* =========================
   CALLBACK HANDLER
========================= */
async function handleCallback(ctx, usersMap) {
  users = usersMap;
  const telegramId = ctx.from.id;
  const user = users[telegramId];
  if (!user) return await ctx.answerCbQuery();

  const BOOSTS = {
    BOOST_4H: { h: 4, sol: 1.9 },
    BOOST_8H: { h: 8, sol: 3.4 },
    BOOST_12H: { h: 12, sol: 4.9 },
    BOOST_24H: { h: 24, sol: 6.5 },
  };

  const data = ctx.callbackQuery.data;

  if (BOOSTS[data] && user.step === "AWAITING_BOOST") {
    const b = BOOSTS[data];
    user.selectedBoost = `${b.h} Hours`;
    user.selectedPrice = b.sol;
    user.step = "AWAITING_PAYMENT";

    await ctx.reply(
      `⚡️ *Trending Boost*

Duration: *${b.h} Hours*
Amount: *${b.sol} SOL*

Send to:
\`${BOOST_WALLET}\`

Then click below`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("✅ I HAVE PAID", "PAID")],
        ]),
      }
    );
  } else if (data === "PAID" && user.step === "AWAITING_PAYMENT") {
    user.step = "AWAITING_PAYMENT_PROOF";
    await ctx.reply("Send TX hash or screenshot of the payment");
  }

  await ctx.answerCbQuery();
}

module.exports = {
  handleText,
  handleCallback,
};
