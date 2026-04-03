const express = require("express");
const { body } = require("express-validator");
const { register, login, forgotPassword, me, updateMe } = require("../controllers/authController");
const { authRequired } = require("../middleware/authMiddleware");
const {
  ADDRESS_MAX_LENGTH,
  NAME_MAX_LENGTH,
  NAME_MIN_LENGTH,
  PASSWORD_MIN_LENGTH,
  isValidPhone,
} = require("../utils/authValidation");

const router = express.Router();

router.post(
  "/register",
  [
    body("name")
      .trim()
      .notEmpty()
      .withMessage("Name is required")
      .bail()
      .isLength({ min: NAME_MIN_LENGTH, max: NAME_MAX_LENGTH })
      .withMessage(`Name must be between ${NAME_MIN_LENGTH} and ${NAME_MAX_LENGTH} characters`),
    body("email")
      .trim()
      .notEmpty()
      .withMessage("Email is required")
      .bail()
      .isEmail()
      .withMessage("Enter a valid email address"),
    body("phone")
      .trim()
      .notEmpty()
      .withMessage("Phone number is required")
      .bail()
      .custom(isValidPhone)
      .withMessage("Enter a valid phone number"),
    body("address")
      .optional({ nullable: true })
      .trim()
      .isLength({ max: ADDRESS_MAX_LENGTH })
      .withMessage(`Address must be ${ADDRESS_MAX_LENGTH} characters or fewer`),
    body("password")
      .notEmpty()
      .withMessage("Password is required")
      .bail()
      .isLength({ min: PASSWORD_MIN_LENGTH, max: 128 })
      .withMessage(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`),
    body("role")
      .optional()
      .isIn(["citizen", "ambulance", "admin"])
      .withMessage("Select a valid role"),
  ],
  register
);

router.post(
  "/login",
  [
    body("email")
      .trim()
      .notEmpty()
      .withMessage("Email is required")
      .bail()
      .isEmail()
      .withMessage("Enter a valid email address"),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  login
);
router.post(
  "/forgot-password",
  [
    body("email")
      .trim()
      .notEmpty()
      .withMessage("Email is required")
      .bail()
      .isEmail()
      .withMessage("Enter a valid email address"),
  ],
  forgotPassword
);
router.get("/me", authRequired, me);
router.patch(
  "/me",
  authRequired,
  [
    body("name")
      .trim()
      .notEmpty()
      .withMessage("Name is required")
      .bail()
      .isLength({ min: NAME_MIN_LENGTH, max: NAME_MAX_LENGTH })
      .withMessage(`Name must be between ${NAME_MIN_LENGTH} and ${NAME_MAX_LENGTH} characters`),
    body("email")
      .trim()
      .notEmpty()
      .withMessage("Email is required")
      .bail()
      .isEmail()
      .withMessage("Enter a valid email address"),
    body("phone")
      .trim()
      .notEmpty()
      .withMessage("Phone number is required")
      .bail()
      .custom(isValidPhone)
      .withMessage("Enter a valid phone number"),
    body("address")
      .optional({ nullable: true })
      .trim()
      .isLength({ max: ADDRESS_MAX_LENGTH })
      .withMessage(`Address must be ${ADDRESS_MAX_LENGTH} characters or fewer`),
    body("bloodGroup").optional().trim(),
    body("emergencyContact.name")
      .optional({ nullable: true })
      .trim()
      .isLength({ max: NAME_MAX_LENGTH })
      .withMessage(`Emergency contact name must be ${NAME_MAX_LENGTH} characters or fewer`),
    body("emergencyContact.phone")
      .optional({ nullable: true })
      .customSanitizer((value) => String(value ?? "").trim())
      .custom((value) => !value || isValidPhone(value))
      .withMessage("Enter a valid emergency contact number"),
  ],
  updateMe
);

module.exports = router;
