
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Clock3,
  Gauge,
  LocateFixed,
  MapPin,
  Navigation,
  Route,
  ShieldCheck,
  Smartphone,
  Timer,
  Wallet,
  X,
} from "lucide-react";
import "leaflet/dist/leaflet.css";
import "./style.css";

/* ---------------- CONFIGURATION ---------------- */

const CONFIG = {
  city: "Mumbai Metropolitan Region",

  // Illustrative fare inputs. Verify the current official tariff.
  minimumFare: 27,
  minimumKm: 1.5,
  perKm: 18.22,
  waitingPerMinute: 1.822,
  nightMultiplier: 1.25,

  maxAccuracy: 35,
  maxSpeedKmh: 120,
  maxJumpMetres: 300,
  minDistanceIncrement: 5,
  waitingSpeedKmh: 6,
};

/* ---------------- HELPERS ---------------- */

const formatMoney = (amount) =>
  `₹${Math.max(0, amount).toFixed(2)}`;

const formatDistance = (km) =>
  `${km.toFixed(2)} km`;

const formatDuration = (seconds) => {
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

const getDistanceMetres = (a, b) => {
  const toRad = (value) => (value * Math.PI) / 180;
  const earthRadius = 6371000;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(dLng / 2) ** 2;

  return 2 * earthRadius * Math.asin(Math.sqrt(h));
};

const isNightTime = (date) => {
  const hour = date.getHours();
  return hour >= 0 && hour < 5;
};

const calculateFare = (distanceKm, waitingSeconds, startTime) => {
  const distanceFare =
    CONFIG.minimumFare +
    Math.max(0, distanceKm - CONFIG.minimumKm) * CONFIG.perKm;

  const waitingFare =
    (waitingSeconds / 60) * CONFIG.waitingPerMinute;

  const night =
    startTime && isNightTime(startTime);

  const subtotal = distanceFare + waitingFare;
  const total = night
    ? subtotal * CONFIG.nightMultiplier
    : subtotal;

  return {
    distanceFare,
    waitingFare,
    nightSurcharge: night ? total - subtotal : 0,
    total,
  };
};

/* ---------------- MAP MARKERS ---------------- */

const createMapIcon = (type) => {
  const labels = {
    start: "S",
    destination: "D",
    current: "",
  };

  return L.divIcon({
    className: "custom-marker-wrapper",
    html: `
      <div class="map-marker marker-${type}">
        ${type === "current"
          ? '<span class="current-marker-core"></span>'
          : `<span class="marker-letter">${labels[type]}</span>`
        }
      </div>
    `,
    iconSize: type === "current" ? [24, 24] : [34, 42],
    iconAnchor: type === "current" ? [12, 12] : [17, 40],
  });
};

const startIcon = createMapIcon("start");
const destinationIcon = createMapIcon("destination");
const currentIcon = createMapIcon("current");

/* ---------------- MAP CONTROLLER ---------------- */

function MapController({ gps, recenterSignal }) {
  const map = useMap();

  useEffect(() => {
    if (gps) {
      map.setView(
        [gps.lat, gps.lng],
        Math.max(map.getZoom(), 16),
        { animate: true }
      );
    }
  }, [gps, map]);

  useEffect(() => {
    if (gps && recenterSignal > 0) {
      map.flyTo([gps.lat, gps.lng], 17, {
        animate: true,
        duration: 0.7,
      });
    }
  }, [gps, recenterSignal, map]);

  return null;
}

/* ---------------- MAIN APP ---------------- */

function App() {
  // Screen flow:
  // home -> consent -> locating -> ready -> tracking -> ended

  const [screen, setScreen] = useState("home");
  const [showConsent, setShowConsent] = useState(false);

  const [gps, setGps] = useState(null);
  const [startPoint, setStartPoint] = useState(null);
  const [destinationPoint, setDestinationPoint] = useState(null);
  const [routePoints, setRoutePoints] = useState([]);

  const [distanceKm, setDistanceKm] = useState(0);
  const [waitingSeconds, setWaitingSeconds] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const [tripStart, setTripStart] = useState(null);
  const [tripEnd, setTripEnd] = useState(null);
  const [meterAmount, setMeterAmount] = useState("");

  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [recenterSignal, setRecenterSignal] = useState(0);

  const watchRef = useRef(null);
  const timerRef = useRef(null);
  const previousPositionRef = useRef(null);
  const tripStartRef = useRef(null);
  const screenRef = useRef(screen);

  const tracking = screen === "tracking";
  const ended = screen === "ended";
  const ready = screen === "ready";

  const fare = calculateFare(
    distanceKm,
    waitingSeconds,
    tripStart
  );

  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);

  /* ---------------- CLEANUP ---------------- */

  const stopGPS = useCallback(() => {
    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /* ---------------- HOME / CONSENT ---------------- */

  const openJourney = () => {
    setError("");
    setShowConsent(true);
  };

  const declineLocation = () => {
    setShowConsent(false);
    setError("");
    setScreen("home");
  };

  const acceptLocation = () => {
    setShowConsent(false);
    setError("");

    if (!navigator.geolocation) {
      setError("Your browser does not support location services.");
      setScreen("home");
      return;
    }

    setScreen("locating");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        };

        setGps(location);
        setLastUpdated(new Date());
        setScreen("ready");
      },
      (err) => {
        if (err.code === 1) {
          setError(
            "Location permission was denied. Please allow location access in your browser settings and try again."
          );
        } else if (err.code === 2) {
          setError(
            "Your current location could not be determined. Check your phone's GPS."
          );
        } else {
          setError(
            "Location request timed out. Please try again in an area with a better GPS signal."
          );
        }

        setScreen("home");
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0,
      }
    );
  };

  /* ---------------- LIVE GPS ---------------- */

  const handleGPSPosition = useCallback((position) => {
    if (screenRef.current !== "tracking") return;

    const current = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: position.coords.accuracy,
      speed: position.coords.speed,
      timestamp: position.timestamp || Date.now(),
    };

    // Reject inaccurate GPS readings.
    if (
      !Number.isFinite(current.accuracy) ||
      current.accuracy > CONFIG.maxAccuracy
    ) {
      return;
    }

    const previous = previousPositionRef.current;

    if (previous) {
      const distanceMetres = getDistanceMetres(
        previous,
        current
      );

      const timeSeconds = Math.max(
        1,
        (current.timestamp - previous.timestamp) / 1000
      );

      const impliedSpeed =
        (distanceMetres / timeSeconds) * 3.6;

      const speedKmh =
        current.speed !== null && current.speed >= 0
          ? current.speed * 3.6
          : impliedSpeed;

      const invalid =
        distanceMetres > CONFIG.maxJumpMetres ||
        impliedSpeed > CONFIG.maxSpeedKmh ||
        speedKmh > CONFIG.maxSpeedKmh;

      if (invalid) return;

      if (speedKmh < CONFIG.waitingSpeedKmh) {
        setWaitingSeconds((old) =>
          old + Math.min(timeSeconds, 15)
        );
      }

      if (distanceMetres >= CONFIG.minDistanceIncrement) {
        setDistanceKm((old) =>
          old + distanceMetres / 1000
        );
      }
    }

    previousPositionRef.current = current;

    const newGps = {
      lat: current.lat,
      lng: current.lng,
      accuracy: current.accuracy,
    };

    setGps(newGps);
    setLastUpdated(new Date());

    // Save the actual GPS track for the route line.
    setRoutePoints((old) => {
      const last = old[old.length - 1];

      if (
        last &&
        last[0] === current.lat &&
        last[1] === current.lng
      ) {
        return old;
      }

      return [...old, [current.lat, current.lng]];
    });
  }, []);

  /* ---------------- START TRIP ---------------- */

  const startTrip = () => {
    if (!gps) {
      setError("Your location is not ready. Please try again.");
      return;
    }

    setError("");

    const start = new Date();

    const point = {
      lat: gps.lat,
      lng: gps.lng,
    };

    setStartPoint(point);
    setDestinationPoint(null);
    setTripStart(start);
    setTripEnd(null);

    tripStartRef.current = start;
    previousPositionRef.current = null;

    setDistanceKm(0);
    setWaitingSeconds(0);
    setElapsedSeconds(0);
    setMeterAmount("");

    // The route begins exactly at the start marker.
    setRoutePoints([[point.lat, point.lng]]);

    screenRef.current = "tracking";
    setScreen("tracking");

    stopTimer();

    timerRef.current = window.setInterval(() => {
      if (tripStartRef.current) {
        setElapsedSeconds(
          Math.floor(
            (Date.now() - tripStartRef.current.getTime()) / 1000
          )
        );
      }
    }, 1000);

    watchRef.current = navigator.geolocation.watchPosition(
      handleGPSPosition,
      (err) => {
        if (err.code === 1) {
          setError(
            "Location access was disabled. Re-enable it to continue."
          );
        } else {
          setError(
            "GPS signal is temporarily unavailable. Keep location enabled."
          );
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 20000,
      }
    );
  };

  /* ---------------- END TRIP ---------------- */

  const endTrip = () => {
    stopGPS();
    stopTimer();

    const end = new Date();

    // Destination is the last accepted GPS location.
    const finalPoint = gps
      ? { lat: gps.lat, lng: gps.lng }
      : startPoint;

    setDestinationPoint(finalPoint);
    setTripEnd(end);

    screenRef.current = "ended";
    setScreen("ended");
  };

  /* ---------------- RETURN HOME ---------------- */

  const goHome = () => {
    stopGPS();
    stopTimer();

    screenRef.current = "home";
    setScreen("home");

    setShowConsent(false);
    setError("");

    setGps(null);
    setStartPoint(null);
    setDestinationPoint(null);
    setRoutePoints([]);

    setDistanceKm(0);
    setWaitingSeconds(0);
    setElapsedSeconds(0);

    setTripStart(null);
    setTripEnd(null);
    setMeterAmount("");

    tripStartRef.current = null;
    previousPositionRef.current = null;
  };

  /* ---------------- NEW JOURNEY ---------------- */

  const newJourney = () => {
    stopGPS();
    stopTimer();

    setStartPoint(null);
    setDestinationPoint(null);
    setRoutePoints([]);

    setDistanceKm(0);
    setWaitingSeconds(0);
    setElapsedSeconds(0);

    setTripStart(null);
    setTripEnd(null);
    setMeterAmount("");

    tripStartRef.current = null;
    previousPositionRef.current = null;

    if (gps) {
      setScreen("ready");
      screenRef.current = "ready";
    } else {
      goHome();
    }
  };

  /* ---------------- SHARE ---------------- */

  const shareTrip = async () => {
    const summary = [
      "AutoFare Live — Trip Summary",
      `Distance: ${formatDistance(distanceKm)}`,
      `Duration: ${formatDuration(elapsedSeconds)}`,
      `Waiting: ${formatDuration(waitingSeconds)}`,
      `Estimated fare: ${formatMoney(fare.total)}`,
      "Independent estimate only. Compare with the physical meter.",
    ].join("\n");

    try {
      if (navigator.share) {
        await navigator.share({
          title: "AutoFare Live trip summary",
          text: summary,
        });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(summary);
        alert("Trip summary copied.");
      }
    } catch {
      // Sharing may be cancelled by the visitor.
    }
  };

  /* ---------------- CLEANUP ON UNMOUNT ---------------- */

  useEffect(() => {
    return () => {
      if (watchRef.current !== null) {
        navigator.geolocation.clearWatch(watchRef.current);
      }

      if (timerRef.current) {
        window.clearInterval(timerRef.current);
      }
    };
  }, []);

  const accuracyLabel = !gps
    ? "Waiting for GPS"
    : gps.accuracy <= 15
      ? "High accuracy"
      : gps.accuracy <= 35
        ? "Good accuracy"
        : "Weak GPS signal";

  /* ---------------- RENDER ---------------- */

  return (
    <div className="app-shell">

      {/* HEADER */}

      <header className="topbar">
        <button
          className="brand"
          onClick={goHome}
          aria-label="AutoFare Live home"
        >
          <span className="brand-mark">
            <Gauge size={22} />
          </span>

          <span className="brand-name">
            AutoFare<span>Live</span>
          </span>
        </button>

        <div className="header-meta">
          <span className="public-pill">
            <span className="live-dot" />
            PUBLIC · NO LOGIN
          </span>

          <span className="region-label">{CONFIG.city}</span>
        </div>
      </header>

      {/* HOME SCREEN */}

      {screen === "home" && (
        <main className="home-page">
          <section className="home-hero">
            <div className="home-copy">
              <div className="eyebrow">
                <Activity size={15} />
                INDEPENDENT METER MONITOR
              </div>

              <h1>
                Track your ride.
                <span>Verify your fare.</span>
              </h1>

              <p>
                Know how far you travel and monitor an independent
                fare estimate during your auto-rickshaw journey.
                No login. No complicated setup.
              </p>

              <button
                className="button button-primary home-start-button"
                onClick={openJourney}
              >
                <Navigation size={19} />
                Start Journey
                <ArrowRight size={18} />
              </button>

              <div className="home-privacy">
                <ShieldCheck size={16} />
                Your location is accessed only after your consent.
              </div>

              {error && (
                <div className="error-message" role="alert">
                  {error}
                </div>
              )}
            </div>

            <div className="home-visual">
              <div className="visual-topline">
                <span>LIVE JOURNEY MONITORING</span>
                <span className="visual-dot" />
              </div>

              <div className="visual-map">
                <div className="visual-road road-one" />
                <div className="visual-road road-two" />
                <div className="visual-road road-three" />

                <div className="visual-route-line" />

                <div className="visual-point visual-start">
                  <span>S</span>
                  <small>START</small>
                </div>

                <div className="visual-point visual-current">
                  <span />
                  <small>YOU</small>
                </div>

                <div className="visual-point visual-end">
                  <span>D</span>
                  <small>DESTINATION</small>
                </div>
              </div>

              <div className="visual-bottom">
                <div>
                  <span>TRACK YOUR ROUTE</span>
                  <strong>Every kilometre matters.</strong>
                </div>
                <Route size={24} />
              </div>
            </div>
          </section>

          <section className="home-features">
            <div className="feature-card">
              <div className="feature-icon"><Route size={21} /></div>
              <strong>Live route tracking</strong>
              <p>See your actual GPS journey on the map.</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon"><Wallet size={21} /></div>
              <strong>Fare estimation</strong>
              <p>Monitor an independent running fare estimate.</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon"><Gauge size={21} /></div>
              <strong>Meter comparison</strong>
              <p>Compare your estimate with the physical meter.</p>
            </div>
          </section>

          <section className="home-disclaimer">
            <ShieldCheck size={17} />
            AutoFare Live provides an independent estimate, not an official
            meter reading or a replacement for the authorised fare meter.
          </section>
        </main>
      )}

      {/* LOCATION LOADING SCREEN */}

      {screen === "locating" && (
        <main className="loading-page">
          <div className="loading-card">
            <div className="loading-spinner" />
            <h2>Finding your location</h2>
            <p>
              Please allow your device to determine your current position.
              This may take a few seconds.
            </p>
          </div>
        </main>
      )}

      {/* JOURNEY READY / TRACKING / ENDED */}

      {(ready || tracking || ended) && (
        <main className="page-content">

          <div className="journey-topbar">
            <button className="back-button" onClick={goHome}>
              <ArrowLeft size={17} />
              Back to home
            </button>

            <div className="journey-state">
              <span className={`status-indicator ${tracking ? "is-live" : ended ? "is-ended" : ""}`} />
              {tracking
                ? "TRACKING ACTIVE"
                : ended
                  ? "JOURNEY COMPLETED"
                  : "LOCATION READY"}
            </div>
          </div>

          <section className="journey-heading">
            <div>
              <span className="eyebrow">
                <Activity size={14} />
                YOUR JOURNEY
              </span>

              <h1>
                {ready
                  ? "Ready to start?"
                  : tracking
                    ? "Your ride is being tracked."
                    : "Journey completed."}
              </h1>

              <p>
                {ready
                  ? "Your current location is visible. Start tracking when your auto journey begins."
                  : tracking
                    ? "Your route and current position are updating using GPS."
                    : "Your start point, destination and recorded route are shown below."}
              </p>
            </div>
          </section>

          <section className="status-strip">
            <div className="status-left">
              <span className={`status-indicator ${tracking ? "is-live" : ended ? "is-ended" : ""}`} />
              <div>
                <strong>
                  {tracking
                    ? "Journey tracking active"
                    : ended
                      ? "Journey completed"
                      : "GPS location acquired"}
                </strong>
                <small>
                  {tracking
                    ? "Your route is being recorded"
                    : ended
                      ? "Your trip summary is ready"
                      : "Waiting for you to start"}
                </small>
              </div>
            </div>

            <div className="gps-quality">
              <span className="gps-bars"><i /><i /><i /></span>
              <span>{accuracyLabel}</span>
            </div>
          </section>

          <section className="dashboard-grid">

            {/* MAP */}

            <div className="map-card">
              <div className="panel-heading map-heading">
                <div>
                  <span className="section-kicker">GPS JOURNEY MAP</span>
                  <h2>Your route</h2>
                </div>

                <span className={`map-status ${tracking ? "map-status-live" : ""}`}>
                  {tracking ? "● LIVE" : ended ? "COMPLETED" : "READY"}
                </span>
              </div>

              <div className="map-container">
                <MapContainer
                  center={[gps.lat, gps.lng]}
                  zoom={16}
                  scrollWheelZoom={true}
                  className="map-canvas"
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />

                  <MapController
                    gps={gps}
                    recenterSignal={recenterSignal}
                  />

                  {/* Actual recorded route */}
                  {routePoints.length > 1 && (
                    <Polyline
                      positions={routePoints}
                      pathOptions={{
                        color: "#087f5b",
                        weight: 5,
                        opacity: 0.9,
                        lineCap: "round",
                        lineJoin: "round",
                      }}
                    />
                  )}

                  {/* Start point */}
                  {startPoint && (
                    <Marker
                      position={[startPoint.lat, startPoint.lng]}
                      icon={startIcon}
                    />
                  )}

                  {/* Destination point */}
                  {destinationPoint && (
                    <Marker
                      position={[
                        destinationPoint.lat,
                        destinationPoint.lng,
                      ]}
                      icon={destinationIcon}
                    />
                  )}

                  {/* Live current location */}
                  {gps && (
                    <Marker
                      position={[gps.lat, gps.lng]}
                      icon={currentIcon}
                    />
                  )}
                </MapContainer>

                <button
                  className="map-locate"
                  onClick={() => setRecenterSignal((value) => value + 1)}
                  aria-label="Centre map on current location"
                >
                  <LocateFixed size={19} />
                </button>

                <div className="map-caption">
                  <span className="map-caption-dot" />
                  {tracking ? "Your live GPS position" : "Your current position"}
                </div>
              </div>

              {/* MAP LEGEND */}

              <div className="map-legend">
                <div>
                  <span className="legend-dot legend-start" />
                  <span>Start</span>
                </div>

                <div>
                  <span className="legend-dot legend-current" />
                  <span>You</span>
                </div>

                <div>
                  <span className="legend-dot legend-destination" />
                  <span>Destination</span>
                </div>
              </div>

              <div className="map-footer">
                <div>
                  <span className="footer-label">CURRENT GPS POSITION</span>
                  <strong>
                    {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}
                  </strong>
                </div>

                <div className="map-updated">
                  {lastUpdated
                    ? `Updated ${lastUpdated.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}`
                    : "Waiting for GPS"}
                </div>
              </div>
            </div>

            {/* MONITOR COLUMN */}

            <div className="monitor-column">

              <div className="fare-card">
                <div className="fare-card-top">
                  <span className="section-kicker">
                    INDEPENDENT ESTIMATE
                  </span>
                  <span className="estimate-tag">ESTIMATE</span>
                </div>

                <div className="fare-amount">
                  {ready ? "— —" : formatMoney(fare.total)}
                </div>

                <p className="fare-caption">
                  {ready
                    ? "Your estimate appears after starting the trip"
                    : "Estimated fare based on your tracked journey"}
                </p>

                {status !== "ready" && (
                  <>
                    <div className="fare-divider" />

                    <div className="fare-mini-row">
                      <span><Route size={15} /> Distance fare</span>
                      <strong>{formatMoney(fare.distanceFare)}</strong>
                    </div>

                    <div className="fare-mini-row">
                      <span><Clock3 size={15} /> Waiting charge</span>
                      <strong>{formatMoney(fare.waitingFare)}</strong>
                    </div>

                    {fare.nightSurcharge > 0 && (
                      <div className="fare-mini-row">
                        <span><Activity size={15} /> Night surcharge</span>
                        <strong>{formatMoney(fare.nightSurcharge)}</strong>
                      </div>
                    )}
                  </>
                )}

                <div className="fare-disclaimer">
                  Independent estimate only. Compare with the physical meter.
                </div>
              </div>

              <div className="metrics-card">
                <div className="panel-heading compact-heading">
                  <div>
                    <span className="section-kicker">LIVE STATISTICS</span>
                    <h2>Trip details</h2>
                  </div>
                </div>

                <div className="metric-grid">
                  <div className="metric">
                    <span className="metric-icon"><Route size={17} /></span>
                    <span className="metric-label">DISTANCE</span>
                    <strong>{formatDistance(distanceKm)}</strong>
                  </div>

                  <div className="metric">
                    <span className="metric-icon"><Timer size={17} /></span>
                    <span className="metric-label">DURATION</span>
                    <strong>{formatDuration(elapsedSeconds)}</strong>
                  </div>

                  <div className="metric">
                    <span className="metric-icon"><Clock3 size={17} /></span>
                    <span className="metric-label">WAITING</span>
                    <strong>{formatDuration(waitingSeconds)}</strong>
                  </div>

                  <div className="metric">
                    <span className="metric-icon"><Navigation size={17} /></span>
                    <span className="metric-label">GPS STATUS</span>
                    <strong className="metric-small">{accuracyLabel}</strong>
                  </div>
                </div>
              </div>

              {/* JOURNEY CONTROLS */}

              <div className="trip-actions">
                {ready && (
                  <button
                    className="button button-primary start-button"
                    onClick={startTrip}
                  >
                    <Navigation size={19} />
                    Start trip tracking
                    <ArrowRight size={18} />
                  </button>
                )}

                {tracking && (
                  <button
                    className="button button-danger start-button"
                    onClick={endTrip}
                  >
                    <X size={18} />
                    End trip
                  </button>
                )}

                {ended && (
                  <div className="completed-actions">
                    <button
                      className="button button-primary"
                      onClick={shareTrip}
                    >
                      Share trip summary
                      <ArrowRight size={17} />
                    </button>

                    <button
                      className="button button-secondary"
                      onClick={newJourney}
                    >
                      Start another journey
                    </button>

                    <button
                      className="button button-secondary"
                      onClick={goHome}
                    >
                      <ArrowLeft size={17} />
                      Back to home
                    </button>
                  </div>
                )}

                {error && (
                  <div className="error-message" role="alert">
                    {error}
                  </div>
                )}

                {tracking && (
                  <p className="action-hint">
                    Keep this page open during the ride. End the trip when
                    you reach your destination.
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* COMPARISON AND BREAKDOWN */}

          <section className="bottom-grid">
            <div className="compare-card">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">FARE VERIFICATION</span>
                  <h2>Compare with the auto meter</h2>
                </div>
                <Gauge size={20} className="compare-icon" />
              </div>

              <p className="compare-description">
                Enter the amount displayed on the physical meter after
                your journey.
              </p>

              <label className="meter-label" htmlFor="meterAmount">
                Amount on auto meter
              </label>

              <div className="meter-input-wrap">
                <span>₹</span>
                <input
                  id="meterAmount"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.5"
                  placeholder="Enter meter amount"
                  value={meterAmount}
                  onChange={(event) =>
                    setMeterAmount(event.target.value)
                  }
                  disabled={!ended}
                />
              </div>

              {ended && meterAmount !== "" &&
                Number(meterAmount) >= 0 && (
                  <div className="comparison-result">
                    <span>
                      {Number(meterAmount) > fare.total
                        ? "Meter is higher than estimate"
                        : Number(meterAmount) < fare.total
                          ? "Meter is lower than estimate"
                          : "Both amounts match"}
                    </span>

                    <strong>
                      {formatMoney(
                        Math.abs(Number(meterAmount) - fare.total)
                      )}
                    </strong>
                  </div>
                )}

              {!ended && (
                <small className="input-hint">
                  Available after ending your journey.
                </small>
              )}
            </div>

            <div className="breakdown-card">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">HOW IT IS CALCULATED</span>
                  <h2>Fare breakdown</h2>
                </div>
                <Wallet size={20} className="breakdown-heading-icon" />
              </div>

              <div className="breakdown-row">
                <span>Minimum fare (up to {CONFIG.minimumKm} km)</span>
                <strong>{formatMoney(CONFIG.minimumFare)}</strong>
              </div>

              <div className="breakdown-row">
                <span>Additional distance</span>
                <strong>
                  {formatMoney(
                    Math.max(0, distanceKm - CONFIG.minimumKm) *
                      CONFIG.perKm
                  )}
                </strong>
              </div>

              <div className="breakdown-row">
                <span>Waiting time</span>
                <strong>{formatMoney(fare.waitingFare)}</strong>
              </div>

              <div className="breakdown-total">
                <span>Estimated total</span>
                <strong>
                  {ready ? "— —" : formatMoney(fare.total)}
                </strong>
              </div>

              <p className="breakdown-note">
                Fare inputs must be verified against the latest applicable
                official tariff. Actual meter rules and rounding may differ.
              </p>
            </div>
          </section>

          {ended && (
            <section className="trip-complete">
              <div className="complete-icon">
                <ShieldCheck size={22} />
              </div>

              <div>
                <strong>Your journey has ended</strong>
                <p>
                  {formatDistance(distanceKm)} travelled in{" "}
                  {formatDuration(elapsedSeconds)}. Estimated fare:{" "}
                  {formatMoney(fare.total)}.
                </p>
              </div>
            </section>
          )}
        </main>
      )}

      {/* FOOTER */}

      <footer className="site-footer">
        <div className="footer-brand">
          <Gauge size={17} />
          <strong>AutoFare<span>Live</span></strong>
        </div>

        <p>Independent journey monitoring · Built for everyday rides</p>

        <span>Location access is controlled by you.</span>
      </footer>

      {/* LOCATION CONSENT MODAL */}

      {showConsent && (
        <div className="consent-backdrop">
          <section
            className="consent-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="consent-title"
            aria-describedby="consent-description"
          >
            <div className="consent-icon">
              <LocateFixed size={28} />
            </div>

            <span className="section-kicker">LOCATION PERMISSION</span>

            <h2 id="consent-title">
              Share your current location?
            </h2>

            <p id="consent-description">
              AutoFare Live needs access to your device's location to
              display your position on the map and calculate your
              journey distance and estimated fare.
            </p>

            <div className="consent-info">
              <ShieldCheck size={18} />
              <span>
                Your location is used for this journey. Tracking begins
                only after you press Start trip tracking.
              </span>
            </div>

            <div className="consent-actions">
              <button
                className="button button-primary"
                onClick={acceptLocation}
              >
                Yes, share location
              </button>

              <button
                className="button button-secondary"
                onClick={declineLocation}
              >
                No, thanks
              </button>
            </div>

            <small>
              Your browser will ask you to confirm location permission.
              You can change it later in browser settings.
            </small>
          </section>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
