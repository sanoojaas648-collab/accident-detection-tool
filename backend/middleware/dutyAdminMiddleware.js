exports.dutyAdminRequired = (req, res, next) => {
  if (!req.user || req.user.role !== "admin" || !req.user.isDutyAdmin) {
    return res.status(403).json({ success: false, message: "Duty-admin access required" });
  }

  return next();
};
