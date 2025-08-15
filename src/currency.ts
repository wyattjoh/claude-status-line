import { join } from "node:path";
import { tmpdir } from "node:os";
import { readFile, writeFile } from "node:fs/promises";

interface CacheData {
  rate: number;
  timestamp: number;
}

function getCacheFilePath(currency: string): string {
  return join(tmpdir(), `claude-currency-${currency.toLowerCase()}.json`);
}

function isCacheFresh(timestamp: number): boolean {
  const oneHour = 60 * 60 * 1000;
  return Date.now() - timestamp < oneHour;
}

async function readCache(filePath: string): Promise<CacheData | null> {
  try {
    const content = await readFile(filePath, "utf-8");
    const data = JSON.parse(content) as CacheData;
    if (typeof data.rate === "number" && typeof data.timestamp === "number") {
      return data;
    }
  } catch {
    // File doesn't exist or invalid JSON
  }
  return null;
}

async function writeCache(filePath: string, rate: number): Promise<void> {
  try {
    const data: CacheData = {
      rate,
      timestamp: Date.now(),
    };
    await writeFile(filePath, JSON.stringify(data), "utf-8");
  } catch {
    // Ignore write errors
  }
}

async function getCurrencyRates(currency: string): Promise<number | null> {
  const cacheFile = getCacheFilePath(currency);

  const cached = await readCache(cacheFile);
  if (cached && isCacheFresh(cached.timestamp)) {
    return cached.rate;
  }

  const response = await fetch(
    "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json",
  );
  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  const rate = data?.usd?.[currency.toLowerCase()] ?? null;

  if (rate !== null) {
    await writeCache(cacheFile, rate);
  }

  return rate;
}

export async function formatCurrency(
  amount: number,
  currency: string,
): Promise<string> {
  const rate = await getCurrencyRates(currency);
  if (rate) {
    return `$${(amount * rate).toFixed(2)}`;
  }

  return `$${amount.toFixed(2)} USD`;
}
