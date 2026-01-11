import type { Request, Response, NextFunction } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

import response from "../utils/response";

// Siz req.admin ga yozayotganingiz uchun type kerak bo‘ladi.
// Bu file yonida (yoki src/types/express.d.ts) alohida ham qilsa bo‘ladi.
// Men quyida 2-usulni ko‘rsataman.

const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const path = req.originalUrl;

    const openRoutes = ["/api/v1/client/login"];
    if (openRoutes.includes(path)) return next();

    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : undefined;

    if (!token) return response.error(res, "Token topilmadi");

    const secret = process.env.JWT_SECRET;
    if (!secret) return response.serverError(res, "JWT_SECRET env topilmadi");

    const result = jwt.verify(token, secret);

    // jwt.verify ba’zan string qaytaradi
    if (!result || typeof result === "string") {
      return response.unauthorized(res, "Token yaroqsiz");
    }

    // result: JwtPayload
    req.admin = result as JwtPayload;

    return next();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return response.serverError(res, msg);
  }
};

export = authMiddleware;

