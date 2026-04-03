export const ROLE_ROUTES = {
  citizen: "/citizen",
  ambulance: "/ambulance",
  admin: "/admin",
};

export const getRouteForRole = (role) => ROLE_ROUTES[role] || "";

export const getHomeRouteForUser = (user) => getRouteForRole(user?.role);
