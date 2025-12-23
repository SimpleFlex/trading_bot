require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const axios = require("axios");
const http = require("http"); // ✅ ADDED (Replit fix)

const bot = new Telegraf(process.env.BOT_TOKEN);
const BOOST_WALLET = process.env.BOOST_WALLET;

// In-memory storage for users
const users = {};

/* =========================
   REPLIT KEEP-ALIVE (ADDED)
========================= */
http
  .createServer((req, res) => {
    res.writeHead(200);
    res.end("Bot is running");
  })
  .listen(process.env.PORT || 3000);

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
   SEND PHOTO OR TEXT SAFELY
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
   /START
========================= */
bot.start(async (ctx) => {
  if (ctx.chat.type !== "private") return;

  const telegramId = ctx.from?.id;
  if (!telegramId)
    return ctx.reply("Error: Could not detect your Telegram ID.");

  users[telegramId] = {
    telegramId,
    step: "AWAITING_CA",
    tokenCA: null,
    tokenName: null,
    tokenSymbol: null,
    tokenImage: null,
    selectedBoost: null,
    selectedPrice: null,
    paymentProof: null,
    groupId: null,
  };

  await ctx.reply(
    `⚡️ SOL Trending Fast-Track | TOS

@Trending & @SOLTrending — The largest trending platform in crypto.

🚀 Drop your token CA below to get started`
  );
});

/* =========================
   /BIND (GROUP ONLY)
========================= */
bot.command("bind", async (ctx) => {
  if (ctx.chat.type === "private")
    return ctx.reply("❌ Use /bind inside your group.");

  const telegramId = ctx.from.id;
  const user = users[telegramId];
  if (!user || user.step !== "AWAITING_BIND")
    return ctx.reply("❌ Start first in DM using /start.");

  user.groupId = ctx.chat.id;
  user.step = "AWAITING_BOOST";

  ctx.reply("✅ Bot successfully bound to this group!");

  bot.telegram.sendMessage(
    telegramId,
    "✅ Group binding confirmed.\n\nSelect boost duration:",
    {
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
    }
  );
});

/* =========================
   /SKIP (PRIVATE ONLY)
========================= */
bot.command("skip", async (ctx) => {
  if (ctx.chat.type !== "private") return;

  const telegramId = ctx.from.id;
  const user = users[telegramId];
  if (!user || user.step !== "AWAITING_BIND")
    return ctx.reply("❌ Start first using /start.");

  user.groupId = null;
  user.step = "AWAITING_BOOST";

  ctx.reply("⏭️ Group binding skipped.\n\nSelect boost duration:", {
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
});

/* =========================
   TEXT HANDLER (FIXED)
========================= */
bot.on("text", async (ctx) => {
  const telegramId = ctx.from.id;
  const user = users[telegramId];
  if (!user) return;

  const text = ctx.message.text.trim();

  // ✅ ALWAYS allow CA detection (multiple times)
  const token = await getTokenInfo(text);
  if (token) {
    user.tokenCA = token.ca;
    user.tokenName = token.name;
    user.tokenSymbol = token.symbol;
    user.tokenImage = token.image;
    user.step = "AWAITING_BIND";

    return safeSend(
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
  }

  if (user.step === "AWAITING_PAYMENT_PROOF") {
    user.paymentProof =
      ctx.message.text || ctx.message.photo?.slice(-1)[0]?.file_id;
    user.step = "PAYMENT_SUBMITTED";

    await ctx.reply(
      "✅ Payment proof received.\nYour boost will be activated after confirmation 🔥"
    );
  }
});

/* =========================
   CALLBACK HANDLER
========================= */
bot.on("callback_query", async (ctx) => {
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
});

/* =========================
   ERROR SAFETY
========================= */
bot.catch((err) => console.error("BOT ERROR:", err));

bot.launch();
console.log("✅ Bot running without MongoDB");
