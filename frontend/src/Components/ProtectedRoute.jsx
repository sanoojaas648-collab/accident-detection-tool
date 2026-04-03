import React from "react";
import { Navigate } from "react-router-dom";
import { clearAuth, getStoredUser, isAuthenticated } from "../utils/auth";
import { getHomeRouteForUser } from "../utils/roleRoutes";

const ProtectedRoute = ({ children, roles }) => {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  const user = getStoredUser();
  const homeRoute = getHomeRouteForUser(user);

  if (!homeRoute) {
    clearAuth();
    return <Navigate to="/login" replace />;
  }

  if (roles && roles.length && !roles.includes(user?.role)) {
    return <Navigate to={homeRoute} replace />;
  }

  return children;
};

export default ProtectedRoute;
