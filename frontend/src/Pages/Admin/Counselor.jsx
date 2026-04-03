import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  acceptDispatch,
  completeDispatch,
  getMyAmbulance,
  getMyDispatches,
  registerAmbulance,
  rejectDispatch,
  updateAmbulanceLocation,
  updateAmbulanceStatus,
} from "../../service/apiservice";
import { connectSocket, disconnectSocket } from "../../service/socketService";
import { clearAuth, getStoredUser } from "../../utils/auth";
import "./AdminDashboard.css";
import "./Counselor.css";

const AMBULANCE_SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "unit", label: "Unit Profile" },
  { id: "dispatches", label: "Dispatches" },
];

const LOCATION_OPTIONS = {
  enableHighAccuracy: true,
  maximumAge: 10000,
  timeout: 15000,
};

const LOCATION_RETRY_OPTIONS = {
  enableHighAccuracy: false,
  maximumAge: 60000,
  timeout: 20000,
};

const LOCATION_SYNC_INTERVAL_MS = 15000;
const LOCATION_CHANGE_THRESHOLD = 0.0001;
const formatCoordinate = (value) => Number(value).toFixed(6);
const formatLocationText = (lat, lng) =>
  lat && lng ? `Latitude: ${lat} | Longitude: ${lng}` : "Current location not available yet.";
const formatEmergencyContactText = (dispatch) => {
  const emergencyContact = dispatch?.accidentId?.metadata?.emergencyContact || {};
  const contactName = String(emergencyContact.name || "").trim();
  const contactPhone = String(emergencyContact.phone || "").trim();

  if (contactName && contactPhone) return `${contactName} (${contactPhone})`;
  if (contactPhone) return contactPhone;
  if (contactName) return contactName;
  return "Not provided";
};
const getLocationErrorMessage = (geoError, hasFallbackLocation) => {
  if (typeof window !== "undefined" && window.isSecureContext === false) {
    return "Location access requires HTTPS or localhost.";
  }

  switch (geoError?.code) {
    case 1:
      return "Location permission was blocked. Allow location access in your browser and try again.";
    case 2:
      return hasFallbackLocation
        ? "Live location is unavailable. Using the last known coordinates."
        : "Live location is unavailable. Turn on device location/GPS and try again.";
    case 3:
      return hasFallbackLocation
        ? "Location request timed out. Using the last known coordinates."
        : "Location request timed out. Move to better signal or turn on device location and try again.";
    default:
      return "Could not get current location.";
  }
};

const AmbulanceDashboard = () => {
  const navigate = useNavigate();
  const user = useMemo(() => getStoredUser(), []);
  const [activeSection, setActiveSection] = useState("overview");
  const [ambulance, setAmbulance] = useState(null);
  const ambulanceId = ambulance?._id || "";
  const [dispatches, setDispatches] = useState([]);
  const [form, setForm] = useState({ driverName: "", vehicleNumber: "", lat: "", lng: "" });
  const [locationForm, setLocationForm] = useState({ lat: "", lng: "" });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const locationWatchRef = useRef(null);
  const lastSyncedLocationRef = useRef(null);
  const lastSyncedAtRef = useRef(0);
  const locationSyncInFlightRef = useRef(false);
  const lastAutoSetupLocationRef = useRef(null);
  const locationErrorShownRef = useRef(false);
  const latestTrackedLocationRef = useRef(null);

  const load = useCallback(async () => {
    try {
      setError("");
      const [ambRes, disRes] = await Promise.all([getMyAmbulance(), getMyDispatches()]);
      const nextAmbulance = ambRes.ambulance || null;
      setAmbulance(nextAmbulance);
      setDispatches(disRes.dispatches || []);
      setLocationForm({
        lat: nextAmbulance?.location?.lat?.toString() || "",
        lng: nextAmbulance?.location?.lng?.toString() || "",
      });
      if (nextAmbulance?.location) {
        const savedLocation = {
          lat: Number(nextAmbulance.location.lat || 0),
          lng: Number(nextAmbulance.location.lng || 0),
        };
        latestTrackedLocationRef.current = savedLocation;
        lastSyncedLocationRef.current = savedLocation;
        lastSyncedAtRef.current = Date.now();
      }
    } catch (err) {
      setError(err.message || "Failed to load ambulance data");
    }
  }, []);

  const clearLocationWatch = useCallback(() => {
    if (locationWatchRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(locationWatchRef.current);
      locationWatchRef.current = null;
    }
  }, []);

  const applyTrackedLocation = useCallback(
    (nextLocation) => {
      latestTrackedLocationRef.current = nextLocation;
      setLocationForm({
        lat: String(nextLocation.lat),
        lng: String(nextLocation.lng),
      });

      if (ambulanceId) {
        setAmbulance((prev) => (prev ? { ...prev, location: nextLocation } : prev));
      }
    },
    [ambulanceId]
  );

  const fillSetupLocation = useCallback((nextLocation) => {
    lastAutoSetupLocationRef.current = nextLocation;
    setForm((prev) => ({
      ...prev,
      lat: String(nextLocation.lat),
      lng: String(nextLocation.lng),
    }));
  }, []);

  const fetchCurrentLocation = useCallback(
    (onResolved) => {
      if (!navigator.geolocation) {
        setError("Location is not supported on this device.");
        return;
      }

      if (typeof window !== "undefined" && window.isSecureContext === false) {
        setError("Location access requires HTTPS or localhost.");
        return;
      }

      setError("");
      const fallbackLocation = latestTrackedLocationRef.current;

      const handleResolvedLocation = (nextLocation) => {
        applyTrackedLocation(nextLocation);
        onResolved?.(nextLocation);
        locationErrorShownRef.current = false;
      };

      const requestLocation = (options, allowRetry) => {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const nextLocation = {
              lat: Number(formatCoordinate(position.coords.latitude)),
              lng: Number(formatCoordinate(position.coords.longitude)),
            };

            handleResolvedLocation(nextLocation);
          },
          (geoError) => {
            if (allowRetry && geoError?.code === 3) {
              requestLocation(LOCATION_RETRY_OPTIONS, false);
              return;
            }

            if (fallbackLocation) {
              handleResolvedLocation(fallbackLocation);
              setMessage(getLocationErrorMessage(geoError, true));
              return;
            }

            setError(getLocationErrorMessage(geoError, false));
            locationErrorShownRef.current = true;
          },
          options
        );
      };

      requestLocation(LOCATION_OPTIONS, true);
    },
    [applyTrackedLocation]
  );

  const syncTrackedLocation = useCallback(
    async (nextLocation) => {
      if (!ambulanceId || locationSyncInFlightRef.current) return;

      const previousLocation = lastSyncedLocationRef.current;
      const now = Date.now();
      const movedEnough =
        !previousLocation ||
        Math.abs(previousLocation.lat - nextLocation.lat) >= LOCATION_CHANGE_THRESHOLD ||
        Math.abs(previousLocation.lng - nextLocation.lng) >= LOCATION_CHANGE_THRESHOLD;
      const staleEnough = now - lastSyncedAtRef.current >= LOCATION_SYNC_INTERVAL_MS;

      if (!movedEnough && !staleEnough) {
        return;
      }

      locationSyncInFlightRef.current = true;
      try {
        await updateAmbulanceLocation(nextLocation);
        lastSyncedLocationRef.current = nextLocation;
        lastSyncedAtRef.current = now;
        locationErrorShownRef.current = false;
      } catch (err) {
        if (!locationErrorShownRef.current) {
          setError(err.message || "Could not update location");
          locationErrorShownRef.current = true;
        }
      } finally {
        locationSyncInFlightRef.current = false;
      }
    },
    [ambulanceId]
  );

  const startLocationTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setError("Location is not supported on this device.");
      return;
    }

    if (locationWatchRef.current !== null) return;

    locationErrorShownRef.current = false;
    locationWatchRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const nextLocation = {
          lat: Number(formatCoordinate(position.coords.latitude)),
          lng: Number(formatCoordinate(position.coords.longitude)),
        };

        applyTrackedLocation(nextLocation);

        if (ambulanceId) {
          void syncTrackedLocation(nextLocation);
          return;
        }

        setForm((prev) => {
          const previousAuto = lastAutoSetupLocationRef.current;
          const shouldAutofill =
            !prev.lat ||
            !prev.lng ||
            (previousAuto &&
              prev.lat === String(previousAuto.lat) &&
              prev.lng === String(previousAuto.lng));

          if (!shouldAutofill) return prev;

          lastAutoSetupLocationRef.current = nextLocation;
          return {
            ...prev,
            lat: String(nextLocation.lat),
            lng: String(nextLocation.lng),
          };
        });

        locationErrorShownRef.current = false;
      },
      (geoError) => {
        if (!locationErrorShownRef.current) {
          setError(getLocationErrorMessage(geoError, Boolean(latestTrackedLocationRef.current)));
          locationErrorShownRef.current = true;
        }
      },
      LOCATION_OPTIONS
    );
  }, [ambulanceId, applyTrackedLocation, syncTrackedLocation]);

  useEffect(() => {
    load();
    startLocationTracking();
    const socket = connectSocket();
    const reload = () => load();
    socket.on("dispatch:assigned", reload);
    socket.on("dispatch:updated", reload);
    socket.on("dispatch:pending", reload);
    return () => {
      socket.off("dispatch:assigned", reload);
      socket.off("dispatch:updated", reload);
      socket.off("dispatch:pending", reload);
      clearLocationWatch();
      disconnectSocket();
    };
  }, [clearLocationWatch, load, startLocationTracking]);

  const logout = () => {
    clearAuth();
    navigate("/login");
  };

  const submitRegistration = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");
    try {
      await registerAmbulance({
        driverName: form.driverName,
        vehicleNumber: form.vehicleNumber,
        location: { lat: Number(form.lat || 0), lng: Number(form.lng || 0) },
        availabilityStatus: "Offline",
      });
      setMessage("Ambulance unit registered successfully.");
      await load();
      setActiveSection("overview");
    } catch (err) {
      setError(err.message || "Registration failed");
    }
  };

  const useSetupCurrentLocation = () => {
    setMessage("");
    fetchCurrentLocation((nextLocation) => {
      fillSetupLocation(nextLocation);
    });
  };

  const updateStatus = async (status) => {
    try {
      setError("");
      setMessage("");
      await updateAmbulanceStatus(status);
      setMessage(`Status updated to ${status}.`);
      await load();
    } catch (err) {
      setError(err.message || "Could not update status");
    }
  };

  const submitLocationUpdate = async (e) => {
    e.preventDefault();
    try {
      setError("");
      setMessage("");
      await updateAmbulanceLocation({
        lat: Number(locationForm.lat || 0),
        lng: Number(locationForm.lng || 0),
      });
      lastSyncedLocationRef.current = {
        lat: Number(locationForm.lat || 0),
        lng: Number(locationForm.lng || 0),
      };
      lastSyncedAtRef.current = Date.now();
      setMessage("Location updated.");
      await load();
    } catch (err) {
      setError(err.message || "Could not update location");
    }
  };

  const useUnitCurrentLocation = () => {
    setMessage("");
    fetchCurrentLocation();
  };

  const onAccept = async (dispatchId) => {
    try {
      setError("");
      setMessage("");
      await acceptDispatch(dispatchId);
      setMessage("Dispatch accepted.");
      await load();
    } catch (err) {
      setError(err.message || "Could not accept dispatch");
    }
  };

  const onReject = async (dispatchId) => {
    try {
      setError("");
      setMessage("");
      const reason = prompt("Reason for rejection", "Unit unavailable") || "Unit unavailable";
      await rejectDispatch(dispatchId, reason);
      setMessage("Dispatch rejected.");
      await load();
    } catch (err) {
      setError(err.message || "Could not reject dispatch");
    }
  };

  const onComplete = async (dispatchId) => {
    try {
      setError("");
      setMessage("");
      await completeDispatch(dispatchId);
      setMessage("Dispatch completed.");
      await load();
    } catch (err) {
      setError(err.message || "Could not complete dispatch");
    }
  };

  const dispatchMetrics = useMemo(() => {
    const assigned = dispatches.filter((item) => item.status === "Assigned").length;
    const accepted = dispatches.filter((item) => item.status === "Accepted").length;
    const completed = dispatches.filter((item) => item.status === "Completed").length;
    return {
      total: dispatches.length,
      assigned,
      accepted,
      completed,
    };
  }, [dispatches]);

  const renderSetup = () => (
    <article className="cc-card ambulance-setup">
      <h3>Ambulance Provider Setup</h3>
      <p className="muted">Register the unit once to unlock the provider dashboard.</p>
      <form className="cc-form" onSubmit={submitRegistration}>
        <input
          placeholder="Driver name"
          value={form.driverName}
          onChange={(e) => setForm({ ...form, driverName: e.target.value })}
          required
        />
        <input
          placeholder="Vehicle number"
          value={form.vehicleNumber}
          onChange={(e) => setForm({ ...form, vehicleNumber: e.target.value })}
          required
        />
        <button type="button" className="secondary" onClick={useSetupCurrentLocation}>
          {form.lat && form.lng ? "Refresh Current Location" : "Get Current Location"}
        </button>
        <p className="muted">{formatLocationText(form.lat, form.lng)}</p>
        <button type="submit">Register Ambulance Unit</button>
      </form>
    </article>
  );

  const renderOverview = () => (
    <div className="cc-grid">
      <article className="cc-card metric">
        <h3>Unit Status</h3>
        <p>{ambulance?.availabilityStatus || "Offline"}</p>
        <small>Current operating state</small>
      </article>
      <article className="cc-card metric">
        <h3>Verification</h3>
        <p>{ambulance?.verificationStatus || "Pending"}</p>
        <small>Provider approval state</small>
      </article>
      <article className="cc-card metric">
        <h3>Total Dispatches</h3>
        <p>{dispatchMetrics.total}</p>
        <small>All requests assigned to this unit</small>
      </article>
      <article className="cc-card metric">
        <h3>Assigned</h3>
        <p>{dispatchMetrics.assigned}</p>
        <small>Awaiting response</small>
      </article>
      <article className="cc-card metric">
        <h3>Accepted</h3>
        <p>{dispatchMetrics.accepted}</p>
        <small>Currently in progress</small>
      </article>
      <article className="cc-card metric">
        <h3>Completed</h3>
        <p>{dispatchMetrics.completed}</p>
        <small>Resolved dispatches</small>
      </article>
    </div>
  );

  const renderUnit = () => (
    <>
      <article className="cc-card ambulance-profile">
        <h3>Unit Profile</h3>
        <div className="cc-grid ambulance-profile-grid">
          <div>
            <strong>Driver</strong>
            <p>{ambulance?.driverName || "-"}</p>
          </div>
          <div>
            <strong>Vehicle</strong>
            <p>{ambulance?.vehicleNumber || "-"}</p>
          </div>
          <div>
            <strong>Verification</strong>
            <p>{ambulance?.verificationStatus || "-"}</p>
          </div>
          <div>
            <strong>Status</strong>
            <p>{ambulance?.availabilityStatus || "-"}</p>
          </div>
        </div>
        <div className="row-actions">
          <button onClick={() => updateStatus("Available")}>Available</button>
          <button onClick={() => updateStatus("Busy")}>Busy</button>
          <button onClick={() => updateStatus("Offline")}>Offline</button>
        </div>
      </article>

      <article className="cc-card">
        <h3>Update Unit Location</h3>
        <form className="cc-form" onSubmit={submitLocationUpdate}>
          <button type="button" className="secondary" onClick={useUnitCurrentLocation}>
            {locationForm.lat && locationForm.lng ? "Refresh Current Location" : "Get Current Location"}
          </button>
          <p className="muted">{formatLocationText(locationForm.lat, locationForm.lng)}</p>
          <button type="submit">Save Location</button>
        </form>
      </article>
    </>
  );

  const renderDispatches = () => (
    <article className="cc-card">
      <h3>Dispatch Requests</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Assigned</th>
              <th>Status</th>
              <th>Severity</th>
              <th>Scene Details</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {dispatches.length === 0 && (
              <tr>
                <td colSpan="5" className="muted">
                  No dispatches assigned yet.
                </td>
              </tr>
            )}
            {dispatches.map((dispatch) => (
              <tr key={dispatch._id}>
                <td>{dispatch.assignedTime ? new Date(dispatch.assignedTime).toLocaleString() : "-"}</td>
                <td>{dispatch.status}</td>
                <td>{dispatch.accidentId?.severity || "-"}</td>
                <td>
                  <div>
                    <strong>Address:</strong> {dispatch.accidentId?.location?.address || "-"}
                  </div>
                  <div className="muted">
                    <strong>Emergency Contact:</strong> {formatEmergencyContactText(dispatch)}
                  </div>
                </td>
                <td>
                  <div className="row-actions compact-actions">
                    {dispatch.status === "Assigned" && (
                      <>
                        <button onClick={() => onAccept(dispatch._id)}>Accept</button>
                        <button className="secondary" onClick={() => onReject(dispatch._id)}>
                          Reject
                        </button>
                      </>
                    )}
                    {dispatch.status === "Accepted" && (
                      <button onClick={() => onComplete(dispatch._id)}>Complete</button>
                    )}
                    {!["Assigned", "Accepted"].includes(dispatch.status) && (
                      <span className="muted">No action</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );

  const renderContent = () => {
    if (!ambulance) return renderSetup();
    if (activeSection === "unit") return renderUnit();
    if (activeSection === "dispatches") return renderDispatches();
    return (
      <>
        {renderOverview()}
        {renderUnit()}
        {renderDispatches()}
      </>
    );
  };

  return (
    <div className="control-center ambulance-center">
      <aside className="cc-sidebar">
        <div className="brand">
          <h2>Ambulance Desk</h2>
          <p>{ambulance ? "Provider operations dashboard" : "Complete setup to start receiving dispatches"}</p>
        </div>

        {ambulance && (
          <nav>
            {AMBULANCE_SECTIONS.map((section) => (
              <button
                key={section.id}
                className={`nav-btn ${activeSection === section.id ? "active" : ""}`}
                onClick={() => setActiveSection(section.id)}
              >
                {section.label}
              </button>
            ))}
          </nav>
        )}
      </aside>

      <main className="cc-main">
        <header className="cc-topbar ambulance-topbar">
          <div>
            <h1>{ambulance ? "Ambulance Dashboard" : "Ambulance Provider Setup"}</h1>
            <p>
              {user?.name} ({user?.email})
            </p>
          </div>
          <button className="logout" onClick={logout}>
            Logout
          </button>
        </header>

        {message && <p className="success-text">{message}</p>}
        {error && <p className="error-text">{error}</p>}
        {renderContent()}
      </main>
    </div>
  );
};

export default AmbulanceDashboard;
