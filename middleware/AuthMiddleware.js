const response = require("../utils/response");
const jwt = require("jsonwebtoken");

const authMiddleware = async (req, res, next) => {
  try {
    let path = req.originalUrl;

    let openRoutes = ["/api/v1/client/login", "/api/v1/client/pin"];
    if (openRoutes.includes(path)) return next();

    const token = req?.headers?.authorization?.split(" ")[1];
    if (!token) return response.error(res, "Token topilmadi");

    let result = jwt.verify(token, process.env.JWT_SECRET_KEY);

    if (!result) return response.unauthorized(res, "Token yaroqsiz");

    req.admin = result;
    next();
  } catch (err) {
    response.serverError(res, err.message);
  }
};

module.exports = authMiddleware;
