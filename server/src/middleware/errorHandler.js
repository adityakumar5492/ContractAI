export const errorHandler = (err, req, res, next) => {
  console.error(err);

  const uploadLimitStatus = err.code === "LIMIT_FILE_SIZE" ? 413 :
    err.code?.startsWith("LIMIT_") ? 400 : 500;
  const statusCode = err.statusCode || err.status || uploadLimitStatus;

  res.status(statusCode).json({
    success: false,
    message:
      statusCode >= 500
        ? "Something went wrong. Please try again."
        : err.message || "Request failed",
  });
};
