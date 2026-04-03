const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { validationResult } = require("express-validator");
const User = require("../models/User");
const {
  formatValidationError,
  normalizeAddress,
  normalizeEmail,
  normalizeName,
  normalizePhone,
} = require("../utils/authValidation");

const DEFAULT_RESET_PASSWORD = "123";

const signToken = (user) =>
  jwt.sign(
    { userId: user._id, role: user.role },
    process.env.JWT_SECRET || "dev-secret",
    { expiresIn: process.env.JWT_EXPIRES_IN || "1d" }
  );

const serializeAuthUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  address: user.address || "",
  bloodGroup: user.bloodGroup || "",
  emergencyContact: user.emergencyContact || { name: "", phone: "" },
  role: user.role,
  isDutyAdmin: Boolean(user.isDutyAdmin),
});

exports.register = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(formatValidationError(errors));
    }

    const { name, email, phone, password, role = "citizen", location, bloodGroup, emergencyContact, address } = req.body;
    const normalizedEmail = normalizeEmail(email);
    const normalizedName = normalizeName(name);
    const normalizedPhone = normalizePhone(phone);

    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ success: false, message: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name: normalizedName,
      email: normalizedEmail,
      phone: normalizedPhone,
      address: normalizeAddress(address),
      bloodGroup: String(bloodGroup || "").trim(),
      emergencyContact: {
        name: normalizeName(emergencyContact?.name || ""),
        phone: normalizePhone(emergencyContact?.phone || ""),
      },
      password: hashedPassword,
      role,
      location,
    });

    const token = signToken(user);

    res.status(201).json({
      success: true,
      token,
      user: serializeAuthUser(user),
    });
  } catch (error) {
    next(error);
  }
};

exports.login = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(formatValidationError(errors));
    }

    const { email, password } = req.body;
    const user = await User.findOne({ email: normalizeEmail(email) });

    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const matched = await bcrypt.compare(password, user.password);
    if (!matched) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const token = signToken(user);

    res.json({
      success: true,
      token,
      user: serializeAuthUser(user),
    });
  } catch (error) {
    next(error);
  }
};

exports.forgotPassword = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(formatValidationError(errors));
    }

    const email = normalizeEmail(req.body.email);
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    user.password = await bcrypt.hash(DEFAULT_RESET_PASSWORD, 10);
    await user.save();

    res.json({
      success: true,
      message: "Password reset successful",
    });
  } catch (error) {
    next(error);
  }
};

exports.me = async (req, res) => {
  res.json({ success: true, user: serializeAuthUser(req.user) });
};

exports.updateMe = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(formatValidationError(errors));
    }

    const updates = {
      name: normalizeName(req.body.name),
      phone: normalizePhone(req.body.phone),
      address: normalizeAddress(req.body.address),
      bloodGroup: String(req.body.bloodGroup || "").trim(),
      emergencyContact: {
        name: normalizeName(req.body.emergencyContact?.name || ""),
        phone: normalizePhone(req.body.emergencyContact?.phone || ""),
      },
    };

    if (req.body.email) {
      const normalizedEmail = normalizeEmail(req.body.email);
      const existing = await User.findOne({
        email: normalizedEmail,
        _id: { $ne: req.user._id },
      }).select("_id");

      if (existing) {
        return res.status(409).json({ success: false, message: "Email already registered" });
      }

      updates.email = normalizedEmail;
    }

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true }).select("-password");

    res.json({ success: true, user: serializeAuthUser(user) });
  } catch (error) {
    next(error);
  }
};
