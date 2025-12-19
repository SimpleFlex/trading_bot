const axios = require("axios");
const User = require("../models/User");
const { Markup } = require("telegraf");

const BOOST_WALLET = process.env.BOOST_WALLET;

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
module.exports = async (ctx) => {
  if (!ctx.message?.text) return;

  try {
    const telegramId = ctx.from.id;
    const user = await User.findOne({ telegramId });
    if (!user) {
      console.error(`No user found for telegramId: ${telegramId}`);
      return;
    }

    // ---- CA INPUT ----
    if (user.step === "AWAITING_CA") {
      const token = await getTokenInfo(ctx.message.text.trim());
      if (!token) return ctx.reply("❌ Token not found on DexScreener.");

      user.tokenCA = token.ca;
      user.tokenName = token.name;
      user.tokenSymbol = token.symbol;
      user.tokenImage = token.image;
      user.step = "AWAITING_BIND";
      await user.save();

      await safeSend(
        ctx,
        token.image,
        `✅ *Token Detected*\n\n*Name:* ${token.name}\n*Symbol:* ${token.symbol}\n*Liquidity:* $${token.liquidityUsd}\n*24h Volume:* $${token.volume24h}\n\n*CA:* \`${token.ca}\`\n\nUse /bind in your group or /skip to continue`
      );
    }

    // ---- PAYMENT PROOF ----
    else if (user.step === "AWAITING_PAYMENT_PROOF") {
      user.paymentProof =
        ctx.message.text || ctx.message.photo?.slice(-1)[0]?.file_id;
      user.step = "PAYMENT_SUBMITTED";
      await user.save();
      await ctx.reply(
        "✅ Payment proof received.\nYour boost will be activated after confirmation 🔥"
      );
    }

    // ---- GROUP ID INPUT (PRIVATE) ----
    else if (user.step === "AWAITING_BIND" && ctx.chat.type === "private") {
      const groupId = ctx.message.text.trim();
      if (/^-?\d+$/.test(groupId)) {
        user.groupId = parseInt(groupId);
        user.step = "AWAITING_BOOST";
        await user.save();

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
  } catch (err) {
    console.error("STATE HANDLER ERROR:", err);
  }
};

/* =========================
   CALLBACK HANDLER
========================= */
module.exports.callbackHandler = async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    const user = await User.findOne({ telegramId });
    if (!user) {
      console.error(`No user found in callback for telegramId: ${telegramId}`);
      await ctx.answerCbQuery();
      return;
    }

    const BOOSTS = {
      BOOST_4H: { h: 4, sol: 1.9 },
      BOOST_8H: { h: 8, sol: 3.4 },
      BOOST_12H: { h: 12, sol: 4.9 },
      BOOST_24H: { h: 24, sol: 6.5 },
    };

    if (BOOSTS[ctx.callbackQuery.data] && user.step === "AWAITING_BOOST") {
      const b = BOOSTS[ctx.callbackQuery.data];

      user.selectedBoost = `${b.h} Hours`;
      user.selectedPrice = b.sol;
      user.step = "AWAITING_PAYMENT";
      await user.save();

      await ctx.reply(
        `⚡️ *Trending Boost*\n\nDuration: *${b.h} Hours*\nAmount: *${b.sol} SOL*\n\nSend to:\n\`${BOOST_WALLET}\`\n\nThen click below`,
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("✅ I HAVE PAID", "PAID")],
          ]),
        }
      );
    } else if (
      ctx.callbackQuery.data === "PAID" &&
      user.step === "AWAITING_PAYMENT"
    ) {
      user.step = "AWAITING_PAYMENT_PROOF";
      await user.save();
      await ctx.reply("Send TX hash ");
    }
  } catch (err) {
    console.error("CALLBACK HANDLER ERROR:", err);
  }

  await ctx.answerCbQuery();
};
