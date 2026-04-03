import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { registerUser } from "../service/apiservice";
import { clearAuth } from "../utils/auth";
import {
  NAME_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  normalizeEmailInput,
  normalizeNameInput,
  normalizePhoneInput,
  validateRegistrationForm,
} from "../utils/validation";

const Registration = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    role: "citizen",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onChange = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const validationError = validateRegistrationForm(form);

    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    try {
      await registerUser({
        name: normalizeNameInput(form.name),
        email: normalizeEmailInput(form.email),
        phone: normalizePhoneInput(form.phone),
        password: form.password,
        role: form.role,
      });
      clearAuth();
      navigate("/login", { replace: true });
    } catch (err) {
      setError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <form onSubmit={onSubmit} style={styles.card}>
        <h2>Create Account</h2>
        <input
          style={styles.input}
          placeholder="Full name"
          value={form.name}
          onChange={(e) => onChange("name", e.target.value)}
          minLength={2}
          maxLength={NAME_MAX_LENGTH}
          required
        />
        <input
          style={styles.input}
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={(e) => onChange("email", e.target.value)}
          required
        />
        <input
          style={styles.input}
          type="tel"
          placeholder="Phone" 
          value={form.phone}
          onChange={(e) => onChange("phone", e.target.value)}
          required
        />
        <select style={styles.input} value={form.role} onChange={(e) => onChange("role", e.target.value)}>
          <option value="citizen">Citizen</option>
          <option value="ambulance">Ambulance Provider</option>
        </select>
        <input
          style={styles.input}
          type="password"
          placeholder="Password"
          value={form.password}
          onChange={(e) => onChange("password", e.target.value)}
          minLength={PASSWORD_MIN_LENGTH}
          required
        />
        <input
          style={styles.input}
          type="password"
          placeholder="Confirm password"
          value={form.confirmPassword}
          onChange={(e) => onChange("confirmPassword", e.target.value)}
          minLength={PASSWORD_MIN_LENGTH}
          required
        />
        {error && <p style={styles.error}>{error}</p>}
        <button style={styles.button} type="submit" disabled={loading}>
          {loading ? "Creating..." : "Create account"}
        </button>
        <button style={styles.link} type="button" onClick={() => navigate("/login")}>
          Back to login
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
    background: "linear-gradient(120deg,#1f1c2c,#928dab)",
  },
  card: { width: 400, background: "#fff", padding: 24, borderRadius: 12, display: "grid", gap: 10 },
  input: { padding: 10, borderRadius: 8, border: "1px solid #ccc" },
  button: { padding: 11, border: "none", borderRadius: 8, background: "#22577a", color: "#fff", fontWeight: 600 },
  link: { border: "none", background: "transparent", textDecoration: "underline", cursor: "pointer" },
  error: { color: "#b00020", margin: 0 },
};

export default Registration;
