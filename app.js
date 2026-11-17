lucide.createIcons();

// === KONFIGURASI & STATE ===
const STORAGE_URL_KEY = "firedetector_colab_url";
const STORAGE_HISTORY_KEY = "firedetector_fire_history";
const MAX_HISTORY_ITEMS = 30;
const MAX_CHART_POINTS = 24;

let apiBaseUrl = localStorage.getItem(STORAGE_URL_KEY) || "";
let isServerOnline = false;

let rawHistory = JSON.parse(localStorage.getItem(STORAGE_HISTORY_KEY) || "[]");
let detectionHistory = rawHistory
  .map((item) => ({ ...item, severity: simplifySeverityLabel(item.severity) }))
  .filter((item) => isValidHazardLabel(item.severity));
localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(detectionHistory));

let mediaStream = null;
let isStreaming = false;
let isRequestInFlight = false;
let currentViewName = "dashboard";
let selectedDeviceId = "";
let availableVideoDevices = [];
let lastRealtimeLogTime = 0;
let currentModalImage = null;
let isMobileCardExpanded = false;

let fireSeries = new Array(MAX_CHART_POINTS).fill(0);
let smokeSeries = new Array(MAX_CHART_POINTS).fill(0);

// === DOM ELEMENTS ===
const topNavbar = document.getElementById("topNavbar");
const glassAlertContainer = document.getElementById("glassAlertContainer");
const mainContainer = document.getElementById("mainContainer");
const digitalClock = document.getElementById("digitalClock");
const navPillGroups = document.querySelectorAll(".nav-pill-group");
const navPillBtns = document.querySelectorAll(".nav-pill-btn");
const navJumps = document.querySelectorAll(".nav-jump");
const navHistoryCounts = document.querySelectorAll(".nav-history-count");
const mobileSecondaryNav = document.getElementById("mobileSecondaryNav");

const views = {
  dashboard: document.getElementById("view-dashboard"),
  history: document.getElementById("view-history"),
  about: document.getElementById("view-about"),
};

const mobileCompactOverview = document.getElementById("mobileCompactOverview");
const fullStatusBody = document.getElementById("fullStatusBody");
const compactStatusDot = document.getElementById("compactStatusDot");
const compactStatusText = document.getElementById("compactStatusText");
const compactTrendTag = document.getElementById("compactTrendTag");
const compactSubSummary = document.getElementById("compactSubSummary");

const connPopoverBtn = document.getElementById("connPopoverBtn");
const connPopover = document.getElementById("connPopover");
const closeConnPopover = document.getElementById("closeConnPopover");
const connDot = document.getElementById("connDot");
const connLabel = document.getElementById("connLabel");
const connDetailText = document.getElementById("connDetailText");
const apiUrlInput = document.getElementById("apiUrlInput");
const saveConnectBtn = document.getElementById("saveConnectBtn");

const sirenToggleBtn = document.getElementById("sirenToggleBtn");
const sirenIcon = document.getElementById("sirenIcon");

const ambientIdleBg = document.getElementById("ambientIdleBg");
const webcamVideo = document.getElementById("webcamVideo");
const overlayCanvas = document.getElementById("overlayCanvas");
const centerReticle = document.getElementById("centerReticle");
const floatingTelemetry = document.getElementById("floatingTelemetry");
const hudHotspotText = document.getElementById("hudHotspotText");
const hudConfText = document.getElementById("hudConfText");
const idleCenterHint = document.getElementById("idleCenterHint");

const switchCamBtn = document.getElementById("switchCamBtn");
const cameraDropdown = document.getElementById("cameraDropdown");
const cameraDeviceList = document.getElementById("cameraDeviceList");
const toggleCamBtn = document.getElementById("toggleCamBtn");
const toggleCamIcon = document.getElementById("toggleCamIcon");
const toggleCamText = document.getElementById("toggleCamText");
const captureCanvas = document.getElementById("captureCanvas");

const hazardToast = document.getElementById("hazardToast");
const toastText = document.getElementById("toastText");
const toastSub = document.getElementById("toastSub");

const realtimeChartCanvas = document.getElementById("realtimeChartCanvas");
const chartSummaryText = document.getElementById("chartSummaryText");
const chartLatestVal = document.getElementById("chartLatestVal");

const statStatusText = document.getElementById("statStatusText");
const statTrendTag = document.getElementById("statTrendTag");
const statFireText = document.getElementById("statFireText");
const statSmokeText = document.getElementById("statSmokeText");
const manualFileInput = document.getElementById("manualFileInput");
const uploadLoadingOverlay = document.getElementById("uploadLoadingOverlay");

const locationNameText = document.getElementById("locationNameText");
const coordLatLon = document.getElementById("coordLatLon");
const refreshLocBtn = document.getElementById("refreshLocBtn");

const cardHistoryBadge = document.getElementById("cardHistoryBadge");
const fullHistoryCountBadge = document.getElementById("fullHistoryCountBadge");
const recentHistoryList = document.getElementById("recentHistoryList");
const fullHistoryGrid = document.getElementById("fullHistoryGrid");
const severityFilter = document.getElementById("severityFilter");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");

const glassConfirmModal = document.getElementById("glassConfirmModal");
const confirmCancelBtn = document.getElementById("confirmCancelBtn");
const confirmAcceptBtn = document.getElementById("confirmAcceptBtn");

const resultModal = document.getElementById("resultModal");
const closeModalBtn = document.getElementById("closeModalBtn");
const closeModalFooterBtn = document.getElementById("closeModalFooterBtn");
const modalAnnotatedImg = document.getElementById("modalAnnotatedImg");
const modalSeverityText = document.getElementById("modalSeverityText");
const modalArea = document.getElementById("modalArea");
const modalSmokeArea = document.getElementById("modalSmokeArea");
const modalCoords = document.getElementById("modalCoords");
const modalDownloadBtn = document.getElementById("modalDownloadBtn");

// === AUDIO SIRINE ===
let audioCtx = null;
let isSirenMuted = false;
let currentSirenLevel = null;
let sirenTimer = null;
let sirenAutoStopTimer = null;
let sirenStep = 0;

function unlockAudio() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) audioCtx = new AudioContextClass();
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
}

function playSirenTone(freqStart, freqEnd, durationSec, waveType = "sawtooth", volume = 0.22) {
  if (!audioCtx || isSirenMuted) return;
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});

  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = waveType;
  osc.frequency.setValueAtTime(freqStart, now);
  if (freqEnd !== freqStart) {
    osc.frequency.exponentialRampToValueAtTime(freqEnd, now + durationSec);
  }

  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(volume, now + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start(now);
  osc.stop(now + durationSec + 0.02);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
}

function triggerSirenPulse(level) {
  switch (level) {
    case "Asap":
      playSirenTone(520, 520, 0.24, "sine", 0.14);
      break;
    case "Kecil":
      playSirenTone(sirenStep % 2 === 0 ? 640 : 780, sirenStep % 2 === 0 ? 640 : 780, 0.28, "triangle", 0.18);
      break;
    case "Sedang":
      playSirenTone(sirenStep % 2 === 0 ? 740 : 980, sirenStep % 2 === 0 ? 760 : 960, 0.32, "sawtooth", 0.22);
      break;
    case "Besar":
      playSirenTone(780, 1360, 0.34, "sawtooth", 0.27);
      break;
    case "Sangat Besar":
      playSirenTone(sirenStep % 2 === 0 ? 960 : 1620, sirenStep % 2 === 0 ? 1580 : 940, 0.2, "sawtooth", 0.32);
      break;
  }
  sirenStep++;
}

function setSirenLevel(level, autoStopMs = 0) {
  if (sirenAutoStopTimer) {
    clearTimeout(sirenAutoStopTimer);
    sirenAutoStopTimer = null;
  }

  if (autoStopMs > 0) {
    sirenAutoStopTimer = setTimeout(() => {
      stopSiren();
    }, autoStopMs);
  }

  if (isSirenMuted || !isValidHazardLabel(level)) {
    stopSiren();
    return;
  }

  if (currentSirenLevel === level && sirenTimer) return;

  if (sirenTimer) {
    clearInterval(sirenTimer);
    sirenTimer = null;
  }

  currentSirenLevel = level;
  sirenStep = 0;
  unlockAudio();

  const intervals = {
    Asap: 1500,
    Kecil: 1050,
    Sedang: 650,
    Besar: 420,
    "Sangat Besar": 240,
  };

  const intervalMs = intervals[level] || 700;
  triggerSirenPulse(level);
  sirenTimer = setInterval(() => triggerSirenPulse(level), intervalMs);
}

function stopSiren() {
  if (sirenTimer) {
    clearInterval(sirenTimer);
    sirenTimer = null;
  }
  if (sirenAutoStopTimer) {
    clearTimeout(sirenAutoStopTimer);
    sirenAutoStopTimer = null;
  }
  currentSirenLevel = null;
}

if (sirenToggleBtn) {
  sirenToggleBtn.addEventListener("click", () => {
    unlockAudio();
    isSirenMuted = !isSirenMuted;

    if (isSirenMuted) {
      stopSiren();
      sirenIcon.setAttribute("data-lucide", "volume-x");
      sirenToggleBtn.classList.add("text-white/40");
      sirenToggleBtn.title = "Suara Sirine Dibisukan";
    } else {
      sirenIcon.setAttribute("data-lucide", "volume-2");
      sirenToggleBtn.classList.remove("text-white/40");
      sirenToggleBtn.title = "Suara Sirine Aktif";
    }
    lucide.createIcons();
  });
}

// === GLASSMORPHISM ALERT ===
function showGlassAlert(title, message = "", type = "warning", duration = 3800) {
  if (!glassAlertContainer) return;

  const palette = {
    warning: {
      icon: "alert-triangle",
      badgeBg: "bg-orange-500/20 border-orange-400/30 text-orange-300",
      border: "border-orange-400/25",
    },
    error: {
      icon: "circle-alert",
      badgeBg: "bg-red-500/20 border-red-400/30 text-red-300",
      border: "border-red-400/25",
    },
    success: {
      icon: "check-circle-2",
      badgeBg: "bg-emerald-500/20 border-emerald-400/30 text-emerald-300",
      border: "border-emerald-400/25",
    },
  };

  const style = palette[type] || palette.warning;
  const alertEl = document.createElement("div");
  alertEl.className = `pointer-events-auto rounded-2xl hud-card-solid ${style.border} px-4 py-3 flex items-start gap-3 glass-alert-enter`;

  alertEl.innerHTML = `
    <div class="w-8 h-8 rounded-xl border ${style.badgeBg} flex items-center justify-center shrink-0 mt-0.5">
      <i data-lucide="${style.icon}" class="w-4 h-4"></i>
    </div>
    <div class="flex-1 min-w-0">
      <p class="text-xs font-semibold text-white leading-snug">${title}</p>
      ${message ? `<p class="text-[11px] text-white/65 mt-0.5 leading-relaxed">${message}</p>` : ""}
    </div>
    <button class="glass-alert-close p-1 rounded-lg text-white/45 hover:text-white transition shrink-0">
      <i data-lucide="x" class="w-3.5 h-3.5"></i>
    </button>
  `;

  while (glassAlertContainer.children.length >= 2) {
    glassAlertContainer.removeChild(glassAlertContainer.firstChild);
  }

  glassAlertContainer.appendChild(alertEl);
  lucide.createIcons();

  const dismiss = () => {
    if (!alertEl.parentNode) return;
    alertEl.classList.remove("glass-alert-enter");
    alertEl.classList.add("glass-alert-exit");
    setTimeout(() => {
      if (alertEl.parentNode) alertEl.parentNode.removeChild(alertEl);
    }, 240);
  };

  alertEl.querySelector(".glass-alert-close").addEventListener("click", dismiss);
  if (duration > 0) setTimeout(dismiss, duration);
}

// === JAM & VALIDASI LABEL ===
function updateClock() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  digitalClock.textContent = `${hh}:${mm}:${ss}`;
}
updateClock();
setInterval(updateClock, 1000);

function simplifySeverityLabel(rawLabel) {
  if (!rawLabel) return "Aman";
  const s = rawLabel.toLowerCase().trim();
  if (s.includes("gelap") || s.includes("tertutup") || s === "dark") return "Gelap";
  if (s.includes("asap") || s === "smoke") return "Asap";
  if (s.includes("sangat besar")) return "Sangat Besar";
  if (s.includes("besar")) return "Besar";
  if (s.includes("sedang")) return "Sedang";
  if (s.includes("kecil")) return "Kecil";
  return "Aman";
}

function isValidHazardLabel(label) {
  const clean = simplifySeverityLabel(label).toLowerCase();
  return ["asap", "kecil", "sedang", "besar", "sangat besar"].includes(clean);
}

function isHazardResult(data) {
  if (!data) return false;
  if (data.status_type === "dark" || data.status_type === "safe") return false;
  const label = simplifySeverityLabel(data.severity);
  return (data.status_type === "fire" || data.status_type === "smoke") && isValidHazardLabel(label);
}

// === NAVIGASI & RESPONSIVE UI ===
function updateNavbarBlur() {
  if (!topNavbar) return;
  const shouldBlur = window.innerWidth < 1024 && (window.scrollY > 12 || currentViewName !== "dashboard");
  topNavbar.classList.toggle("navbar-scrolled", shouldBlur);
}

function handleMobileScrollMorph() {
  updateNavbarBlur();
  if (window.innerWidth >= 1024 || currentViewName !== "dashboard") return;

  const shouldExpand = window.scrollY > 36;
  if (shouldExpand === isMobileCardExpanded) return;
  isMobileCardExpanded = shouldExpand;

  if (shouldExpand) {
    mobileCompactOverview.classList.add("hidden");
    fullStatusBody.classList.add("open");
  } else {
    fullStatusBody.classList.remove("open");
    mobileCompactOverview.classList.remove("hidden");
  }
}

window.addEventListener("scroll", handleMobileScrollMorph, { passive: true });
window.addEventListener("resize", () => {
  updateNavbarBlur();
  updateNavGliders();
  drawRealtimeChart();
});

function updateNavGliders() {
  navPillGroups.forEach((group) => {
    if (group.offsetParent === null) return;
    const glider = group.querySelector(".nav-glider");
    const activeBtn = group.querySelector(".nav-pill-btn.active");
    if (glider && activeBtn) {
      glider.style.width = `${activeBtn.offsetWidth}px`;
      glider.style.transform = `translateX(${activeBtn.offsetLeft}px)`;
    }
  });
}

function syncBackdropVisibility() {
  const showLiveFeed = currentViewName === "dashboard" && isStreaming;

  webcamVideo.classList.toggle("hidden", !showLiveFeed);
  overlayCanvas.classList.toggle("hidden", !showLiveFeed);
  centerReticle.classList.toggle("hidden", !showLiveFeed);
  floatingTelemetry.classList.toggle("hidden", !showLiveFeed);

  ambientIdleBg.classList.toggle("opacity-0", showLiveFeed);
  idleCenterHint.classList.toggle("hidden", currentViewName !== "dashboard" || isStreaming);
}

function switchView(target) {
  const isChanging = currentViewName !== target;
  currentViewName = target;

  Object.keys(views).forEach((key) => {
    const el = views[key];
    if (key === target) {
      el.classList.remove("hidden");
      el.classList.add("flex");
      if (isChanging) {
        el.classList.remove("view-animate-enter");
        void el.offsetWidth;
        el.classList.add("view-animate-enter");
      }
    } else {
      el.classList.remove("flex");
      el.classList.add("hidden");
    }
  });

  navPillBtns.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.target === target);
  });

  if (target === "dashboard") {
    mainContainer.classList.remove("pt-16", "sm:pt-20");
    mainContainer.classList.add("pt-0", "lg:pt-20");
    mobileSecondaryNav.classList.add("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  } else {
    mainContainer.classList.remove("pt-0");
    mainContainer.classList.add("pt-16", "sm:pt-20");
    mobileSecondaryNav.classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  syncBackdropVisibility();
  updateNavbarBlur();
  requestAnimationFrame(updateNavGliders);

  if (target === "dashboard") {
    setTimeout(() => {
      drawRealtimeChart();
      if (miniMapInstance) miniMapInstance.invalidateSize();
    }, 80);
  } else if (target === "history") {
    renderFullHistory();
  }
}

navPillBtns.forEach((btn) => btn.addEventListener("click", () => switchView(btn.dataset.target)));
navJumps.forEach((btn) => btn.addEventListener("click", () => switchView(btn.dataset.target)));
setTimeout(updateNavGliders, 50);

// === KONEKSI GOOGLE COLAB ===
connPopoverBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  cameraDropdown.classList.add("hidden");
  connPopover.classList.toggle("hidden");
});

closeConnPopover.addEventListener("click", () => connPopover.classList.add("hidden"));

document.addEventListener("click", (e) => {
  if (!connPopover.contains(e.target) && !connPopoverBtn.contains(e.target)) {
    connPopover.classList.add("hidden");
  }
  if (!cameraDropdown.contains(e.target) && !switchCamBtn.contains(e.target)) {
    cameraDropdown.classList.add("hidden");
  }
});

async function checkConnection(notifyOnSuccess = false) {
  if (!apiBaseUrl) {
    isServerOnline = false;
    return false;
  }

  connDot.className = "w-2 h-2 rounded-full bg-orange-400 animate-ping";
  connLabel.textContent = "Cek...";
  connDetailText.textContent = "Menghubungi Colab...";

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${apiBaseUrl}/health`, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      isServerOnline = true;
      connDot.className = "w-2 h-2 rounded-full bg-emerald-400";
      connLabel.textContent = "Online";
      connDetailText.textContent = "Terhubung ke Colab";
      if (notifyOnSuccess) {
        showGlassAlert("Terhubung ke Google Colab", "Siap digunakan untuk deteksi.", "success", 3000);
      }
      return true;
    } else {
      throw new Error();
    }
  } catch {
    isServerOnline = false;
    connDot.className = "w-2 h-2 rounded-full bg-red-400";
    connLabel.textContent = "Offline";
    connDetailText.textContent = "Gagal terhubung ke Colab";
    return false;
  }
}

saveConnectBtn.addEventListener("click", async () => {
  const cleaned = apiUrlInput.value.trim().replace(/\/$/, "");
  if (!cleaned) {
    showGlassAlert("URL masih kosong", "Masukkan link dari Google Colab terlebih dahulu.", "warning");
    return;
  }
  apiBaseUrl = cleaned;
  localStorage.setItem(STORAGE_URL_KEY, apiBaseUrl);
  connPopover.classList.add("hidden");

  const connected = await checkConnection(true);
  if (!connected) {
    showGlassAlert("Gagal terhubung ke Google Colab", "Pastikan sel di Colab sedang berjalan dan URL sesuai.", "error");
  }
});

if (apiBaseUrl) {
  apiUrlInput.value = apiBaseUrl;
  checkConnection(false);
}

// === KAMERA & DETEKSI REALTIME ===
async function refreshCameraDevices(activeId = null) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    availableVideoDevices = devices.filter((d) => d.kind === "videoinput");

    if (availableVideoDevices.length === 0) {
      cameraDeviceList.innerHTML = `<p class="px-2.5 py-1.5 text-xs text-white/50">Kamera tidak ditemukan</p>`;
      return;
    }

    if (activeId) selectedDeviceId = activeId;
    if (!selectedDeviceId && availableVideoDevices[0]) {
      selectedDeviceId = availableVideoDevices[0].deviceId;
    }

    cameraDeviceList.innerHTML = availableVideoDevices
      .map((dev, idx) => {
        const isCurrent = dev.deviceId === selectedDeviceId;
        const label = dev.label || `Kamera ${idx + 1}`;
        return `
          <button
            data-device-id="${dev.deviceId}"
            class="cam-device-option w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between gap-2 transition ${
              isCurrent ? "bg-white text-zinc-950 font-semibold" : "text-white/80 hover:bg-white/10"
            }"
          >
            <span class="truncate">${label}</span>
            ${isCurrent ? `<span class="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0"></span>` : ""}
          </button>
        `;
      })
      .join("");

    document.querySelectorAll(".cam-device-option").forEach((btn) => {
      btn.onclick = () => {
        selectedDeviceId = btn.dataset.deviceId;
        cameraDropdown.classList.add("hidden");
        if (isStreaming) {
          startCamera();
        } else {
          refreshCameraDevices(selectedDeviceId);
        }
      };
    });
  } catch (err) {
    console.error(err);
  }
}

refreshCameraDevices();

switchCamBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  connPopover.classList.add("hidden");
  refreshCameraDevices(selectedDeviceId);
  cameraDropdown.classList.toggle("hidden");
});

function releaseTracks() {
  isStreaming = false;
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
  webcamVideo.srcObject = null;
}

async function startCamera() {
  unlockAudio();
  connPopover.classList.add("hidden");
  cameraDropdown.classList.add("hidden");

  if (!apiBaseUrl) {
    showGlassAlert(
      "Belum terhubung ke Google Colab",
      "Masukkan link Google Colab terlebih dahulu.",
      "warning"
    );
    return;
  }

  if (!isServerOnline) {
    const reconnected = await checkConnection(false);
    if (!reconnected) {
      showGlassAlert(
        "Belum terhubung ke Google Colab",
        "Status server Offline. Periksa kembali link Colab di pojok kanan atas.",
        "warning"
      );
      return;
    }
  }

  releaseTracks();
  await new Promise((r) => setTimeout(r, 200));

  const constraints = selectedDeviceId
    ? { deviceId: { exact: selectedDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
    : { width: { ideal: 1280 }, height: { ideal: 720 } };

  try {
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ video: constraints, audio: false });
    } catch {
      mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }

    webcamVideo.srcObject = mediaStream;
    await webcamVideo.play();

    const track = mediaStream.getVideoTracks()[0];
    const actualId = track ? track.getSettings().deviceId : null;
    await refreshCameraDevices(actualId);

    isStreaming = true;
    syncBackdropVisibility();

    toggleCamBtn.className = "h-8 sm:h-9 px-3 sm:px-4 rounded-full bg-zinc-950/90 border border-white/20 hover:bg-zinc-900 text-white text-xs font-semibold flex items-center gap-1.5 sm:gap-2 shadow-lg transition";
    toggleCamIcon.className = "w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-sm bg-white";
    toggleCamText.textContent = "Stop";

    setTimeout(runRealtimeLoop, 400);
  } catch (err) {
    showGlassAlert("Gagal mengakses kamera", err.message || "Pastikan izin kamera di browser sudah diaktifkan.", "error");
  }
}

function stopCamera() {
  releaseTracks();
  stopSiren();

  const ctx = overlayCanvas.getContext("2d");
  ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

  syncBackdropVisibility();
  hazardToast.classList.add("hidden");

  toggleCamBtn.className = "h-8 sm:h-9 px-3 sm:px-4 rounded-full bg-white hover:bg-zinc-200 text-zinc-950 text-xs font-semibold flex items-center gap-1.5 sm:gap-2 shadow-lg transition";
  toggleCamIcon.className = "w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-orange-500";
  toggleCamText.textContent = "Mulai";

  statStatusText.textContent = "Aman";
  statStatusText.className = "text-2xl xl:text-3xl font-semibold tracking-tight text-white";
  statTrendTag.textContent = "Standby";
  statFireText.textContent = "0.0%";
  statSmokeText.textContent = "0.0%";

  compactStatusDot.className = "w-2 h-2 rounded-full bg-white/60 shrink-0";
  compactStatusText.textContent = "Aman";
  compactStatusText.className = "text-lg font-semibold tracking-tight text-white truncate";
  compactTrendTag.textContent = "• Standby";
  compactSubSummary.textContent = "Api 0.0% • Asap 0.0%";
}

toggleCamBtn.addEventListener("click", () => {
  if (isStreaming) {
    stopCamera();
  } else {
    startCamera();
  }
});

function getObjectCoverRect(containerW, containerH, mediaW, mediaH) {
  const mediaRatio = mediaW / mediaH;
  const containerRatio = containerW / containerH;
  let drawW, drawH, offsetX, offsetY;

  if (mediaRatio > containerRatio) {
    drawH = containerH;
    drawW = containerH * mediaRatio;
    offsetX = (containerW - drawW) / 2;
    offsetY = 0;
  } else {
    drawW = containerW;
    drawH = containerW / mediaRatio;
    offsetX = 0;
    offsetY = (containerH - drawH) / 2;
  }

  return { drawW, drawH, offsetX, offsetY };
}

function drawDetectionsProjected(ctx, rect, data, mirror = false) {
  const { drawW, drawH, offsetX, offsetY } = rect;
  const cleanLabel = simplifySeverityLabel(data.severity);

  if (data.smoke_boxes && data.smoke_boxes.length > 0) {
    data.smoke_boxes.forEach((box) => {
      const normX = mirror ? 1 - box.x - box.w : box.x;
      const x = offsetX + normX * drawW;
      const y = offsetY + box.y * drawH;
      const bw = box.w * drawW;
      const bh = box.h * drawH;

      ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(x, y, bw, bh);
      ctx.setLineDash([]);

      ctx.fillStyle = "rgba(15, 15, 20, 0.78)";
      ctx.fillRect(x, Math.max(0, y - 22), 54, 22);
      ctx.fillStyle = "#ffffff";
      ctx.font = "600 11px 'Plus Jakarta Sans', sans-serif";
      ctx.fillText("Asap", x + 10, Math.max(15, y - 7));
    });
  }

  if (data.fire_boxes && data.fire_boxes.length > 0) {
    data.fire_boxes.forEach((box) => {
      const normX = mirror ? 1 - box.x - box.w : box.x;
      const x = offsetX + normX * drawW;
      const y = offsetY + box.y * drawH;
      const bw = box.w * drawW;
      const bh = box.h * drawH;

      ctx.strokeStyle = "#f97316";
      ctx.lineWidth = 2.5;
      ctx.strokeRect(x, y, bw, bh);

      const tagText = `Api • ${cleanLabel}`;
      ctx.font = "600 11px 'Plus Jakarta Sans', sans-serif";
      const tagW = ctx.measureText(tagText).width + 18;
      ctx.fillStyle = "rgba(249, 115, 22, 0.92)";
      ctx.fillRect(x, Math.max(0, y - 22), tagW, 22);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(tagText, x + 8, Math.max(15, y - 7));
    });
  }

  if (data.hotspot) {
    const normHx = mirror ? 1 - data.hotspot.x : data.hotspot.x;
    const cx = offsetX + normHx * drawW;
    const cy = offsetY + data.hotspot.y * drawH;

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 13, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = "#fb923c";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 22, cy);
    ctx.lineTo(cx + 22, cy);
    ctx.moveTo(cx, cy - 22);
    ctx.lineTo(cx, cy + 22);
    ctx.stroke();

    ctx.fillStyle = "#f97316";
    ctx.beginPath();
    ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

async function runRealtimeLoop() {
  if (!isStreaming) return;
  if (isRequestInFlight || webcamVideo.readyState < 2) {
    setTimeout(runRealtimeLoop, 100);
    return;
  }

  isRequestInFlight = true;
  const vw = webcamVideo.videoWidth || 640;
  const vh = webcamVideo.videoHeight || 480;

  const scale = 384 / vw;
  captureCanvas.width = 384;
  captureCanvas.height = Math.round(vh * scale);
  captureCanvas.getContext("2d").drawImage(webcamVideo, 0, 0, captureCanvas.width, captureCanvas.height);

  const frameBase64 = captureCanvas.toDataURL("image/jpeg", 0.65);

  try {
    const res = await fetch(`${apiBaseUrl}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: frameBase64, manual: false }),
    });

    if (res.ok && isStreaming) {
      const data = await res.json();

      overlayCanvas.width = window.innerWidth;
      overlayCanvas.height = window.innerHeight;
      const oCtx = overlayCanvas.getContext("2d");
      oCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

      if (isHazardResult(data) && currentViewName === "dashboard") {
        const rect = getObjectCoverRect(overlayCanvas.width, overlayCanvas.height, vw, vh);
        drawDetectionsProjected(oCtx, rect, data, true);
      }

      updateDashboardTelemetry(data);

      const now = Date.now();
      if (isHazardResult(data) && now - lastRealtimeLogTime > 4000) {
        lastRealtimeLogTime = now;
        const snapshot = createSnapshotFromSource(webcamVideo, vw, vh, data, true);
        addHistoryItem(data, snapshot, "Kamera");
      }
    }
  } catch (err) {
    console.error(err);
  } finally {
    isRequestInFlight = false;
  }

  if (isStreaming) setTimeout(runRealtimeLoop, 120);
}

function updateDashboardTelemetry(data) {
  const label = simplifySeverityLabel(data.severity);
  const fireVal = Number(data.fire_area_percent || 0);
  const smokeVal = Number(data.smoke_area_percent || 0);
  const isFireLabel = ["Kecil", "Sedang", "Besar", "Sangat Besar"].includes(label);
  const displayStatus = isFireLabel ? `Api ${label}` : label;

  statStatusText.textContent = label;
  statFireText.textContent = `${fireVal.toFixed(1)}%`;
  statSmokeText.textContent = `${smokeVal.toFixed(1)}%`;
  statTrendTag.textContent = data.status_type === "dark" ? "Lensa Tertutup" : `${data.confidence}%`;

  compactStatusText.textContent = displayStatus;
  compactTrendTag.textContent = data.status_type === "dark" ? "• Gelap" : `• ${data.confidence}%`;
  compactSubSummary.textContent = `Api ${fireVal.toFixed(1)}% • Asap ${smokeVal.toFixed(1)}%`;

  hudConfText.textContent = data.status_type === "dark" ? "-" : `${data.confidence}%`;
  hudHotspotText.textContent = data.hotspot ? `${data.hotspot.px_x}, ${data.hotspot.px_y}` : "-";

  if (isHazardResult(data)) {
    statStatusText.className = "text-2xl xl:text-3xl font-semibold tracking-tight text-orange-400";
    compactStatusText.className = "text-lg font-semibold tracking-tight text-orange-400 truncate";
    compactStatusDot.className = "w-2 h-2 rounded-full bg-orange-400 animate-ping shrink-0";

    setSirenLevel(label);

    if (currentViewName === "dashboard") {
      hazardToast.classList.remove("hidden");
      toastText.textContent = label === "Asap" ? "Peringatan: Asap" : `Peringatan: Api ${label}`;
      toastSub.textContent = label === "Asap" ? `${smokeVal.toFixed(1)}%` : `${fireVal.toFixed(1)}%`;
    } else {
      hazardToast.classList.add("hidden");
    }
  } else {
    statStatusText.className = "text-2xl xl:text-3xl font-semibold tracking-tight text-white";
    compactStatusText.className = "text-lg font-semibold tracking-tight text-white truncate";
    compactStatusDot.className = "w-2 h-2 rounded-full bg-white/60 shrink-0";
    hazardToast.classList.add("hidden");
    stopSiren();
  }

  pushChartData(fireVal, smokeVal, label);
}

// === GRAFIK REALTIME ===
function pushChartData(fireVal, smokeVal, label) {
  fireSeries.push(fireVal);
  smokeSeries.push(smokeVal);
  if (fireSeries.length > MAX_CHART_POINTS) fireSeries.shift();
  if (smokeSeries.length > MAX_CHART_POINTS) smokeSeries.shift();

  const peak = Math.max(fireVal, smokeVal);
  chartLatestVal.textContent = `${peak.toFixed(1)}%`;
  chartSummaryText.textContent = label === "Aman" || label === "Gelap" ? "Kondisi normal stabil" : `Terdeteksi ${label}`;

  drawRealtimeChart();
}

function drawRealtimeChart() {
  const canvas = realtimeChartCanvas;
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const padTop = 14;
  const padBottom = 8;
  const plotH = h - padTop - padBottom;

  ctx.clearRect(0, 0, w, h);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 1;
  [0.25, 0.5, 0.75].forEach((ratio) => {
    const y = padTop + plotH * ratio;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  });

  const maxScale = Math.max(25, ...fireSeries, ...smokeSeries);
  const stepX = w / (MAX_CHART_POINTS - 1);

  const getPoints = (series) =>
    series.map((val, i) => ({
      x: i * stepX,
      y: padTop + plotH - (Math.min(val, maxScale) / maxScale) * plotH,
    }));

  const smokePts = getPoints(smokeSeries);
  ctx.beginPath();
  ctx.moveTo(smokePts[0].x, h - padBottom);
  smokePts.forEach((p) => ctx.lineTo(p.x, p.y));
  ctx.lineTo(smokePts[smokePts.length - 1].x, h - padBottom);
  ctx.closePath();
  const smokeGrad = ctx.createLinearGradient(0, padTop, 0, h);
  smokeGrad.addColorStop(0, "rgba(255, 255, 255, 0.16)");
  smokeGrad.addColorStop(1, "rgba(255, 255, 255, 0.0)");
  ctx.fillStyle = smokeGrad;
  ctx.fill();

  ctx.beginPath();
  smokePts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.strokeStyle = "rgba(255, 255, 255, 0.65)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const firePts = getPoints(fireSeries);
  ctx.beginPath();
  ctx.moveTo(firePts[0].x, h - padBottom);
  firePts.forEach((p) => ctx.lineTo(p.x, p.y));
  ctx.lineTo(firePts[firePts.length - 1].x, h - padBottom);
  ctx.closePath();
  const fireGrad = ctx.createLinearGradient(0, padTop, 0, h);
  fireGrad.addColorStop(0, "rgba(249, 115, 22, 0.35)");
  fireGrad.addColorStop(1, "rgba(249, 115, 22, 0.0)");
  ctx.fillStyle = fireGrad;
  ctx.fill();

  ctx.beginPath();
  firePts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.strokeStyle = "#fb923c";
  ctx.lineWidth = 2;
  ctx.stroke();

  const lastFire = firePts[firePts.length - 1];
  ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(lastFire.x, padTop);
  ctx.lineTo(lastFire.x, h - padBottom);
  ctx.stroke();

  ctx.fillStyle = "#f97316";
  ctx.beginPath();
  ctx.arc(lastFire.x, lastFire.y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

setTimeout(drawRealtimeChart, 100);

// === MAPS LOKASI ===
let miniMapInstance = null;
let locationMarker = null;

function initMiniMap(lat = -6.0174, lon = 106.0538) {
  if (!window.L) return;

  if (!miniMapInstance) {
    miniMapInstance = L.map("miniMap", { zoomControl: false, attributionControl: false }).setView([lat, lon], 14);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(miniMapInstance);

    const pulseIcon = L.divIcon({
      className: "",
      html: `<div style="width:14px;height:14px;border-radius:9999px;background:#f97316;border:2px solid #fff;box-shadow:0 0 14px #f97316;"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });

    locationMarker = L.marker([lat, lon], { icon: pulseIcon }).addTo(miniMapInstance);

    const mapEl = document.getElementById("miniMap");
    if (mapEl && window.ResizeObserver) {
      new ResizeObserver(() => {
        if (miniMapInstance) miniMapInstance.invalidateSize();
      }).observe(mapEl);
    }

    setTimeout(() => miniMapInstance.invalidateSize(), 200);
  } else {
    miniMapInstance.setView([lat, lon], 15);
    if (locationMarker) locationMarker.setLatLng([lat, lon]);
    miniMapInstance.invalidateSize();
  }
}

function detectCurrentLocation() {
  initMiniMap();
  if (!navigator.geolocation) {
    locationNameText.textContent = "GPS tidak didukung";
    return;
  }

  locationNameText.textContent = "Mencari koordinat...";
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      initMiniMap(lat, lon);
      coordLatLon.textContent = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;

      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
        const geo = await res.json();
        const city = geo.address.city || geo.address.town || geo.address.county || geo.address.suburb || "Lokasi Terkunci";
        locationNameText.textContent = city;
      } catch {
        locationNameText.textContent = "Lokasi GPS Terkunci";
      }
    },
    () => {
      locationNameText.textContent = "Izin lokasi dinonaktifkan";
      coordLatLon.textContent = "Default View";
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

refreshLocBtn.addEventListener("click", detectCurrentLocation);
detectCurrentLocation();

// === UPLOAD MANUAL & MODAL ===
function createSnapshotFromSource(sourceEl, width, height, data, mirror = false) {
  const temp = document.createElement("canvas");
  temp.width = width;
  temp.height = height;
  const ctx = temp.getContext("2d");

  if (mirror) {
    ctx.save();
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(sourceEl, 0, 0, width, height);
    ctx.restore();
  } else {
    ctx.drawImage(sourceEl, 0, 0, width, height);
  }

  drawDetectionsProjected(ctx, { drawW: width, drawH: height, offsetX: 0, offsetY: 0 }, data, mirror);

  const label = simplifySeverityLabel(data.severity);
  ctx.fillStyle = "rgba(12, 12, 16, 0.84)";
  ctx.fillRect(0, 0, width, 34);
  ctx.fillStyle = "#ffffff";
  ctx.font = "600 13px 'Plus Jakarta Sans', sans-serif";
  ctx.fillText(`Status: ${label}  |  Api: ${data.fire_area_percent}%  |  Asap: ${data.smoke_area_percent}%`, 12, 22);

  return temp.toDataURL("image/jpeg", 0.88);
}

manualFileInput.addEventListener("click", unlockAudio);

manualFileInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  unlockAudio();
  connPopover.classList.add("hidden");
  cameraDropdown.classList.add("hidden");

  if (!apiBaseUrl || !isServerOnline) {
    const connected = apiBaseUrl ? await checkConnection(false) : false;
    if (!connected) {
      showGlassAlert(
        "Belum terhubung ke Google Colab",
        "Hubungkan ke Google Colab terlebih dahulu.",
        "warning"
      );
      manualFileInput.value = "";
      return;
    }
  }

  const reader = new FileReader();
  reader.onload = async (ev) => {
    const base64Img = ev.target.result;
    uploadLoadingOverlay.classList.remove("hidden");

    try {
      const res = await fetch(`${apiBaseUrl}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64Img, manual: true }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menganalisis gambar");

      const imgObj = new Image();
      imgObj.onload = () => {
        const annotated = createSnapshotFromSource(imgObj, imgObj.width, imgObj.height, data, false);

        if (isHazardResult(data)) {
          addHistoryItem(data, annotated, "Upload");
          setSirenLevel(simplifySeverityLabel(data.severity), 3000);
        }

        openResultModal(data, annotated);
        uploadLoadingOverlay.classList.add("hidden");
        manualFileInput.value = "";
      };
      imgObj.src = base64Img;
    } catch (err) {
      uploadLoadingOverlay.classList.add("hidden");
      manualFileInput.value = "";
      showGlassAlert("Gagal memproses foto", err.message || "Terjadi kesalahan pada server.", "error");
    }
  };
  reader.readAsDataURL(file);
});

function openResultModal(data, annotatedImg) {
  currentModalImage = annotatedImg;
  modalAnnotatedImg.src = annotatedImg;
  modalSeverityText.textContent = simplifySeverityLabel(data.severity);
  modalArea.textContent = `${data.fire_area_percent}%`;
  modalSmokeArea.textContent = `${data.smoke_area_percent}%`;
  modalCoords.textContent = data.hotspot ? `${data.hotspot.px_x}, ${data.hotspot.px_y}` : "-";
  resultModal.classList.remove("hidden");
}

function closeResultModal() {
  resultModal.classList.add("hidden");
  if (!isStreaming) stopSiren();
}

closeModalBtn.addEventListener("click", closeResultModal);
closeModalFooterBtn.addEventListener("click", closeResultModal);
resultModal.addEventListener("click", (e) => {
  if (e.target === resultModal) closeResultModal();
});

modalDownloadBtn.addEventListener("click", () => {
  if (currentModalImage) downloadImage(currentModalImage, `fire-detector-${Date.now()}.jpg`);
});

function downloadImage(dataUrl, filename) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// === HISTORI ===
function addHistoryItem(data, annotatedSnapshot, sourceLabel) {
  if (!isHazardResult(data)) return;

  const label = simplifySeverityLabel(data.severity);
  const now = new Date();
  const timeStr = now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateStr = now.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });

  const item = {
    id: Date.now(),
    severity: label,
    fire_area_percent: data.fire_area_percent,
    smoke_area_percent: data.smoke_area_percent,
    hotspot: data.hotspot,
    annotated_image: annotatedSnapshot,
    source: sourceLabel,
    timestamp: `${dateStr}, ${timeStr}`,
  };

  detectionHistory.unshift(item);
  if (detectionHistory.length > MAX_HISTORY_ITEMS) {
    detectionHistory = detectionHistory.slice(0, MAX_HISTORY_ITEMS);
  }

  try {
    localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(detectionHistory));
  } catch {
    detectionHistory = detectionHistory.slice(0, 10);
    localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(detectionHistory));
  }

  renderRecentHistory();
  renderFullHistory();
}

function renderRecentHistory() {
  navHistoryCounts.forEach((el) => (el.textContent = detectionHistory.length));
  cardHistoryBadge.textContent = detectionHistory.length;
  if (fullHistoryCountBadge) fullHistoryCountBadge.textContent = detectionHistory.length;
  requestAnimationFrame(updateNavGliders);

  if (detectionHistory.length === 0) {
    recentHistoryList.innerHTML = `
      <div class="h-full flex flex-col items-center justify-center text-center py-6 px-3">
        <p class="text-xs text-white/50">Belum ada catatan deteksi</p>
        <p class="text-[11px] text-white/30 mt-1">Asap &amp; api otomatis tersimpan di sini</p>
      </div>
    `;
    return;
  }

  recentHistoryList.innerHTML = detectionHistory
    .map(
      (item) => `
      <div class="flex items-center justify-between gap-2.5 p-2 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 transition">
        <div class="flex items-center gap-2.5 min-w-0">
          <img
            src="${item.annotated_image}"
            data-id="${item.id}"
            alt="Thumb"
            class="history-preview-trigger w-10 h-10 rounded-xl object-cover bg-black border border-white/10 cursor-pointer shrink-0"
          />
          <div class="min-w-0">
            <div class="flex items-center gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full ${item.severity === "Asap" ? "bg-white" : "bg-orange-400"}"></span>
              <p class="text-xs font-medium text-white truncate">${item.severity} <span class="text-[10px] text-white/40">• ${item.source}</span></p>
            </div>
            <p class="text-[10px] text-white/45 font-mono-num truncate mt-0.5">${item.timestamp}</p>
          </div>
        </div>

        <button
          data-id="${item.id}"
          title="Unduh Foto"
          class="history-download-btn w-8 h-8 rounded-xl bg-white/5 hover:bg-white hover:text-zinc-950 text-white/75 flex items-center justify-center transition shrink-0"
        >
          <i data-lucide="download" class="w-3.5 h-3.5"></i>
        </button>
      </div>
    `
    )
    .join("");

  attachHistoryEvents();
  lucide.createIcons();
}

function renderFullHistory() {
  const filterVal = severityFilter.value.toLowerCase();
  const filtered =
    filterVal === "all"
      ? detectionHistory
      : detectionHistory.filter((item) => item.severity.toLowerCase() === filterVal);

  if (fullHistoryCountBadge) fullHistoryCountBadge.textContent = filtered.length;

  if (filtered.length === 0) {
    fullHistoryGrid.innerHTML = `
      <div class="col-span-full py-16 text-center">
        <p class="text-sm text-white/55">Belum ada data histori untuk kategori ini.</p>
      </div>
    `;
    return;
  }

  fullHistoryGrid.innerHTML = filtered
    .map(
      (item) => `
      <div class="rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 overflow-hidden flex flex-col transition">
        <div class="relative aspect-video bg-black/85">
          <img
            src="${item.annotated_image}"
            data-id="${item.id}"
            class="history-preview-trigger w-full h-full object-contain cursor-pointer"
            alt="Hasil Deteksi"
          />
          <span class="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-black/70 backdrop-blur-md border border-white/15 text-white flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full ${item.severity === "Asap" ? "bg-white" : "bg-orange-400"}"></span>
            ${item.severity}
          </span>
        </div>

        <div class="p-3.5 flex items-center justify-between gap-3">
          <div class="min-w-0">
            <p class="text-xs font-medium text-white truncate">Api ${item.fire_area_percent}% • Asap ${item.smoke_area_percent}%</p>
            <p class="text-[11px] text-white/45 font-mono-num truncate mt-0.5">${item.timestamp} (${item.source})</p>
          </div>

          <button
            data-id="${item.id}"
            class="history-download-btn px-3 py-1.5 rounded-full bg-white/10 hover:bg-white text-white hover:text-zinc-950 border border-white/15 text-xs font-medium transition flex items-center gap-1.5 shrink-0"
          >
            <i data-lucide="download" class="w-3.5 h-3.5"></i>
            <span>Unduh</span>
          </button>
        </div>
      </div>
    `
    )
    .join("");

  attachHistoryEvents();
  lucide.createIcons();
}

function attachHistoryEvents() {
  document.querySelectorAll(".history-download-btn").forEach((btn) => {
    btn.onclick = () => {
      const item = detectionHistory.find((x) => x.id === Number(btn.dataset.id));
      if (item) {
        downloadImage(item.annotated_image, `fire-detector-${item.severity.toLowerCase().replace(/\s+/g, "-")}-${item.id}.jpg`);
      }
    };
  });

  document.querySelectorAll(".history-preview-trigger").forEach((img) => {
    img.onclick = () => {
      const item = detectionHistory.find((x) => x.id === Number(img.dataset.id));
      if (item) openResultModal(item, item.annotated_image);
    };
  });
}

severityFilter.addEventListener("change", renderFullHistory);

clearHistoryBtn.addEventListener("click", () => {
  if (detectionHistory.length === 0) {
    showGlassAlert("Riwayat masih kosong", "Tidak ada data deteksi yang perlu dihapus.", "warning");
    return;
  }
  glassConfirmModal.classList.remove("hidden");
});

confirmCancelBtn.addEventListener("click", () => {
  glassConfirmModal.classList.add("hidden");
});

glassConfirmModal.addEventListener("click", (e) => {
  if (e.target === glassConfirmModal) glassConfirmModal.classList.add("hidden");
});

confirmAcceptBtn.addEventListener("click", () => {
  detectionHistory = [];
  localStorage.removeItem(STORAGE_HISTORY_KEY);
  renderRecentHistory();
  renderFullHistory();
  glassConfirmModal.classList.add("hidden");
  showGlassAlert("Riwayat dihapus", "Semua data deteksi berhasil dihapus.", "success");
});

renderRecentHistory();
renderFullHistory();