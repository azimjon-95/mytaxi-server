const mongoose = require("mongoose");

// 🚗
const driverSchema = new mongoose.Schema(
    {
        // 👤 DRIVER INFO
        firstName: { type: String, required: true },
        lastName: { type: String, required: true },
        birthDate: { type: Date, required: true },

        phoneNumber: { type: String, required: true, unique: true },
        address: { type: String, required: true },

        // 🚗 CAR INFO
        car: {
            make: { type: String, required: true },
            model: { type: String, required: true },
            year: { type: Number, required: true },
            color: { type: String, required: true },
            plateNumber: { type: String, required: true, unique: true },

            // 🔥 IERARXIALI CAR TYPE
            carType: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "CarType",
                required: true,
            },
        },

        // 🔥 qaysi servislarni qila oladi
        additionalServices: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "AdditionalService",
            },
        ],

        // 💰
        balance: { type: Number, default: 0 },

        // 🟢 ishlayaptimi
        isActive: { type: Boolean, default: true },

        // 🔐 LOGIN
        login: { type: String, required: true, unique: true },
        password: { type: String, required: true },
    },
    { timestamps: true }
);

// Additional Services
const additionalServiceSchema = new mongoose.Schema(
    {
        value: {
            type: String,
            required: true,
            unique: true,
            enum: ["Dastavka", "Perimichka", "Shatak", "Bagaj", "Benzin"],
        },
        price: {
            type: Number,
            required: true,
        },
    },
    { timestamps: true }
);

// 🔥 IERARXIALI CAR TYPE
const carTypeSchema = new mongoose.Schema(
    {
        label: {
            type: String,
            required: true, // Econom, Comfort
        },

        value: {
            type: String,
            required: true,
            unique: true,
            enum: ["econom", "comfort", "damas", "labo"],
        },

        // 🔝 ierarxiya
        level: {
            type: Number,
            required: true, // econom=1, comfort=2
        },

        // 💰 HOZIRCHA BITTA NARX (1 km yoki basic)
        price: {
            type: Number,
            required: true,
        },
        // 🖼 IMAGE (imgBB URL)
        image: {
            type: String,
            required: true,
        },

        isActive: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
);


module.exports = {
    Driver: mongoose.model("Driver", driverSchema),
    AdditionalService: mongoose.model("AdditionalService", additionalServiceSchema),
    CarType: mongoose.model("CarType", carTypeSchema),
};
