const mongoose = require("mongoose");
require("dotenv").config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const db = mongoose.connection.db;

  // Drop index
  await db.collection("users").dropIndex("userId_1");
  console.log("Index dropped");

  // Create sparse index
  await db
    .collection("users")
    .createIndex({ userId: 1 }, { unique: true, sparse: true });
  console.log("Sparse index created");

  mongoose.disconnect();
});
