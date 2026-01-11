import mongoose, { Schema, type Model, type HydratedDocument } from "mongoose";

export interface IUser {
    phone: string;
    name: string;
    surname: string;
    age: number;
    address: string;
    pin?: string;
    cashback: number;
}

export type UserDocument = HydratedDocument<IUser>;

const userSchema = new Schema<IUser>(
    {
        phone: { type: String, required: true, unique: true },
        name: { type: String, required: true },
        surname: { type: String, required: true },
        age: { type: Number, required: true },
        address: { type: String, required: true },
        pin: { type: String, required: false },
        cashback: { type: Number, default: 0 }
    },
    { timestamps: true }
);

// watch/hot-reload’da qayta compile bo‘lib ketmasligi uchun:
const User: Model<IUser> =
    (mongoose.models.User as Model<IUser>) || mongoose.model<IUser>("User", userSchema);

export default User;
