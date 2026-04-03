const User = require("../models/User");

const ADMIN_ROLES = ["admin", "super_admin"];

const chooseDutyAdmin = (admins) =>
  admins.find((user) => user.role === "super_admin") ||
  admins.find((user) => user.isDutyAdmin) ||
  admins[0] ||
  null;

exports.normalizeDutyAdminUsers = async () => {
  const admins = await User.find({ role: { $in: ADMIN_ROLES } })
    .select("_id role isDutyAdmin createdAt")
    .sort({ createdAt: 1 });

  if (!admins.length) {
    await User.updateMany({ isDutyAdmin: true }, { $set: { isDutyAdmin: false } });
    return null;
  }

  const dutyAdmin = chooseDutyAdmin(admins);
  const dutyAdminId = String(dutyAdmin._id);

  await User.updateMany(
    {
      $or: [
        { role: { $in: ADMIN_ROLES } },
        { isDutyAdmin: true },
      ],
    },
    { $set: { role: "admin", isDutyAdmin: false } }
  );

  await User.findByIdAndUpdate(dutyAdminId, {
    $set: { role: "admin", isDutyAdmin: true },
  });

  return dutyAdminId;
};
