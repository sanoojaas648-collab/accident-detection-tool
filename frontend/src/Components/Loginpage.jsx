import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { forgotPassword, loginUser } from "../service/apiservice";
import { getRouteForRole } from "../utils/roleRoutes";
import { isValidEmail, normalizeEmailInput, validateLoginForm } from "../utils/validation";

const LoginPage = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    const normalizedEmail = normalizeEmailInput(email);
    const validationError = validateLoginForm({ email: normalizedEmail, password });

    if (validationError) {
      setLoading(false);
      setError(validationError);
      return;
    }

    try {
      const data = await loginUser(normalizedEmail, password);
      navigate(getRouteForRole(data.user.role) || "/login");
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const onForgotPassword = async () => {
    const normalizedEmail = normalizeEmailInput(email);

    if (!normalizedEmail) {
      setError("Enter your email first");
      setMessage("");
      return;
    }

    if (!isValidEmail(normalizedEmail)) {
      setError("Enter a valid email address");
      setMessage("");
      return;
    }

    setResettingPassword(true);
    setError("");
    setMessage("");

    try {
      await forgotPassword(normalizedEmail);
      setMessage("Password was reset. You can now sign in with the reset password.");
      setPassword("");
    } catch (err) {
      setError(err.message || "Unable to reset password");
    } finally {
      setResettingPassword(false);
    }
  };

  return (
    <div style={styles.page}>
      <form onSubmit={onSubmit} style={styles.card}>
        <h2>Accident Response System</h2>
        <p>Login to continue</p>
        <input
          style={styles.input}
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          style={styles.input}
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {message && <p style={styles.message}>{message}</p>}
        {error && <p style={styles.error}>{error}</p>}
        <button style={styles.button} type="submit" disabled={loading}>
          {loading ? "Signing in..." : "Sign In"}
        </button>
        <button
          style={styles.link}
          type="button"
          onClick={onForgotPassword}
          disabled={resettingPassword}
        >
          {resettingPassword ? "Resetting..." : "Forgot Password"}
        </button>
        <button style={styles.link} type="button" onClick={() => navigate("/register")}>
          Create account
        </button>
      </form>
    </div>
  );
};

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    background: "linear-gradient(120deg,#0f2027,#203a43,#2c5364)",
  },
  card: {
    width: 360,
    background: "#fff",
    padding: 24,
    borderRadius: 12,
    display: "grid",
    gap: 12,
  },
  input: { padding: 10, border: "1px solid #ccc", borderRadius: 8 },
  button: {
    padding: 11,
    border: "none",
    borderRadius: 8,
    background: "#0f4c81",
    color: "#fff",
    fontWeight: 600,
    cursor: "pointer",
  },
  link: {
    border: "none",
    background: "transparent",
    color: "#0f4c81",
    cursor: "pointer",
    textDecoration: "underline",
  },
  message: { color: "#1f6f43", margin: 0 },
  error: { color: "#b00020", margin: 0 },
};

export default LoginPage;
