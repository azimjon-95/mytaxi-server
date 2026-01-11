import "express";
import type { JwtPayload } from "jsonwebtoken";

declare module "express-serve-static-core" {
    interface Request {
        admin?: JwtPayload;
    }
}
