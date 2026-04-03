import React from "react";
import { BrowserRouter as Router, Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "./Components/Loginpage";
import Registration from "./Components/Registration";
import ProtectedRoute from "./Components/ProtectedRoute";
import AdminDashboard from "./Pages/Admin/AdminDashboard";
import Counselor from "./Pages/Admin/Counselor";
import UserDash from "./Pages/User/UserDash";
import { clearAuth, getStoredUser, isAuthenticated } from "./utils/auth";
import { getHomeRouteForUser } from "./utils/roleRoutes";

const HomeRedirect = () => {
  const user = getStoredUser();
  const homeRoute = getHomeRouteForUser(user);

  if (!isAuthenticated() || !homeRoute) {
    if (user && !homeRoute) {
      clearAuth();
    }
    return <Navigate to="/login" replace />;
  }

  return <Navigate to={homeRoute} replace />;
};

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<Registration />} />

        <Route
          path="/citizen"
          element={
            <ProtectedRoute roles={["citizen"]}>
              <UserDash />
            </ProtectedRoute>
          }
        />

        <Route
          path="/ambulance"
          element={
            <ProtectedRoute roles={["ambulance"]}>
              <Counselor />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin"
          element={
            <ProtectedRoute roles={["admin"]}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/users"
          element={
            <ProtectedRoute roles={["admin"]}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />

        <Route path="/super-admin" element={<Navigate to="/admin" replace />} />

        <Route path="*" element={<HomeRedirect />} />
      </Routes>
    </Router>
  );
}

export default App;
