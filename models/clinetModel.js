const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        phone: { type: String, required: true, unique: true },
        name: { type: String, required: true },
        surname: { type: String, required: true },
        age: { type: Number, required: true },
        address: { type: String, required: true },
        pin: { type: String },
        cashback: { type: Number, default: 0 },
    },
    { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
