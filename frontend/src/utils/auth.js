export const getToken = () => localStorage.getItem("token") || "";

const normalizeStoredUser = (user) => {
  if (!user) return null;
  if (user.role !== "super_admin") return user;

  return {
    ...user,
    role: "admin",
    isDutyAdmin: user.isDutyAdmin ?? true,
  };
};

export const getStoredUser = () => {
  const raw = localStorage.getItem("user");
  if (!raw) return null;
  try {
    return normalizeStoredUser(JSON.parse(raw));
  } catch {
    return null;
  }
};

export const saveAuth = ({ token, user }) => {
  localStorage.setItem("token", token);
  localStorage.setItem("user", JSON.stringify(normalizeStoredUser(user)));
};

export const saveUser = (user) => {
  localStorage.setItem("user", JSON.stringify(normalizeStoredUser(user)));
};

export const clearAuth = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
};

export const isAuthenticated = () => Boolean(getToken() && getStoredUser());
