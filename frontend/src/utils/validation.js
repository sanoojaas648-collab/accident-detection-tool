export const NAME_MIN_LENGTH = 2;
export const NAME_MAX_LENGTH = 60;
export const ADDRESS_MAX_LENGTH = 250;
export const PASSWORD_MIN_LENGTH = 6;

const PHONE_ALLOWED_CHARS = /^[\d\s()+-]+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normalizeNameInput = (value = "") => String(value ?? "").trim().replace(/\s+/g, " ");
export const normalizeEmailInput = (value = "") => String(value ?? "").trim().toLowerCase();
export const normalizePhoneInput = (value = "") => String(value ?? "").trim();
export const normalizeAddressInput = (value = "") => String(value ?? "").trim();

export const isValidEmail = (value = "") => EMAIL_PATTERN.test(normalizeEmailInput(value));

export const isValidPhone = (value = "") => {
  const phone = normalizePhoneInput(value);
  if (!phone || !PHONE_ALLOWED_CHARS.test(phone)) return false;

  const digits = phone.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
};

export const validateLoginForm = ({ email, password }) => {
  if (!normalizeEmailInput(email)) return "Email is required";
  if (!isValidEmail(email)) return "Enter a valid email address";
  if (!password) return "Password is required";
  return "";
};

export const validateRegistrationForm = ({ name, email, phone, password, confirmPassword }) => {
  if (!normalizeNameInput(name)) return "Name is required";
  if (normalizeNameInput(name).length < NAME_MIN_LENGTH) {
    return `Name must be at least ${NAME_MIN_LENGTH} characters`;
  }
  if (!normalizeEmailInput(email)) return "Email is required";
  if (!isValidEmail(email)) return "Enter a valid email address";
  if (!normalizePhoneInput(phone)) return "Phone number is required";
  if (!isValidPhone(phone)) return "Enter a valid phone number";
  if (!password) return "Password is required";
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }
  if (password !== confirmPassword) return "Passwords do not match";
  return "";
};

export const validateProfileForm = ({
  name,
  email,
  phone,
  address,
  emergencyContactPhone,
}) => {
  if (!normalizeNameInput(name)) return "Name is required";
  if (normalizeNameInput(name).length < NAME_MIN_LENGTH) {
    return `Name must be at least ${NAME_MIN_LENGTH} characters`;
  }
  if (!normalizeEmailInput(email)) return "Email is required";
  if (!isValidEmail(email)) return "Enter a valid email address";
  if (!normalizePhoneInput(phone)) return "Phone number is required";
  if (!isValidPhone(phone)) return "Enter a valid phone number";
  if (normalizeAddressInput(address).length > ADDRESS_MAX_LENGTH) {
    return `Address must be ${ADDRESS_MAX_LENGTH} characters or fewer`;
  }
  if (normalizePhoneInput(emergencyContactPhone) && !isValidPhone(emergencyContactPhone)) {
    return "Enter a valid emergency contact number";
  }
  return "";
};
