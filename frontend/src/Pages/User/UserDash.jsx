import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Camera, ClockCounterClockwise, House, UserCircle } from "@phosphor-icons/react";
import {
  fetchMe,
  getChatMessages,
  getMyAccidentHistory,
  getMyIncidentReports,
  getMyNotifications,
  getMyResponses,
  markNotificationRead,
  sendChatMessage,
  submitCitizenIncident,
  submitSafetyResponse,
  triggerSOSAlert,
  updateMyProfile,
  resolveAssetUrl,
} from "../../service/apiservice";
import { connectSocket, disconnectSocket } from "../../service/socketService";
import { clearAuth, getStoredUser } from "../../utils/auth";
import {
  ADDRESS_MAX_LENGTH,
  NAME_MAX_LENGTH,
  normalizeAddressInput,
  normalizeEmailInput,
  normalizeNameInput,
  normalizePhoneInput,
  validateProfileForm,
} from "../../utils/validation";
import "./UserDash.css";

const TABS = [
  { id: "home", label: "Home", icon: House },
  { id: "notifications", label: "Alerts", icon: Bell },
  { id: "report", label: "Report", icon: Camera },
  { id: "history", label: "History", icon: ClockCounterClockwise },
  { id: "profile", label: "Profile", icon: UserCircle },
];

const LOCATION_OPTIONS = {
  enableHighAccuracy: true,
  maximumAge: 10000,
  timeout: 15000,
};
const SOS_CONFIRM_SECONDS = 10;

const DEFAULT_REPORT_LATITUDE = "12.9716";
const DEFAULT_REPORT_LONGITUDE = "77.5946";
const REPORT_MEDIA_MAX_BYTES = 25 * 1024 * 1024;
const LIVE_VIDEO_MAX_SECONDS = 90;
const IMAGE_CAPTURE_CONSTRAINTS = {
  video: {
    facingMode: { ideal: "environment" },
  },
  audio: false,
};
const LIVE_VIDEO_CONSTRAINTS = {
  video: {
    facingMode: { ideal: "environment" },
    width: { ideal: 1280, max: 1280 },
    height: { ideal: 720, max: 720 },
  },
  audio: false,
};
const formatCoordinate = (value) => Number(value).toFixed(6);
const formatRecordingDuration = (seconds) => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
};
const getAnalysisSeverityPercentage = (analysis) => {
  const rawValue = analysis?.severityPercentage ?? analysis?.signals?.severityPercentage;
  const parsedValue = Number(rawValue);
  return Number.isFinite(parsedValue) ? Math.max(0, Math.min(100, Math.round(parsedValue))) : null;
};

const CitizenDashboard = () => {
  const user = useMemo(() => getStoredUser(), []);
  const navigate = useNavigate();
  const alarmRef = useRef(null);
  const speechRecognitionRef = useRef(null);
  const imageFileInputRef = useRef(null);
  const videoFileInputRef = useRef(null);
  const recorderVideoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const recordingStopRef = useRef(null);
  const discardRecordingRef = useRef(false);
  const locationWatchRef = useRef(null);
  const latestCoordsRef = useRef(null);
  const locationErrorShownRef = useRef(false);
  const lastAutoReportLocationRef = useRef(null);
  const sosAutoSendTimeoutRef = useRef(null);
  const sosCountdownIntervalRef = useRef(null);
  const sosDispatchingRef = useRef(false);
  const triggerSOSRef = useRef(null);

  const [notifications, setNotifications] = useState([]);
  const [history, setHistory] = useState([]);
  const [incidentReports, setIncidentReports] = useState([]);
  const [responses, setResponses] = useState([]);
  const [activePrompt, setActivePrompt] = useState(null);
  const [activeTab, setActiveTab] = useState("home");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatAccidentId, setChatAccidentId] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [reportFile, setReportFile] = useState(null);
  const [reportPreviewUrl, setReportPreviewUrl] = useState("");
  const [reportMediaKind, setReportMediaKind] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportForm, setReportForm] = useState({
    latitude: DEFAULT_REPORT_LATITUDE,
    longitude: DEFAULT_REPORT_LONGITUDE,
    address: "",
    description: "",
  });
  const [reportAnalysis, setReportAnalysis] = useState(null);
  const [pickerKind, setPickerKind] = useState("");
  const [imageCaptureOpen, setImageCaptureOpen] = useState(false);
  const [videoRecorderOpen, setVideoRecorderOpen] = useState(false);
  const [videoRecording, setVideoRecording] = useState(false);
  const [videoRecordingSeconds, setVideoRecordingSeconds] = useState(0);
  const [profileEditing, setProfileEditing] = useState(false);
  const [sosConfirmOpen, setSosConfirmOpen] = useState(false);
  const [sosCountdown, setSosCountdown] = useState(SOS_CONFIRM_SECONDS);
  const [sosSending, setSosSending] = useState(false);

  const [profileForm, setProfileForm] = useState({
    name: user?.name || "",
    email: user?.email || "",
    phone: user?.phone || "",
    address: user?.address || "",
    emergencyContactName: user?.emergencyContact?.name || "",
    emergencyContactPhone: user?.emergencyContact?.phone || "",
    bloodGroup: user?.bloodGroup || "",
  });

  const loadData = async () => {
    try {
      const [meRes, notiRes, historyRes, reportsRes, responseRes] = await Promise.all([
        fetchMe(),
        getMyNotifications(),
        getMyAccidentHistory(),
        getMyIncidentReports(),
        getMyResponses(),
      ]);
      const nextUser = meRes.user || {};
      setProfileForm({
        name: nextUser.name || "",
        email: nextUser.email || "",
        phone: nextUser.phone || "",
        address: nextUser.address || "",
        emergencyContactName: nextUser.emergencyContact?.name || "",
        emergencyContactPhone: nextUser.emergencyContact?.phone || "",
        bloodGroup: nextUser.bloodGroup || "",
      });
      setNotifications(notiRes.notifications || []);
      setHistory(historyRes.history || []);
      setIncidentReports(reportsRes.reports || []);
      setResponses(responseRes.responses || []);
    } catch (err) {
      setError(err.message || "Failed to load dashboard data");
    }
  };

  const applyTrackedCoords = useCallback((coords) => {
    const nextCoords = {
      latitude: formatCoordinate(coords.latitude),
      longitude: formatCoordinate(coords.longitude),
    };

    latestCoordsRef.current = nextCoords;
    setLocationEnabled(true);
    setReportForm((prev) => {
      const previousAuto = lastAutoReportLocationRef.current;
      const shouldAutofill =
        !prev.latitude ||
        !prev.longitude ||
        (prev.latitude === DEFAULT_REPORT_LATITUDE && prev.longitude === DEFAULT_REPORT_LONGITUDE) ||
        (previousAuto &&
          prev.latitude === previousAuto.latitude &&
          prev.longitude === previousAuto.longitude);

      if (!shouldAutofill) {
        return prev;
      }

      if (prev.latitude === nextCoords.latitude && prev.longitude === nextCoords.longitude) {
        return prev;
      }

      lastAutoReportLocationRef.current = nextCoords;
      return {
        ...prev,
        latitude: nextCoords.latitude,
        longitude: nextCoords.longitude,
      };
    });
  }, []);

  const clearLocationWatch = useCallback(() => {
    if (locationWatchRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(locationWatchRef.current);
      locationWatchRef.current = null;
    }
  }, []);

  const startLocationTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationEnabled(false);
      setError("Location is not supported on this device.");
      return;
    }

    if (locationWatchRef.current !== null) return;

    locationErrorShownRef.current = false;
    locationWatchRef.current = navigator.geolocation.watchPosition(
      (position) => {
        locationErrorShownRef.current = false;
        applyTrackedCoords(position.coords);
      },
      () => {
        setLocationEnabled(false);
        if (!locationErrorShownRef.current) {
          setError("Could not get current location.");
          locationErrorShownRef.current = true;
        }
      },
      LOCATION_OPTIONS
    );
  }, [applyTrackedCoords]);

  const stopLocationTracking = useCallback(() => {
    clearLocationWatch();
    setLocationEnabled(false);
  }, [clearLocationWatch]);

  const clearSOSConfirmTimers = useCallback(() => {
    if (sosAutoSendTimeoutRef.current) {
      clearTimeout(sosAutoSendTimeoutRef.current);
      sosAutoSendTimeoutRef.current = null;
    }

    if (sosCountdownIntervalRef.current) {
      clearInterval(sosCountdownIntervalRef.current);
      sosCountdownIntervalRef.current = null;
    }
  }, []);

  const getLatestOrCurrentCoords = useCallback(
    () =>
      new Promise((resolve, reject) => {
        if (latestCoordsRef.current) {
          resolve(latestCoordsRef.current);
          return;
        }

        if (!navigator.geolocation) {
          reject(new Error("Location is not supported on this device."));
          return;
        }

        navigator.geolocation.getCurrentPosition(
          (position) => {
            const nextCoords = {
              latitude: formatCoordinate(position.coords.latitude),
              longitude: formatCoordinate(position.coords.longitude),
            };
            latestCoordsRef.current = nextCoords;
            applyTrackedCoords(position.coords);
            resolve(nextCoords);
          },
          () => reject(new Error("Could not get current location.")),
          LOCATION_OPTIONS
        );
      }),
    [applyTrackedCoords]
  );

  const syncCurrentLocationIntoReport = () => {
    getLatestOrCurrentCoords()
      .then((position) => {
        lastAutoReportLocationRef.current = {
          latitude: String(position.latitude),
          longitude: String(position.longitude),
        };
        setReportForm((prev) => ({
          ...prev,
          latitude: String(position.latitude),
          longitude: String(position.longitude),
        }));
        setMessage("Current location added to the accident report.");
      })
      .catch((err) => setError(err.message || "Could not get current location."));
  };

  const appendChatMessage = (nextMessage) => {
    if (!nextMessage?._id) return;

    setChatMessages((prev) => {
      if (prev.some((messageItem) => messageItem._id === nextMessage._id)) return prev;
      return [...prev, nextMessage];
    });
  };

  const openSupportChat = (accidentId) => {
    if (!accidentId) return;
    setChatAccidentId(accidentId);
    setChatOpen(true);
  };

  const stopMediaStream = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    if (recordingStopRef.current) {
      clearTimeout(recordingStopRef.current);
      recordingStopRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (recorderVideoRef.current) {
      recorderVideoRef.current.srcObject = null;
    }

    discardRecordingRef.current = false;
    setVideoRecording(false);
    setVideoRecordingSeconds(0);
  };

  const selectReportMedia = (file) => {
    if (!file) return;

    if (file.size > REPORT_MEDIA_MAX_BYTES) {
      setError("Media must be 25 MB or smaller.");
      return;
    }

    setError("");

    if (reportPreviewUrl) {
      URL.revokeObjectURL(reportPreviewUrl);
    }

    const nextPreviewUrl = URL.createObjectURL(file);
    setReportFile(file);
    setReportPreviewUrl(nextPreviewUrl);
    setReportMediaKind(file.type.startsWith("video/") ? "video" : "image");
    setReportAnalysis(null);
  };

  const onChooseExistingMedia = (event) => {
    const file = event.target.files?.[0];
    selectReportMedia(file);
    event.target.value = "";
  };

  const openPicker = (kind) => {
    setPickerKind(kind);
  };

  const onPickerChoice = async (choice) => {
    const currentKind = pickerKind;
    setPickerKind("");

    if (!currentKind) return;

    if (currentKind === "image" && choice === "file") {
      imageFileInputRef.current?.click();
      return;
    }

    if (currentKind === "image" && choice === "capture") {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Image capture is not supported on this device.");
        return;
      }

      try {
        setError("");
        const stream = await navigator.mediaDevices.getUserMedia(IMAGE_CAPTURE_CONSTRAINTS);
        mediaStreamRef.current = stream;
        setImageCaptureOpen(true);
      } catch {
        setError("Camera access is required to capture an image.");
      }
      return;
    }

    if (currentKind === "video" && choice === "file") {
      videoFileInputRef.current?.click();
      return;
    }

    if (currentKind === "video" && choice === "capture") {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        setError("Video capture is not supported on this device.");
        return;
      }

      try {
        setError("");
        const stream = await navigator.mediaDevices.getUserMedia(LIVE_VIDEO_CONSTRAINTS);
        mediaStreamRef.current = stream;
        setVideoRecorderOpen(true);
      } catch {
        setError("Camera access is required to capture video.");
      }
    }
  };

  const closeVideoRecorder = () => {
    discardRecordingRef.current = true;
    stopMediaStream();
    setVideoRecorderOpen(false);
  };

  const closeImageCapture = () => {
    stopMediaStream();
    setImageCaptureOpen(false);
  };

  const captureImageNow = () => {
    const videoEl = recorderVideoRef.current;
    if (!videoEl?.videoWidth || !videoEl?.videoHeight) {
      setError("Camera preview is not ready yet.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    const context = canvas.getContext("2d");

    if (!context) {
      setError("Could not capture image.");
      return;
    }

    context.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError("Could not capture image.");
          return;
        }

        const file = new File([blob], `incident-${Date.now()}.jpg`, { type: "image/jpeg" });
        selectReportMedia(file);
        closeImageCapture();
      },
      "image/jpeg",
      0.92
    );
  };

  const startVideoRecording = () => {
    if (!mediaStreamRef.current || videoRecording) return;

    try {
      const mimeType =
        ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((candidate) =>
          MediaRecorder.isTypeSupported(candidate)
        ) || "";
      const chunks = [];
      const recorder = new MediaRecorder(
        mediaStreamRef.current,
        mimeType ? { mimeType, videoBitsPerSecond: 1200000 } : { videoBitsPerSecond: 1200000 }
      );

      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunks.push(event.data);
      };

      recorder.onerror = () => {
        setError("Video recording failed.");
        closeVideoRecorder();
      };

      recorder.onstop = () => {
        if (discardRecordingRef.current || !chunks.length) {
          stopMediaStream();
          setVideoRecorderOpen(false);
          return;
        }

        const blob = new Blob(chunks, { type: recorder.mimeType || "video/webm" });
        const file = new File([blob], `incident-${Date.now()}.webm`, { type: blob.type || "video/webm" });
        selectReportMedia(file);
        setVideoRecorderOpen(false);
        stopMediaStream();
      }; 

      mediaRecorderRef.current = recorder;
      discardRecordingRef.current = false;
      setError("");
      recorder.start(1000);
      setVideoRecording(true);
      setVideoRecordingSeconds(0);

      recordingTimerRef.current = setInterval(() => {
        setVideoRecordingSeconds((prev) => Math.min(prev + 1, LIVE_VIDEO_MAX_SECONDS));
      }, 1000);

      recordingStopRef.current = setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
          setMessage(`Live capture stopped after ${LIVE_VIDEO_MAX_SECONDS} seconds. Use the selected clip or record again.`);
          mediaRecorderRef.current.stop();
        }
      }, LIVE_VIDEO_MAX_SECONDS * 1000);
    } catch {
      setError("Could not start video recording.");
      closeVideoRecorder();
    }
  };

  const stopVideoRecordingNow = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  };

  const stopAlarm = () => {
    if (!alarmRef.current) return;

    const { audioContext, gainNode, oscillator } = alarmRef.current;

    try {
      gainNode?.gain.cancelScheduledValues(audioContext.currentTime);
      gainNode?.gain.setValueAtTime(0, audioContext.currentTime);
      oscillator?.stop();
      oscillator?.disconnect();
      gainNode?.disconnect();
      audioContext?.close();
    } catch {}

    alarmRef.current = null;
  };

  const startAlarm = async () => {
    if (alarmRef.current || typeof window === "undefined") return;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    try {
      const audioContext = new AudioContextClass();
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.type = "square";
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(660, audioContext.currentTime + 0.35);
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime + 0.7);
      oscillator.frequency.setValueAtTime(660, audioContext.currentTime + 1.05);
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.08, audioContext.currentTime + 0.03);
      oscillator.start();

      alarmRef.current = { audioContext, oscillator, gainNode };
    } catch {}
  };

  useEffect(() => {
    loadData();
    startLocationTracking();

    const socket = connectSocket();

    socket.on("alert:accident", (payload) => {
      setNotifications((prev) => [
        {
          _id: `live-${Date.now()}`,
          type: "ACCIDENT_ALERT",
          message: `Accident ${payload.severity} detected nearby. Confirm safety now.`,
          isRead: false,
          accidentId: payload.accidentId,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
      setActiveTab("notifications");
    });

    socket.on("chatbot:trigger", (payload) => {
      setActivePrompt({ accidentId: payload.accidentId, startedAt: Date.now() });
    });

    socket.on("chatbot:timeout", (payload) => {
      setActivePrompt(null);
      setNotifications((prev) => [
        {
          _id: `timeout-${Date.now()}`,
          type: "SYSTEM",
          message: payload.message,
          isRead: false,
          accidentId: payload.accidentId,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
      openSupportChat(payload.accidentId);
      loadData();
    });

    socket.on("chat:message", ({ message: nextMessage }) => {
      if (!nextMessage) return;

      const nextAccidentId =
        typeof nextMessage.accidentId === "string" ? nextMessage.accidentId : nextMessage.accidentId?._id;

      if (nextAccidentId) {
        setChatAccidentId((current) => current || nextAccidentId);
      }

      appendChatMessage(nextMessage);
      setChatOpen(true);
    });

    return () => {
      socket.off("alert:accident");
      socket.off("chatbot:trigger");
      socket.off("chatbot:timeout");
      socket.off("chat:message");
      clearLocationWatch();
      disconnectSocket();
    };
  }, [clearLocationWatch, startLocationTracking]);

  useEffect(() => {
    if (activePrompt) {
      startAlarm();
    } else {
      stopAlarm();
    }

    return () => stopAlarm();
  }, [activePrompt]);

  useEffect(() => {
    if ((!videoRecorderOpen && !imageCaptureOpen) || !recorderVideoRef.current || !mediaStreamRef.current) return;
    recorderVideoRef.current.srcObject = mediaStreamRef.current;
  }, [imageCaptureOpen, videoRecorderOpen]);

  useEffect(() => {
    if (!sosConfirmOpen || sosSending) return undefined;

    clearSOSConfirmTimers();
    setSosCountdown(SOS_CONFIRM_SECONDS);
    sosCountdownIntervalRef.current = setInterval(() => {
      setSosCountdown((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    sosAutoSendTimeoutRef.current = setTimeout(() => {
      triggerSOSRef.current?.();
    }, SOS_CONFIRM_SECONDS * 1000);

    return () => clearSOSConfirmTimers();
  }, [clearSOSConfirmTimers, sosConfirmOpen, sosSending]);

  useEffect(() => () => clearSOSConfirmTimers(), [clearSOSConfirmTimers]);

  useEffect(() => () => {
    if (reportPreviewUrl) {
      URL.revokeObjectURL(reportPreviewUrl);
    }
    stopMediaStream();
  }, [reportPreviewUrl]);

  useEffect(() => {
    if (!chatOpen || !chatAccidentId) return;

    const loadChat = async () => {
      try {
        const data = await getChatMessages({ accidentId: chatAccidentId });
        setChatMessages(data.messages || []);
      } catch (err) {
        setError(err.message || "Failed to load support chat");
      }
    };

    loadChat();
  }, [chatOpen, chatAccidentId]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const onSafetyResponse = async (responseType) => {
    if (!activePrompt) return;

    try {
      await submitSafetyResponse({
        accidentId: activePrompt.accidentId,
        responseType,
        responseTimeMs: Date.now() - activePrompt.startedAt,
      });
      setActivePrompt(null);

      if (responseType === "Help") {
        openSupportChat(activePrompt.accidentId);
      }

      setMessage(responseType === "Help" ? "Emergency response requested." : "Safety confirmed.");
      await loadData();
    } catch (err) {
      setError(err.message || "Failed to submit response");
    }
  };

  const onMarkRead = async (notificationId) => {
    try {
      await markNotificationRead(notificationId);
      setNotifications((prev) =>
        prev.map((notification) =>
          notification._id === notificationId ? { ...notification, isRead: true } : notification
        )
      );
    } catch (err) {
      setError(err.message || "Failed to mark notification");
    }
  };

  const onSendChat = async (nextMessage = chatInput) => {
    if (!chatAccidentId || !nextMessage.trim()) return;

    try {
      setError("");
      const data = await sendChatMessage({
        accidentId: chatAccidentId,
        message: nextMessage.trim(),
      });
      appendChatMessage(data.message);
      setChatInput("");
    } catch (err) {
      setError(err.message || "Failed to send chat message");
    }
  };

  const onShareCurrentLocation = () => {
    getLatestOrCurrentCoords()
      .then((position) => {
        onSendChat(`My location is ${position.latitude}, ${position.longitude}`);
      })
      .catch((err) => setError(err.message || "Could not get current location."));
  };

  const toggleVoiceInput = () => {
    const SpeechRecognitionClass =
      typeof window !== "undefined" &&
      (window.SpeechRecognition || window.webkitSpeechRecognition);

    if (!SpeechRecognitionClass) {
      setError("Voice input is not supported in this browser.");
      return;
    }

    if (isListening && speechRecognitionRef.current) {
      speechRecognitionRef.current.stop();
      return;
    }

    const recognition = new SpeechRecognitionClass();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => {
      setIsListening(false);
      setError("Voice input failed.");
    };
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || "";
      setChatInput(transcript);
    };

    speechRecognitionRef.current = recognition;
    recognition.start();
  };

  const openSOSConfirmation = () => {
    if (sosConfirmOpen || sosSending) return;

    setError("");
    setMessage("");
    setSosCountdown(SOS_CONFIRM_SECONDS);
    setSosConfirmOpen(true);
  };

  const closeSOSConfirmation = () => {
    if (sosSending) return;

    clearSOSConfirmTimers();
    setSosConfirmOpen(false);
    setSosCountdown(SOS_CONFIRM_SECONDS);
  };

  const triggerSOS = async () => {
    if (sosDispatchingRef.current) return;

    sosDispatchingRef.current = true;
    clearSOSConfirmTimers();
    setSosSending(true);

    try {
      setError("");
      const coords = await getLatestOrCurrentCoords();
      const savedAddress = normalizeAddressInput(profileForm.address);
      const data = await triggerSOSAlert({
        ...coords,
        address: savedAddress,
        message: "Citizen requested urgent help through SOS.",
      });

      if (data.chatAccidentId) {
        setChatAccidentId(data.chatAccidentId);
        setChatOpen(true);
      }

      setMessage("SOS alert sent to admin. Support chat is ready.");
      await loadData();
    } catch (err) {
      setError(err.message || "Could not send SOS");
    } finally {
      sosDispatchingRef.current = false;
      setSosSending(false);
      setSosConfirmOpen(false);
      setSosCountdown(SOS_CONFIRM_SECONDS);
    }
  };

  triggerSOSRef.current = triggerSOS;

  const saveProfile = async () => {
    try {
      setError("");
      setMessage("");

      const validationError = validateProfileForm(profileForm);
      if (validationError) {
        setError(validationError);
        return;
      }

      await updateMyProfile({
        name: normalizeNameInput(profileForm.name),
        email: normalizeEmailInput(profileForm.email),
        phone: normalizePhoneInput(profileForm.phone),
        address: normalizeAddressInput(profileForm.address),
        bloodGroup: String(profileForm.bloodGroup || "").trim(),
        emergencyContact: {
          name: normalizeNameInput(profileForm.emergencyContactName),
          phone: normalizePhoneInput(profileForm.emergencyContactPhone),
        },
      });
      setProfileEditing(false);
      setMessage("Profile updated successfully.");
      await loadData();
    } catch (err) {
      setError(err.message || "Could not update profile");
    }
  };

  const onSubmitIncidentReport = async (e) => {
    e.preventDefault();

    if (!reportFile) {
      setError("Choose an accident image or video first.");
      return;
    }

    try {
      setReportSubmitting(true);
      setError("");
      setMessage("");
      const data = await submitCitizenIncident(reportFile, reportForm);
      setReportAnalysis(data.analysis || null);
      if (reportPreviewUrl) {
        URL.revokeObjectURL(reportPreviewUrl);
      }
      setReportFile(null);
      setReportPreviewUrl("");
      setReportMediaKind("");
      setReportForm({
        latitude: reportForm.latitude,
        longitude: reportForm.longitude,
        address: "",
        description: "",
      });
      setMessage(data.message || "Incident submitted. Admin will review and approve it.");
      await loadData();
    } catch (err) {
      setError(err.message || "Could not submit incident report");
    } finally {
      setReportSubmitting(false);
    }
  };

  const logout = () => {
    clearAuth();
    navigate("/login");
  };

  const renderHome = () => (
    <>
      <section className="hero-card">
        <div>
          <h2>Stay Safe, {profileForm.name || "Citizen"}</h2>
          <p>Instant alerts, quick safety confirmation, and SOS dispatch in one tap.</p>
          <div className="hero-tags">
            <span className={locationEnabled ? "tag active" : "tag"}>
              Location {locationEnabled ? "On" : "Off"}
            </span>
            <span className="tag">Unread Alerts: {unreadCount}</span>
            <span className="tag">Responses: {responses.length}</span>
          </div>
        </div>
        <button className="sos-button" onClick={openSOSConfirmation}>
          SOS
        </button>
      </section>

      <section className="grid-cards">
        <article className="app-card">
          <h3>Safety Actions</h3>
          <div className="quick-actions">
            <button onClick={locationEnabled ? stopLocationTracking : startLocationTracking}>
              {locationEnabled ? "Disable Location" : "Enable Location"}
            </button>
            <button onClick={() => setActiveTab("notifications")}>Open Alerts</button>
            <button onClick={() => setActiveTab("history")}>View Incident History</button>
          </div>
        </article>

        <article className="app-card">
          <h3>Recent Activity</h3>
          <ul className="activity-list">
            {history.slice(0, 4).map((item) => (
              <li key={item.responseId}>
                <strong>{item.responseType}</strong>
                <span>{new Date(item.createdAt).toLocaleString()}</span>
              </li>
            ))}
            {!history.length && <li>No activity yet</li>}
          </ul>
        </article>
      </section>
    </>
  );

  const renderNotifications = () => (
    <section className="app-card full">
      <h3>Notifications</h3>
      <ul className="notify-list">
        {notifications.map((notification) => (
          <li key={notification._id} className={notification.isRead ? "" : "unread"}>
            <div>
              <h4>{notification.type}</h4>
              <p>{notification.message}</p>
              <small>{new Date(notification.createdAt).toLocaleString()}</small>
            </div>
            <div className="notification-actions">
              {notification.accidentId && (
                <button onClick={() => openSupportChat(notification.accidentId)}>Open Chat</button>
              )}
              {!String(notification._id).startsWith("live-") &&
                !String(notification._id).startsWith("timeout-") &&
                !notification.isRead && (
                  <button onClick={() => onMarkRead(notification._id)}>Mark Read</button>
                )}
            </div>
          </li>
        ))}
        {!notifications.length && <li>No notifications</li>}
      </ul>
    </section>
  );

  const renderHistory = () => (
    <section className="app-card full">
      <h3>Incident History</h3>
      <div className="history-grid">
        {history.map((item) => (
          <article key={item.responseId} className="history-card">
            <header>
              <strong>{item.accident?.severity || "Unknown"} Incident</strong>
              <span>{item.accident?.status || "-"}</span>
            </header>
            <p>
              <b>Your Response:</b> {item.responseType}
            </p>
            <p>
              <b>Time:</b> {new Date(item.createdAt).toLocaleString()}
            </p>
            <p>
              <b>Location:</b> {item.accident?.location?.address || "Coordinates captured"}
            </p>
            {item.accident?._id && (
              <button onClick={() => openSupportChat(item.accident._id)}>Open Chat</button>
            )}
          </article>
        ))}
        {!history.length && <p>No incident history available.</p>}
      </div>
    </section>
  );

  const renderReport = () => (
    <section className="report-layout">
      <article className="app-card full">
        <h3>Report Accident Witnessed Nearby</h3>
        <p className="muted-text">
          Capture a photo or record live video from the scene, then upload it through the same report form.
        </p>
        <input
          ref={imageFileInputRef}
          className="report-hidden-input"
          type="file"
          accept="image/*"
          onChange={onChooseExistingMedia}
        />
        <input
          ref={videoFileInputRef}
          className="report-hidden-input"
          type="file"
          accept="video/*"
          onChange={onChooseExistingMedia}
        />
        <form className="report-form" onSubmit={onSubmitIncidentReport}>
          <div className="report-evidence-card report-wide">
            <div className="report-evidence-head">
              <strong>Accident Evidence</strong>
              <p className="muted-text">
                Choose live camera capture or an existing file. Video uploads must stay within 25 MB.
              </p>
            </div>
            <div className="report-capture-actions">
              <button type="button" onClick={() => openPicker("image")}>Capture Image</button>
              <button type="button" onClick={() => openPicker("video")}>Live Video</button>
            </div>
            {reportPreviewUrl ? (
              <div className="report-selected-preview">
                {reportMediaKind === "video" ? (
                  <video className="report-media-preview" src={reportPreviewUrl} controls />
                ) : (
                  <img className="report-media-preview" src={reportPreviewUrl} alt="Selected report evidence" />
                )}
                <p className="report-selected-meta">
                  Selected {reportMediaKind || "media"}: {reportFile?.name}
                </p>
              </div>
            ) : (
              <p className="muted-text">No evidence selected yet.</p>
            )}
          </div>
          <label>
            Latitude
            <input
              value={reportForm.latitude}
              onChange={(e) => setReportForm({ ...reportForm, latitude: e.target.value })}
              required
            />
          </label>
          <label>
            Longitude
            <input
              value={reportForm.longitude}
              onChange={(e) => setReportForm({ ...reportForm, longitude: e.target.value })}
              required
            />
          </label>
          <label>
            Address
            <input
              value={reportForm.address}
              onChange={(e) => setReportForm({ ...reportForm, address: e.target.value })}
              placeholder="Street, landmark, or area"
            />
          </label>
          <label className="report-wide">
            What happened?
            <textarea
              value={reportForm.description}
              onChange={(e) => setReportForm({ ...reportForm, description: e.target.value })}
              placeholder="Describe what you saw, number of vehicles, road blockage, injuries, smoke, etc."
              rows={4}
            />
          </label>
          <div className="report-actions report-wide">
            <button type="button" onClick={syncCurrentLocationIntoReport}>
              Use Current Location
            </button>
            <button type="submit" disabled={reportSubmitting || !reportFile}>
              {reportSubmitting ? "Submitting..." : "Submit to Admin"}
            </button>
          </div>
        </form>
        {reportAnalysis && (
          <div className="report-analysis-card">
            <h4>AI Accident Analysis</h4>
            <p><strong>Severity:</strong> {reportAnalysis.severity}</p>
            {getAnalysisSeverityPercentage(reportAnalysis) !== null && (
              <p><strong>Severity Score:</strong> {getAnalysisSeverityPercentage(reportAnalysis)}%</p>
            )}
            <p><strong>Confidence:</strong> {Math.round((reportAnalysis.confidenceScore || 0) * 100)}%</p>
            <p><strong>Summary:</strong> {reportAnalysis.summary}</p>
          </div>
        )}
      </article>

      <article className="app-card full">
        <h3>My Submitted Reports</h3>
        <div className="history-grid">
          {incidentReports.map((report) => {
            const media = report.payload?.metadata?.media;
            const analysis = report.payload?.metadata?.aiImageAnalysis;
            const severityPercentage = getAnalysisSeverityPercentage(analysis);

            return (
              <article key={report._id} className="history-card report-history-card">
                <header>
                  <strong>{report.payload?.severity || "Incident"} Report</strong>
                  <span>{report.status}</span>
                </header>
                <p>
                  <b>Created:</b> {new Date(report.createdAt).toLocaleString()}
                </p>
                <p>
                  <b>Address:</b> {report.payload?.address || "Coordinates captured"}
                </p>
                <p>
                  <b>Description:</b> {report.payload?.metadata?.citizenDescription || "-"}
                </p>
                {media?.url && media.kind === "image" && (
                  <img className="report-media-preview" src={resolveAssetUrl(media.url)} alt="Accident report" />
                )}
                {media?.url && media.kind === "video" && (
                  <video className="report-media-preview" src={resolveAssetUrl(media.url)} controls />
                )}
                {analysis && (
                  <div className="report-analysis-inline">
                    <strong>AI:</strong> {analysis.severity}
                    {severityPercentage !== null ? ` - ${severityPercentage}% severity` : ""}
                    {` (${Math.round((analysis.confidenceScore || 0) * 100)}% confidence)`}
                  </div>
                )}
              </article>
            );
          })}
          {!incidentReports.length && <p>No citizen reports submitted yet.</p>}
        </div>
      </article>
    </section>
  );

  const renderPickerModal = () => (
    <div className="report-picker-modal">
      <div className="report-picker-card">
        <h3>{pickerKind === "video" ? "Add Video Evidence" : "Add Image Evidence"}</h3>
        <p>Choose whether you want to capture a new {pickerKind} or select one that already exists.</p>
        <div className="report-picker-actions">
          <button onClick={() => onPickerChoice("capture")}>
            {pickerKind === "video" ? "Open Live Camera" : "Open Camera"}
          </button>
          <button className="secondary-light" onClick={() => onPickerChoice("file")}>
            Select File
          </button>
        </div>
        <button className="report-picker-cancel" onClick={() => setPickerKind("")}>
          Cancel
        </button>
      </div>
    </div>
  );

  const renderVideoRecorder = () => (
    <div className="report-picker-modal">
      <div className="report-recorder-card">
        <header>
          <div>
            <h3>Live Video Capture</h3>
            <p>Keep the camera live, start recording when ready, and stop when you want to use the clip.</p>
          </div>
          <button className="report-picker-cancel compact" onClick={closeVideoRecorder}>
            Close
          </button>
        </header>
        <video ref={recorderVideoRef} className="report-recorder-preview" autoPlay playsInline muted />
        <div className="report-recorder-meta">
          <span className={`recording-pill ${videoRecording ? "live" : "idle"}`}>
            {videoRecording ? `Recording ${formatRecordingDuration(videoRecordingSeconds)}` : "Camera preview is live"}
          </span>
          <span className="report-recorder-note">
            Record up to {LIVE_VIDEO_MAX_SECONDS} seconds, or stop earlier when the scene has been captured.
          </span>
        </div>
        <div className="report-recorder-actions">
          {!videoRecording ? (
            <button onClick={startVideoRecording}>Start Live Recording</button>
          ) : (
            <>
              <button className="secondary-light" onClick={stopVideoRecordingNow}>
                Stop And Use Video
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );

  const renderImageCapture = () => (
    <div className="report-picker-modal">
      <div className="report-recorder-card">
        <header>
          <div>
            <h3>Capture Image</h3>
            <p>Frame the accident scene and save a still image as evidence.</p>
          </div>
          <button className="report-picker-cancel compact" onClick={closeImageCapture}>
            Close
          </button>
        </header>
        <video ref={recorderVideoRef} className="report-recorder-preview" autoPlay playsInline muted />
        <div className="report-recorder-actions">
          <button onClick={captureImageNow}>Capture Photo</button>
        </div>
      </div>
    </div>
  );

  const renderProfile = () => (
    <section className="app-card full">
      <div className="profile-head">
        <div className="profile-hero">
          <div className="profile-avatar-large">{(profileForm.name || "U").charAt(0).toUpperCase()}</div>
          <div>
            <h3>{profileForm.name || "Citizen"}</h3>
            <p className="muted-text">{profileForm.email || "No email added"}</p>
            <div className="profile-pills">
              <span>{profileForm.phone || "No phone"}</span>
              <span>{profileForm.bloodGroup || "Blood group not set"}</span>
            </div>
          </div>
        </div>
        {!profileEditing ? (
          <button onClick={() => setProfileEditing(true)}>Edit Profile</button>
        ) : (
          <button className="secondary-light" onClick={() => { setProfileEditing(false); loadData(); }}>
            Cancel
          </button>
        )}
      </div>
      <div className="profile-layout">
        <section className="profile-panel">
          <div className="profile-section-head">
            <div>
              <h4>Account Details</h4>
              <p className="muted-text">Core user information synced from the database.</p>
            </div>
          </div>
          <div className="profile-grid">
            <label>
              Name
              <input
                type="text"
                value={profileForm.name}
                onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                disabled={!profileEditing}
                maxLength={NAME_MAX_LENGTH}
              />
            </label>
            <label>
              Email
              <input
                type="email"
                value={profileForm.email}
                onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                disabled={!profileEditing}
              />
            </label>
            <label>
              Phone
              <input
                type="tel"
                value={profileForm.phone}
                onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                disabled={!profileEditing}
              />
            </label>
            <label>
              Address
              <input
                type="text"
                value={profileForm.address}
                onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })}
                disabled={!profileEditing}
                placeholder="Home address"
                maxLength={ADDRESS_MAX_LENGTH}
              />
            </label>
            <label>
              Blood Group
              <input
                type="text"
                value={profileForm.bloodGroup}
                onChange={(e) => setProfileForm({ ...profileForm, bloodGroup: e.target.value })}
                placeholder="e.g. O+"
                disabled={!profileEditing}
              />
            </label>
          </div>
        </section>

        <section className="profile-panel contact-panel">
          <div className="profile-section-head">
            <div>
              <h4>Emergency Contact</h4>
              <p className="muted-text">Primary person to reach if you need urgent help.</p>
            </div>
            <span className="contact-badge">
              {profileForm.emergencyContactName && profileForm.emergencyContactPhone ? "Saved" : "Not set"}
            </span>
          </div>
          <div className="contact-card">
            <div className="contact-avatar">
              {(profileForm.emergencyContactName || "E").charAt(0).toUpperCase()}
            </div>
            <div className="contact-copy">
              <strong>{profileForm.emergencyContactName || "Add emergency contact"}</strong>
              <span>{profileForm.emergencyContactPhone || "No emergency phone saved"}</span>
            </div>
          </div>
          <div className="profile-grid contact-grid">
            <label>
              Contact Name
              <input
                type="text"
                value={profileForm.emergencyContactName}
                onChange={(e) => setProfileForm({ ...profileForm, emergencyContactName: e.target.value })}
                disabled={!profileEditing}
                placeholder="Full name"
                maxLength={NAME_MAX_LENGTH}
              />
            </label>
            <label>
              Contact Phone
              <input
                type="tel"
                value={profileForm.emergencyContactPhone}
                onChange={(e) => setProfileForm({ ...profileForm, emergencyContactPhone: e.target.value })}
                disabled={!profileEditing}
                placeholder="Phone number"
              />
            </label>
          </div>
        </section>
      </div>
      {profileEditing && (
        <div className="profile-actions">
          <button onClick={saveProfile}>Save Profile</button>
        </div>
      )}
    </section>
  );

  const renderSupportChat = () => (
    <div className="support-chat-modal">
      <div className="support-chat-card">
        <header className="support-chat-header">
          <div>
            <h3>Emergency Support Chat</h3>
            <p>Live chat with admin for this incident.</p>
          </div>
          <button className="support-chat-close" onClick={() => setChatOpen(false)}>
            Close
          </button>
        </header>

        <div className="quick-chat-actions">
          <button onClick={onShareCurrentLocation}>My location is - current location</button>
          <button onClick={() => onSendChat("I'm hit bad")}>I'm hit bad</button>
          <button onClick={() => onSendChat("I'm safe but need help")}>I'm safe but need help</button>
          <button onClick={() => onSendChat("Ambulance has not reached yet")}>
            Ambulance has not reached yet
          </button>
        </div>

        <div className="support-chat-body">
          {chatMessages.map((chat) => (
            <div
              key={chat._id}
              className={`chat-bubble ${chat.senderType === "user" ? "mine" : "theirs"}`}
            >
              <strong>
                {chat.senderType === "admin"
                  ? "Admin"
                  : chat.senderType === "ai"
                    ? "AI"
                  : chat.senderType === "system"
                    ? "System"
                    : "You"}
              </strong>
              <p>{chat.message}</p>
              <small>{new Date(chat.createdAt).toLocaleTimeString()}</small>
            </div>
          ))}
          {!chatMessages.length && <p className="muted">No chat messages yet.</p>}
        </div>

        <div className="support-chat-input">
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Describe your condition or what help you need"
          />
          <button onClick={toggleVoiceInput}>{isListening ? "Listening..." : "Voice"}</button>
          <button onClick={() => onSendChat()}>Send</button>
        </div>
      </div>
    </div>
  );

  const renderSOSConfirmation = () => (
    <div className="chatbot-modal">
      <div className="sos-confirm-card">
        <h3>Send SOS Alert?</h3>
        <p>Are you sure you want to send an SOS alert now?</p>
        <p className="sos-confirm-note">
          This SOS will be sent automatically in {sosCountdown} second{sosCountdown === 1 ? "" : "s"} if you do not
          press OK.
        </p>
        <div className="sos-confirm-actions">
          <button className="sos-confirm-primary" onClick={triggerSOS} disabled={sosSending}>
            {sosSending ? "Sending SOS..." : "OK"}
          </button>
          <button className="sos-confirm-secondary" onClick={closeSOSConfirmation} disabled={sosSending}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="citizen-app">
      <aside className={drawerOpen ? "side-nav open" : "side-nav"}>
        <div className="drawer-header">
          <h2>Citizen App</h2>
          <button className="drawer-close" onClick={() => setDrawerOpen(false)}>
            x
          </button>
        </div>
        <div className="user-block">
          <div className="avatar">{(profileForm.name || "U").charAt(0).toUpperCase()}</div>
          <div>
            <strong>{profileForm.name || "Citizen"}</strong>
            <p>{profileForm.email}</p>
          </div>
        </div>
        <nav>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={activeTab === tab.id ? "menu active" : "menu"}
              onClick={() => {
                setActiveTab(tab.id);
                setDrawerOpen(false);
              }}
            >
              <span className="menu-icon">
                <tab.icon size={18} weight="duotone" />
              </span>
              {tab.label}
              {tab.id === "notifications" && unreadCount > 0 && <b className="count">{unreadCount}</b>}
            </button>
          ))}
        </nav>
        <button className="logout-btn" onClick={logout}>
          Logout
        </button>
      </aside>

      <main className="main-view">
        <header className="top-head">
          <button className="menu-toggle" onClick={() => setDrawerOpen(true)}>
            Menu
          </button>
          <h1>{TABS.find((tab) => tab.id === activeTab)?.label}</h1>
          <button className="sos-mini" onClick={openSOSConfirmation}>
            SOS
          </button>
        </header>

        {message && <p className="success-text">{message}</p>}
        {error && <p className="error-text">{error}</p>}

        {activeTab === "home" && renderHome()}
        {activeTab === "notifications" && renderNotifications()}
        {activeTab === "report" && renderReport()}
        {activeTab === "history" && renderHistory()}
        {activeTab === "profile" && renderProfile()}
      </main>

      <nav className="bottom-nav">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={activeTab === tab.id ? "tab active" : "tab"}
            onClick={() => setActiveTab(tab.id)}
          >
            <span>
              <tab.icon size={20} weight="duotone" />
            </span>
            <small>{tab.label}</small>
            {tab.id === "notifications" && unreadCount > 0 && <b className="dot">{unreadCount}</b>}
          </button>
        ))}
      </nav>

      {activePrompt && (
        <div className="chatbot-modal">
          <div className="chatbot-card">
            <h3>Safety Check</h3>
            <p>Accident detected nearby. Are you safe?</p>
            <p className="alarm-note">Alarm sounding. Respond to stop it.</p>
            <div className="actions">
              <button onClick={() => onSafetyResponse("Safe")}>I'm Safe</button>
              <button className="danger" onClick={() => onSafetyResponse("Help")}>
                Need Help
              </button>
            </div>
          </div>
        </div>
      )}

      {sosConfirmOpen && renderSOSConfirmation()}
      {pickerKind && renderPickerModal()}
      {imageCaptureOpen && renderImageCapture()}
      {videoRecorderOpen && renderVideoRecorder()}
      {chatOpen && renderSupportChat()}
    </div>
  );
};

export default CitizenDashboard;
