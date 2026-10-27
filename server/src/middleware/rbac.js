export const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (
      !req.userRole ||
      allowedRoles.length === 0 ||
      !allowedRoles.includes(req.userRole)
    ) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to access this resource",
      });
    }

    next();
  };
};