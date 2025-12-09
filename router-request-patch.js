// injected.js
(() => {
  const TARGET_RE = /^https:\/\/trainlog\.me\/forwardRouting\/train\/route\/v1\/train/i;

  const OriginalXHR = window.XMLHttpRequest;

  function rewriteUrl(u) {
    try {
      const url = new URL(u, location.href);
      if (!TARGET_RE.test(url.href)) return u; // IMPORTANT: return original string, not URL object

      const searchParams = new URLSearchParams(url.search);
      if (searchParams.has("use_new_router") && searchParams.get("use_new_router") === "true") {
        url.host = "openrailrouting.kaelon.dev";

        const points = url.pathname.replace("/forwardRouting/train/route/v1/train/", "").split(";");

        const newSearchParams = new URLSearchParams();
        for (let point of points) {
          const parts = point.split(",");
          newSearchParams.append("point", `${parts[1]},${parts[0]}`);
        }
        newSearchParams.append("type", "json");
        newSearchParams.append("locale", "en-US");
        newSearchParams.append("key", "");
        newSearchParams.append("elevation", "false");
        newSearchParams.append("profile", "all");

        url.pathname = "route";
        url.search = newSearchParams.toString();
      }

      return url.toString();
    } catch {
      return u;
    }
  }

  function translateResponseText(text, contentType) {
    if (typeof text === "string" && contentType?.includes("application/json")) {
      try {
        const gh = JSON.parse(text);
        const osrm = convertGraphhopperToOsrm(gh);
        return JSON.stringify(osrm);
      } catch (e) {
        // console.warn("translateResponseText failed", e);
      }
    }
    return text;
  }

  function safeGetContentType(xhr) {
    try {
      return (xhr.getResponseHeader("content-type") || "").toLowerCase();
    } catch {
      return "";
    }
  }

  function makeWrappedHandler(state, xhr, handler) {
  if (typeof handler !== "function") return handler;
  return function (ev) {
    // Ensure translation exists before app code reads response/responseText
    if (state.shouldPatch && xhr.readyState === 4 && state.translatedText == null) {
      computeTranslation(state, xhr);
    }
    return handler.call(xhr, ev);
  };
}

function computeTranslation(state, xhr) {
  try {
    const ct = safeGetContentType(xhr);

    let rawText = null;
    // Only read responseText on DONE; safe in most cases
    if (typeof xhr.responseText === "string" && xhr.responseText.length) {
      rawText = xhr.responseText;
    } else if (xhr.responseType === "json" && xhr.response != null) {
      rawText = JSON.stringify(xhr.response);
    }

    if (rawText != null) {
      const translated = translateResponseText(rawText, ct);
      state.translatedText = translated;
      try {
        state.translatedObj = JSON.parse(translated);
      } catch {
        state.translatedObj = null;
      }
    }
  } catch {
    state.translatedText = null;
    state.translatedObj = null;
  }
}

function PatchedXHR() {
  const xhr = new OriginalXHR();

  const state = {
    origUrl: null,
    rewrittenUrl: null,
    shouldPatch: false,
    translatedText: null,
    translatedObj: null,
    handlerMap: new WeakMap()
  };

  // Compute translation when DONE (doesn't interfere with native events)
  xhr.addEventListener(
    "readystatechange",
    () => {
      if (!state.shouldPatch) return;
      if (xhr.readyState !== 4) return;
      computeTranslation(state, xhr);
      // console.log("translated obj", state.translatedObj);
    },
    true
  );

  return new Proxy(xhr, {
    get(target, prop) {
      // Intercept reads of responseText/response
      if (prop === "responseText") {
        if (state.shouldPatch && state.translatedText != null) return state.translatedText;
        // brand-check safe:
        return Reflect.get(target, prop, target);
      }

      if (prop === "response") {
        if (state.shouldPatch && state.translatedText != null) {
          const rt = Reflect.get(target, "responseType", target);
          if (rt === "json") return state.translatedObj ?? null;
          if (rt === "" || rt === "text") return state.translatedText;
          return state.translatedObj ?? state.translatedText;
        }
        return Reflect.get(target, prop, target);
      }

      // Rewrite URL in open()
      if (prop === "open") {
        return function (method, url, async = true, user, password) {
          state.origUrl = String(url);
          state.rewrittenUrl = rewriteUrl(state.origUrl);
          state.shouldPatch = state.rewrittenUrl !== state.origUrl;
          return target.open(method, state.rewrittenUrl, async !== false, user, password);
        };
      }

      // Wrap event listeners (so translation is ready when app reads)
      if (prop === "addEventListener") {
        return function (type, listener, options) {
          const wrapped =
            (type === "readystatechange" || type === "load" || type === "loadend")
              ? makeWrappedHandler(state, target, listener)
              : listener;

          if (wrapped !== listener && typeof listener === "function") {
            state.handlerMap.set(listener, wrapped);
          }
          return target.addEventListener(type, wrapped, options);
        };
      }

      if (prop === "removeEventListener") {
        return function (type, listener, options) {
          const wrapped = (typeof listener === "function" && state.handlerMap.get(listener)) || listener;
          return target.removeEventListener(type, wrapped, options);
        };
      }

      // Default: brand-check safe property access
      const value = Reflect.get(target, prop, target);

      // Bind methods so `this` is the real XHR
      return typeof value === "function" ? value.bind(target) : value;
    },

    set(target, prop, value) {
      // Wrap property handlers (without redefining native properties)
      if (prop === "onreadystatechange" || prop === "onload" || prop === "onloadend") {
        target[prop] = makeWrappedHandler(state, target, value);
        return true;
      }
      target[prop] = value;
      return true;
    }
  });
}

// Keep instanceof working-ish
PatchedXHR.prototype = OriginalXHR.prototype;

window.XMLHttpRequest = PatchedXHR;
})();

function decodePolyline(encoded, precision = 5) {
  /** Decode a polyline string into a list of [lat, lng] pairs. */
  const coordinates = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const factor = Math.pow(10, precision);

  while (index < encoded.length) {
    // Latitude
    let shift = 0;
    let result = 0;
    while (true) {
      const byte = encoded.charCodeAt(index) - 63;
      index += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
      if (byte < 0x20) break;
    }
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    // Longitude
    shift = 0;
    result = 0;
    while (true) {
      const byte = encoded.charCodeAt(index) - 63;
      index += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
      if (byte < 0x20) break;
    }
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    coordinates.push([lat / factor, lng / factor]); // [lat, lng]
  }

  return coordinates;
}

function convertGraphhopperToOsrm(ghResponse) {
  /** Convert GraphHopper response to OSRM-like format for compatibility */
  if (!ghResponse || !Array.isArray(ghResponse.paths) || ghResponse.paths.length === 0) {
    return { code: "NoRoute", message: "No route found" };
  }

  const path = ghResponse.paths[0] || {};
  const encodedPoints = path.points || "";

  const waypoints = [];
  const snappedWaypoints = path.snapped_waypoints || "";

  if (snappedWaypoints) {
    const snappedCoords = decodePolyline(snappedWaypoints, 5);
    snappedCoords.forEach(([lat, lng], idx) => {
      waypoints.push({
        name: "",
        location: [lng, lat],
        distance: 0,
        hint: "",
        waypoint_index: idx
      });
    });
  } else if (encodedPoints) {
    const coords = decodePolyline(encodedPoints, 5);
    if (coords.length >= 2) {
      const [lat0, lng0] = coords[0];
      const [lat1, lng1] = coords[coords.length - 1];

      waypoints.push({
        name: "",
        location: [lng0, lat0],
        distance: 0,
        hint: "",
        waypoint_index: 0
      });
      waypoints.push({
        name: "",
        location: [lng1, lat1],
        distance: 0,
        hint: "",
        waypoint_index: 1
      });
    }
  } else {
    const bbox = Array.isArray(path.bbox) ? path.bbox : [];
    if (bbox.length >= 4) {
      waypoints.push({
        name: "",
        location: [bbox[0], bbox[1]],
        distance: 0,
        hint: "",
        waypoint_index: 0
      });
      waypoints.push({
        name: "",
        location: [bbox[2], bbox[3]],
        distance: 0,
        hint: "",
        waypoint_index: 1
      });
    }
  }

  const distance = Number(path.distance || 0);
  const durationSeconds = Number(path.time || 0) / 1000;
  const weight = Number(path.weight || 0);

  const legs = [
    {
      distance,
      duration: durationSeconds,
      summary: "",
      steps: [],
      weight,
      weight_name: "routability",
      annotation: {
        distance: [distance],
        duration: [durationSeconds]
      }
    }
  ];

  return {
    code: "Ok",
    routes: [
      {
        geometry: encodedPoints,
        distance,
        duration: durationSeconds,
        weight,
        weight_name: "routability",
        legs,
        details: path.details ?? 0
      }
    ],
    waypoints
  };
}