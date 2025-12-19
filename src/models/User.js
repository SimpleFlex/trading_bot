const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  telegramId: { type: Number, required: true, unique: true },
  userId: { type: String, unique: true },
  step: { type: String, default: "AWAITING_CA" },
  tokenCA: String,
  tokenName: String,
  tokenSymbol: String,
  tokenImage: String,
  selectedBoost: String,
  selectedPrice: Number,
  paymentProof: String,
  groupId: Number,
});

module.exports = mongoose.model("User", userSchema);
