export interface WeatherInfo {
  temperature: number;
  condition: string;
  icon: string;
}

interface WeatherCache {
  data: WeatherInfo;
  timestamp: number;
}

interface WttrResponse {
  current_condition: Array<{
    temp_C: string;
    weatherCode: string;
    weatherDesc: Array<{ value: string }>;
  }>;
}

const STALE_TTL_MS = 15 * 60 * 1000; // 15 minutes - when data is considered stale
const LOCK_TTL_MS = 30_000; // 30 seconds - lock expiry for background refresh
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours - when KV entry expires

// Weather code to emoji mapping based on wttr.in WWO codes
// https://www.worldweatheronline.com/developer/api/docs/weather-icons.aspx
function getWeatherIcon(code: string): string {
  const codeNum = parseInt(code, 10);

  // Clear/Sunny
  if (codeNum === 113) return "☀️";

  // Partly cloudy
  if (codeNum === 116) return "⛅";

  // Cloudy/Overcast
  if (codeNum === 119 || codeNum === 122) return "☁️";

  // Fog/Mist
  if (codeNum === 143 || codeNum === 248 || codeNum === 260) return "🌫️";

  // Light rain/drizzle
  if (
    codeNum === 176 ||
    codeNum === 263 ||
    codeNum === 266 ||
    codeNum === 293 ||
    codeNum === 296 ||
    codeNum === 353
  ) {
    return "🌧️";
  }

  // Heavy rain
  if (
    codeNum === 299 ||
    codeNum === 302 ||
    codeNum === 305 ||
    codeNum === 308 ||
    codeNum === 356 ||
    codeNum === 359
  ) {
    return "🌧️";
  }

  // Thunderstorm
  if (
    codeNum === 200 ||
    codeNum === 386 ||
    codeNum === 389 ||
    codeNum === 392 ||
    codeNum === 395
  ) {
    return "⛈️";
  }

  // Snow
  if (
    codeNum === 179 ||
    codeNum === 182 ||
    codeNum === 185 ||
    codeNum === 227 ||
    codeNum === 230 ||
    codeNum === 323 ||
    codeNum === 326 ||
    codeNum === 329 ||
    codeNum === 332 ||
    codeNum === 335 ||
    codeNum === 338 ||
    codeNum === 350 ||
    codeNum === 362 ||
    codeNum === 365 ||
    codeNum === 368 ||
    codeNum === 371 ||
    codeNum === 374 ||
    codeNum === 377
  ) {
    return "🌨️";
  }

  // Default to cloudy
  return "☁️";
}

async function fetchWeather(location: string): Promise<WeatherInfo | null> {
  try {
    const response = await fetch(
      `https://wttr.in/${encodeURIComponent(location)}?format=j1`,
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as WttrResponse;
    const current = data.current_condition?.[0];

    if (!current) {
      return null;
    }

    return {
      temperature: parseInt(current.temp_C, 10),
      condition: current.weatherDesc?.[0]?.value ?? "Unknown",
      icon: getWeatherIcon(current.weatherCode),
    };
  } catch {
    return null;
  }
}

function isFresh(timestamp: number): boolean {
  return Date.now() - timestamp < STALE_TTL_MS;
}

async function triggerBackgroundRefresh(
  kv: Deno.Kv,
  location: string,
): Promise<void> {
  const normalizedLocation = location.toLowerCase();
  const cacheKey = ["weather", normalizedLocation];
  const lockKey = ["weather-lock", normalizedLocation];

  // Try to acquire lock atomically
  const lockResult = await kv.atomic()
    .check({ key: lockKey, versionstamp: null }) // Only if lock doesn't exist
    .set(lockKey, Date.now(), { expireIn: LOCK_TTL_MS })
    .commit();

  if (!lockResult.ok) {
    // Another process is already refreshing
    return;
  }

  try {
    const weather = await fetchWeather(location);

    if (weather) {
      const cache: WeatherCache = {
        data: weather,
        timestamp: Date.now(),
      };
      await kv.set(cacheKey, cache, { expireIn: CACHE_EXPIRY_MS });
    }
  } finally {
    // Release lock
    await kv.delete(lockKey);
  }
}

export async function getWeather(
  location: string,
): Promise<WeatherInfo | null> {
  if (!location) {
    return null;
  }

  const kv = await Deno.openKv();
  const cacheKey = ["weather", location.toLowerCase()];

  // Check cache
  const cached = await kv.get<WeatherCache>(cacheKey);

  if (cached.value) {
    if (isFresh(cached.value.timestamp)) {
      // Fresh cache - return immediately
      kv.close();
      return cached.value.data;
    }

    // Stale cache - return stale data, trigger background refresh
    triggerBackgroundRefresh(kv, location).finally(() => kv.close());
    return cached.value.data;
  }

  // No cache - trigger background refresh, return null for now
  triggerBackgroundRefresh(kv, location).finally(() => kv.close());
  return null;
}
