import mongoose, { Schema, type Model } from "mongoose";

/* =========================
   Types
========================= */

export type OrderStatus =
    | "created"
    | "waiting"
    | "driver_assigned"
    | "on_the_car"
    | "completed"
    | "cancelled";

export type CancelledBy = "client" | "driver" | "admin";

export type LatLng = {
    latitude: number;
    longitude: number;
};

export interface IOrderCarType {
    carTypeId?: mongoose.Types.ObjectId;
    label?: string;
    price?: number;
}

export interface IOrderService {
    serviceId?: mongoose.Types.ObjectId;
    value?: string;
    price?: number;
    createdAt?: Date;
    updatedAt?: Date;
}

export interface IAvailableDriver {
    driverId?: mongoose.Types.ObjectId;
    modelName?: string;
    carNumber?: string;
    color?: string;
    phone?: string;
    distance?: number; // km
    eta?: number; // min
    timestamp?: Date;
    expireAt?: number; // ms timestamp
}

export interface IOrderDriver {
    driverId?: mongoose.Types.ObjectId;
    modelName?: string;
    carNumber?: string;
    color?: string;
    phone?: string;
    distance?: number;
    eta?: number;
}

export interface IOrderTimelineItem {
    stage: OrderStatus;
    driverId?: mongoose.Types.ObjectId;
    timestamp?: Date;
}

export interface IOrderMeter {
    started: boolean;
    startTime?: Date;
    startLocation?: LatLng;
    lastLocation?: LatLng;
    totalDistance: number; // km
    totalMinutes: number; // min
}

export interface IOrder {
    clientId: mongoose.Types.ObjectId; // ref User
    phoneId: string;
    from: string;
    to: string;
    price: number;
    cashback: number;

    location: LatLng;

    carType?: IOrderCarType;
    service?: IOrderService;

    availableDrivers: IAvailableDriver[];
    driver?: IOrderDriver;

    traveledDistance: number;
    amountPaid: number;
    cashbackPaid: number;

    status: OrderStatus;

    cancelledBy?: CancelledBy | null;
    cancelReason?: string | null;

    timeline: IOrderTimelineItem[];

    meter?: IOrderMeter;

    when?: string;
}

/* =========================
   Schema
========================= */

const orderSchema = new Schema < IOrder > (
    {
        clientId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        phoneId: { type: String, required: true },
        from: { type: String, required: true },
        to: { type: String, required: true },
        price: { type: Number, required: true },
        cashback: { type: Number, default: 0 },

        location: {
            latitude: { type: Number, required: true },
            longitude: { type: Number, required: true }
        },

        carType: {
            carTypeId: { type: Schema.Types.ObjectId, ref: "CarType" },
            label: { type: String },
            price: { type: Number }
        },

        service: {
            serviceId: { type: Schema.Types.ObjectId, ref: "Service" },
            value: { type: String },
            price: { type: Number },
            createdAt: { type: Date },
            updatedAt: { type: Date }
        },

        availableDrivers: [
            {
                driverId: { type: Schema.Types.ObjectId, ref: "Driver" },
                modelName: { type: String },
                carNumber: { type: String },
                color: { type: String },
                phone: { type: String },
                distance: { type: Number },
                eta: { type: Number },
                timestamp: { type: Date, default: Date.now },
                expireAt: { type: Number } // ms
            }
        ],

        driver: {
            driverId: { type: Schema.Types.ObjectId, ref: "Driver" },
            modelName: { type: String },
            carNumber: { type: String },
            color: { type: String },
            phone: { type: String },
            distance: { type: Number },
            eta: { type: Number }
        },

        traveledDistance: { type: Number, default: 0 },
        amountPaid: { type: Number, default: 0 },
        cashbackPaid: { type: Number, default: 0 },

        status: {
            type: String,
            enum: ["created", "waiting", "driver_assigned", "on_the_car", "completed", "cancelled"],
            default: "created"
        },

        cancelledBy: { type: String, enum: ["client", "driver", "admin"], default: null },
        cancelReason: { type: String, default: null },

        timeline: [
            {
                stage: {
                    type: String,
                    enum: ["created", "waiting", "driver_assigned", "on_the_car", "completed", "cancelled"]
                },
                driverId: { type: Schema.Types.ObjectId, ref: "Driver" },
                timestamp: { type: Date, default: Date.now }
            }
        ],

        meter: {
            started: { type: Boolean, default: false },
            startTime: { type: Date },

            startLocation: { latitude: Number, longitude: Number },
            lastLocation: { latitude: Number, longitude: Number },

            totalDistance: { type: Number, default: 0 },
            totalMinutes: { type: Number, default: 0 }
        },

        when: { type: String }
    },
    { timestamps: true }
);

/* =========================
   Model (hot-reload safe)
========================= */

const Order: Model<IOrder> =
    (mongoose.models.Order as Model<IOrder>) || mongoose.model < IOrder > ("Order", orderSchema);

export default Order;
