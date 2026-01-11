import type { Request, Response, NextFunction } from "express";

const notfound = (req: Request, res: Response, _next: NextFunction) => {
  const path = req.originalUrl;

  return res.status(404).json({
    message: `"${path}" bunday route mavjud emas`,
    status: "info",
    status_code: 404,
    path
  });
};

export = notfound;
