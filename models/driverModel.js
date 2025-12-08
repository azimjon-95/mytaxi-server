const mongoose = require("mongoose");

const driverSchema = new mongoose.Schema({
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    birthDate: { type: Date, required: true },
    phoneNumber: { type: String, required: true, unique: true },
    address: { type: String, required: true },
    car: {
        make: { type: String, required: true },
        model: { type: String, required: true },
        year: { type: Number, required: true },
        color: { type: String, required: true },
        plateNumber: { type: String, required: true, unique: true },
    },
    balance: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },

    // Login fields
    login: { type: String, required: true, unique: true },
    password: { type: String, required: true },
}, { timestamps: true });


module.exports = mongoose.model("Driver", driverSchema);
