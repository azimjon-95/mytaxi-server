const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    phoneId: { type: String, required: true },
    from: { type: String, required: true },
    to: { type: String, required: true },
    price: { type: Number, required: true },
    cashback: { type: Number, default: 0 },

    location: {
        latitude: { type: Number, required: true },
        longitude: { type: Number, required: true },
    },

    availableDrivers: [
        {
            driverId: { type: mongoose.Schema.Types.ObjectId, ref: "Driver" },
            name: { type: String },
            phone: { type: String },
            vehicle: { type: String },
            distance: { type: Number },  // mashinadan mijozgacha km
            eta: { type: Number },       // taxminiy yetib borish vaqti (min)
            timestamp: { type: Date, default: Date.now },
        }
    ],

    driver: {
        driverId: { type: mongoose.Schema.Types.ObjectId, ref: "Driver" },
        name: { type: String },
        phone: { type: String },
        vehicle: { type: String },
        distance: { type: Number }, // mijozga masofa
        eta: { type: Number },      // taxminiy yetib borish vaqti
    },

    traveledDistance: { type: Number, default: 0 }, // km hisoblangan masofa
    amountPaid: { type: Number, default: 0 },      // mijoz to‘ladi
    cashbackPaid: { type: Number, default: 0 },    // 5% qaytarilgan

    status: {
        type: String,
        enum: ["created", "waiting", "driver_assigned", "on_the_car", "completed", "cancelled"],
        default: "created",
    },

    cancelledBy: { type: String, enum: ["client", "driver", "admin"], default: null },
    cancelReason: { type: String, default: null },

    timeline: [
        {
            stage: {
                type: String,
                enum: ["created", "waiting", "driver_assigned", "on_the_car", "completed", "cancelled"],
            },
            driverId: { type: mongoose.Schema.Types.ObjectId, ref: "Driver" },
            timestamp: { type: Date, default: Date.now },
        },
    ],

    meter: {
        started: { type: Boolean, default: false },
        startTime: { type: Date },

        startLocation: { latitude: Number, longitude: Number },

        lastLocation: { latitude: Number, longitude: Number },

        totalDistance: { type: Number, default: 0 }, // km bo‘yicha
        totalMinutes: { type: Number, default: 0 }   // umumiy vaqt bo‘yicha

    },

    when: { type: String }, // Hozir, 15 min, ...
}, { timestamps: true });

module.exports = mongoose.model("Order", orderSchema);



