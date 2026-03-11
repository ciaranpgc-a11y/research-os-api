import fs from "node:fs/promises";
import { chromium } from "playwright";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

async function waitForClearance(page, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await page
      .evaluate(() => ({
        title: document.title || "",
        body: document.body?.innerText?.slice(0, 800) || "",
      }))
      .catch(() => ({ title: "", body: "" }));
    const marker = `${state.title} ${state.body}`.toLowerCase();
    if (
      !marker.includes("just a moment") &&
      !marker.includes("attention required") &&
      !marker.includes("please stand by")
    ) {
      return;
    }
    await page.waitForTimeout(1000);
  }
}

async function clickConsent(page) {
  const labels = [
    "I Accept",
    "Accept",
    "Accept all",
    "Allow all",
    "Agree",
  ];
  for (const label of labels) {
    const button = page.getByRole("button", { name: new RegExp(`^${label}$`, "i") });
    const visible = await button.isVisible().catch(() => false);
    if (!visible) {
      continue;
    }
    await button.click().catch(() => {});
    await page.waitForTimeout(250);
    return;
  }
}

async function fetchPdfBase64(page, targetUrl) {
  return page.evaluate(async (url) => {
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) {
      throw new Error(`Browser fetch failed with status ${response.status}`);
    }
    const contentType = response.headers.get("content-type") || "";
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
    return {
      base64: btoa(binary),
      contentType,
      length: bytes.length,
    };
  }, targetUrl);
}

const args = parseArgs(process.argv.slice(2));
const targetUrl = String(args.url || "").trim();
const outputPath = String(args.output || "").trim();
const timeoutMs = Math.max(15000, Number(args["timeout-ms"] || 45000));

if (!targetUrl || !outputPath) {
  console.error("Usage: fetch-pdf-via-browser.mjs --url <url> --output <path> [--timeout-ms <ms>]");
  process.exit(1);
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();
  const originUrl = new URL(targetUrl).origin;
  await page.goto(originUrl, {
    waitUntil: "domcontentloaded",
    timeout: timeoutMs,
  });
  await clickConsent(page);
  await waitForClearance(page, timeoutMs);
  const payload = await fetchPdfBase64(page, targetUrl);
  if (!String(payload.contentType || "").toLowerCase().includes("pdf")) {
    throw new Error(`Expected a PDF response but received '${payload.contentType || "unknown"}'.`);
  }
  await fs.writeFile(outputPath, Buffer.from(payload.base64, "base64"));
  process.stdout.write(
    JSON.stringify({
      ok: true,
      output: outputPath,
      bytes: payload.length,
      contentType: payload.contentType,
    }),
  );
} finally {
  await browser.close();
}
