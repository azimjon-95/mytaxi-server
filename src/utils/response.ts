import type { Response } from "express";

export type ApiEnvelope<T = unknown> = {
  state: boolean;
  message: string;
  innerData: T | null;
};

class ResponseHelper {
  success<T = unknown>(res: Response, message = "success", data: T | null = null) {
    return res.status(200).json({
      state: true,
      message,
      innerData: data
    } satisfies ApiEnvelope<T>);
  }

  created<T = unknown>(res: Response, message = "created", data: T | null = null) {
    return res.status(201).json({
      state: true,
      message,
      innerData: data
    } satisfies ApiEnvelope<T>);
  }

  error<T = unknown>(res: Response, message = "error", data: T | null = null) {
    return res.status(400).json({
      state: false,
      message,
      innerData: data
    } satisfies ApiEnvelope<T>);
  }

  warning<T = unknown>(res: Response, message = "warning", data: T | null = null) {
    return res.status(400).json({
      state: false,
      message,
      innerData: data
    } satisfies ApiEnvelope<T>);
  }

  serverError<T = unknown>(res: Response, message = "Server Error", data: T | null = null) {
    return res.status(500).json({
      state: false,
      message,
      innerData: data
    } satisfies ApiEnvelope<T>);
  }

  notFound<T = unknown>(res: Response, message = "Not Found", data: T | null = null) {
    return res.status(404).json({
      state: false,
      message,
      innerData: data
    } satisfies ApiEnvelope<T>);
  }

  unauthorized<T = unknown>(res: Response, message = "Unauthorized", data: T | null = null) {
    return res.status(401).json({
      state: false,
      message,
      innerData: data
    } satisfies ApiEnvelope<T>);
  }

  forbidden<T = unknown>(res: Response, message = "Forbidden", data: T | null = null) {
    return res.status(403).json({
      state: false,
      message,
      innerData: data
    } satisfies ApiEnvelope<T>);
  }

  // Siz controller’larda ishlatgansiz: badRequest(...)
  // JS faylda yo‘q edi — lekin foydalanilgan bo‘lsa, shu yerda qo‘shib qo‘yamiz.
  badRequest<T = unknown>(res: Response, message = "Bad Request", data: T | null = null) {
    return res.status(400).json({
      state: false,
      message,
      innerData: data
    } satisfies ApiEnvelope<T>);
  }
}

const response = new ResponseHelper();
export default response;
