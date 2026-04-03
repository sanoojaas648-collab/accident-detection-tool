const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 60;
const ADDRESS_MAX_LENGTH = 250;
const PASSWORD_MIN_LENGTH = 6;
const PHONE_ALLOWED_CHARS = /^[\d\s()+-]+$/;

const normalizeName = (value = "") => String(value ?? "").trim().replace(/\s+/g, " ");
const normalizeEmail = (value = "") => String(value ?? "").trim().toLowerCase();
const normalizePhone = (value = "") => String(value ?? "").trim();
const normalizeAddress = (value = "") => String(value ?? "").trim();

const isValidPhone = (value = "") => {
  const phone = normalizePhone(value);
  if (!phone || !PHONE_ALLOWED_CHARS.test(phone)) return false;

  const digits = phone.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
};

const formatValidationError = (errors) => ({
  success: false,
  message: errors.array({ onlyFirstError: true })[0]?.msg || "Validation failed",
  errors: errors.array(),
});

module.exports = {
  ADDRESS_MAX_LENGTH,
  NAME_MAX_LENGTH,
  NAME_MIN_LENGTH,
  PASSWORD_MIN_LENGTH,
  formatValidationError,
  normalizeAddress,
  isValidPhone,
  normalizeEmail,
  normalizeName,
  normalizePhone,
};
