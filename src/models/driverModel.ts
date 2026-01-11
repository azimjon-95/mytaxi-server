import mongoose, { Schema, type Model } from "mongoose";

/* =========================
   Types
========================= */

export type CarTypeValue = "econom" | "comfort" | "damas" | "labo";
export type AdditionalServiceValue = "Dastavka" | "Perimichka" | "Shatak" | "Bagaj" | "Benzin";

export interface ICarType {
    label: string;
    value: CarTypeValue;
    level: number;
    price: number;
    image: string;
    isActive: boolean;
}

export interface IAdditionalService {
    value: AdditionalServiceValue;
    price: number;
}

export interface IDriverCar {
    make: string;
    model: string;
    year: number;
    color: string;
    plateNumber: string;
    carType: mongoose.Types.ObjectId; // ref CarType
}

export interface IDriver {
    firstName: string;
    lastName: string;
    birthDate: Date;

    phoneNumber: string;
    address: string;

    car: IDriverCar;

    additionalServices: mongoose.Types.ObjectId[]; // ref AdditionalService

    balance: number;
    isActive: boolean;

    login: string;
    password: string;
}

/* =========================
   Schemas
========================= */

// 🚗 Driver
const driverSchema = new Schema<IDriver>(
    {
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

            carType: {
                type: Schema.Types.ObjectId,
                ref: "CarType",
                required: true
            }
        },

        additionalServices: [
            {
                type: Schema.Types.ObjectId,
                ref: "AdditionalService"
            }
        ],

        balance: { type: Number, default: 0 },
        isActive: { type: Boolean, default: true },

        login: { type: String, required: true, unique: true },
        password: { type: String, required: true }
    },
    { timestamps: true }
);

// 🔥 Additional Services
const additionalServiceSchema = new Schema<IAdditionalService>(
    {
        value: {
            type: String,
            required: true,
            unique: true,
            enum: ["Dastavka", "Perimichka", "Shatak", "Bagaj", "Benzin"]
        },
        price: { type: Number, required: true }
    },
    { timestamps: true }
);

// 🔥 Car Type
const carTypeSchema = new Schema<ICarType>(
    {
        label: { type: String, required: true },

        value: {
            type: String,
            required: true,
            unique: true,
            enum: ["econom", "comfort", "damas", "labo"]
        },

        level: { type: Number, required: true },
        price: { type: Number, required: true },
        image: { type: String, required: true },

        isActive: { type: Boolean, default: true }
    },
    { timestamps: true }
);

/* =========================
   Models (hot-reload safe)
========================= */

export const Driver: Model<IDriver> =
    (mongoose.models.Driver as Model<IDriver>) || mongoose.model<IDriver>("Driver", driverSchema);

export const AdditionalService: Model<IAdditionalService> =
    (mongoose.models.AdditionalService as Model<IAdditionalService>) ||
    mongoose.model<IAdditionalService>("AdditionalService", additionalServiceSchema);

export const CarType: Model<ICarType> =
    (mongoose.models.CarType as Model<ICarType>) || mongoose.model<ICarType>("CarType", carTypeSchema);
