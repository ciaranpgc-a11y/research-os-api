import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

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

function looksLikePdfBytes(content, contentType = "") {
  if (!content || content.length === 0) {
    return false;
  }
  if (content.subarray(0, 4).toString() === "%PDF") {
    return true;
  }
  return String(contentType || "").toLowerCase().includes("pdf");
}

function isLikelyPdfResponse(response, headers) {
  const contentType = String(headers["content-type"] || "").toLowerCase();
  const disposition = String(headers["content-disposition"] || "").toLowerCase();
  const url = String(response.url() || "").toLowerCase();
  return (
    contentType.includes("pdf") ||
    disposition.includes(".pdf") ||
    url.includes(".pdf")
  );
}

async function readPdfResponse(response) {
  const headers = await response.allHeaders().catch(() => ({}));
  if (!isLikelyPdfResponse(response, headers)) {
    return null;
  }
  const contentType = String(headers["content-type"] || "").trim();
  const body = await response.body().catch(() => null);
  if (!body || !looksLikePdfBytes(body, contentType)) {
    return null;
  }
  return {
    buffer: body,
    contentType: contentType || "application/pdf",
    sourceUrl: response.url(),
  };
}

function looksLikePdfUrl(value) {
  const url = String(value || "").toLowerCase();
  return (
    url.includes(".pdf") ||
    url.includes("/pdfft") ||
    url.includes("pdf.sciencedirectassets.com") ||
    url.includes("downloadpdf") ||
    url.includes("download-pdf")
  );
}

async function clickConsent(page) {
  const labels = [
    "I Accept",
    "Accept",
    "Accept all",
    "Allow all",
    "Agree",
    "Continue",
  ];
  for (const label of labels) {
    const button = page.getByRole("button", { name: new RegExp(`^${label}$`, "i") });
    const visible = await button.isVisible().catch(() => false);
    if (!visible) {
      continue;
    }
    await button.click().catch(() => {});
    await page.waitForTimeout(300);
    return;
  }
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

async function waitForMetaRefresh(page, timeoutMs) {
  const refreshInfo = await page
    .evaluate(() => {
      const meta = document.querySelector('meta[http-equiv="refresh" i]');
      const content = meta?.getAttribute("content") || "";
      const match = content.match(/^\s*(\d+(?:\.\d+)?)\s*;\s*url\s*=/i);
      if (!match) {
        return null;
      }
      return { seconds: Number(match[1]) };
    })
    .catch(() => null);
  if (!refreshInfo || !Number.isFinite(refreshInfo.seconds)) {
    return;
  }
  const waitMs = Math.max(
    1000,
    Math.min(timeoutMs, Math.round(refreshInfo.seconds * 1000) + 750),
  );
  await page.waitForTimeout(waitMs);
}

async function findPdfCandidates(page, targetUrl) {
  return page
    .evaluate((initialTargetUrl) => {
      const absolute = (value) => {
        try {
          return new URL(value, window.location.href).toString();
        } catch {
          return "";
        }
      };
      const isLikelyFollowCandidate = (value) =>
        /doi\.org\/|linkinghub\.|science\/article\/|\/retrieve\/|full[- ]?text|article|pii\/|doaj\.org\/article\/|pmc\.ncbi\.nlm\.nih\.gov\/articles\//i.test(
          value,
        );
      const nodes = Array.from(
        document.querySelectorAll(
          'meta[name="citation_pdf_url"], meta[property="citation_pdf_url"], meta[property="og:url"], link[href][type="application/pdf"], link[rel="canonical"][href], a[href], iframe[src], embed[src], object[data]',
        ),
      );
      const refreshMeta =
        document.querySelector('meta[http-equiv="refresh" i]')?.getAttribute("content") || "";
      const refreshMatch = refreshMeta.match(/url\s*=\s*(.+)$/i);
      const candidates = nodes
        .map(
          (node) =>
            node.getAttribute("content") ||
            node.getAttribute("href") ||
            node.getAttribute("src") ||
            node.getAttribute("data") ||
            "",
        )
        .map((value) => absolute(value))
        .filter(Boolean);
      if (refreshMatch?.[1]) {
        candidates.unshift(
          absolute(refreshMatch[1].trim().replace(/^['"]|['"]$/g, "")),
        );
      }
      candidates.unshift(initialTargetUrl);
      return Array.from(new Set(candidates)).filter(
        (value) =>
          /\.pdf([?#].*)?$/i.test(value) ||
          /pdf/i.test(value) ||
          isLikelyFollowCandidate(value),
      );
    }, targetUrl)
    .catch(() => [targetUrl]);
}

async function fetchPdfBase64(page, targetUrl) {
  return page.evaluate(async (url) => {
    const response = await fetch(url, {
      credentials: "include",
      redirect: "follow",
    });
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
      finalUrl: response.url || url,
    };
  }, targetUrl);
}

async function fetchPdfWithBrowserSession(context, targetUrl) {
  const cookies = await context.cookies(targetUrl).catch(() => []);
  const cookieHeader = cookies
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .filter(Boolean)
    .join("; ");
  const url = new URL(targetUrl);
  const response = await fetch(targetUrl, {
    redirect: "follow",
    headers: {
      "User-Agent": BROWSER_USER_AGENT,
      Accept: "application/pdf,application/octet-stream;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-GB,en;q=0.9,en-US;q=0.8",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      Referer: `${url.origin}/`,
      Origin: url.origin,
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
  });
  if (!response.ok) {
    throw new Error(`Session fetch failed with status ${response.status}`);
  }
  const contentType = response.headers.get("content-type") || "";
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!looksLikePdfBytes(buffer, contentType)) {
    throw new Error("Session fetch did not return PDF bytes");
  }
  return {
    buffer,
    contentType: contentType || "application/pdf",
    sourceUrl: response.url || targetUrl,
  };
}

async function clickPdfAffordance(page) {
  const roleQueries = [
    { role: "link", name: /pdf|download pdf|view pdf|full text pdf|open pdf/i },
    { role: "button", name: /pdf|download pdf|view pdf|full text pdf|open pdf/i },
  ];
  for (const query of roleQueries) {
    const locator = page.getByRole(query.role, { name: query.name }).first();
    const visible = await locator.isVisible().catch(() => false);
    if (!visible) {
      continue;
    }
    await locator.click().catch(() => {});
    return true;
  }

  const selectors = [
    'a[href$=".pdf"]',
    'a[href*=".pdf?"]',
    'a[href*="/pdf"]',
    'a[href*="download"]',
    'button[data-track-action*="pdf"]',
    'button[data-track-label*="pdf"]',
  ];
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    const visible = await locator.isVisible().catch(() => false);
    if (!visible) {
      continue;
    }
    await locator.click().catch(() => {});
    return true;
  }
  return false;
}

async function capturePdfFromPopup(context, popup) {
  if (!popup) {
    return null;
  }
  const popupResponses = [];
  popup.on("response", async (response) => {
    if (popupResponses.length) {
      return;
    }
    const payload = await readPdfResponse(response);
    if (payload) {
      popupResponses.push(payload);
    }
  });
  await popup.waitForLoadState("domcontentloaded").catch(() => {});
  await popup.waitForTimeout(1200).catch(() => {});
  if (popupResponses.length) {
    return popupResponses[0];
  }
  const popupUrl = popup.url();
  if (looksLikePdfUrl(popupUrl)) {
    const sessionPayload = await fetchPdfWithBrowserSession(context, popupUrl).catch(() => null);
    if (sessionPayload) {
      return sessionPayload;
    }
  }
  return null;
}

async function consumeDownload(download) {
  const downloadPath = await download.path().catch(() => null);
  if (!downloadPath) {
    return null;
  }
  const buffer = await fs.readFile(downloadPath).catch(() => null);
  if (!buffer || !looksLikePdfBytes(buffer, "application/pdf")) {
    return null;
  }
  return {
    buffer,
    contentType: "application/pdf",
    sourceUrl: download.url(),
  };
}

async function main() {
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
      acceptDownloads: true,
      ignoreHTTPSErrors: true,
      userAgent: BROWSER_USER_AGENT,
      extraHTTPHeaders: {
        "Accept-Language": "en-GB,en;q=0.9,en-US;q=0.8",
      },
    });
    const page = await context.newPage();

    const capturedResponses = [];
    const capturedDownloads = [];
    page.on("response", async (response) => {
      if (capturedResponses.length) {
        return;
      }
      const pdfPayload = await readPdfResponse(response);
      if (pdfPayload) {
        capturedResponses.push(pdfPayload);
      }
    });
    page.on("download", (download) => {
      capturedDownloads.push(download);
    });

    const initialResponse = await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
    if (initialResponse) {
      const pdfPayload = await readPdfResponse(initialResponse);
      if (pdfPayload) {
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        await fs.writeFile(outputPath, pdfPayload.buffer);
        process.stdout.write(
          JSON.stringify({
            ok: true,
            output: outputPath,
            bytes: pdfPayload.buffer.length,
            contentType: pdfPayload.contentType,
            sourceUrl: pdfPayload.sourceUrl,
            strategy: "direct-response",
          }),
        );
        return;
      }
    }

    await clickConsent(page);
    await waitForClearance(page, timeoutMs);
    await waitForMetaRefresh(page, timeoutMs);
    await page.waitForTimeout(1200);

    const responseCandidate = capturedResponses[0];
    if (responseCandidate) {
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, responseCandidate.buffer);
      process.stdout.write(
        JSON.stringify({
          ok: true,
          output: outputPath,
          bytes: responseCandidate.buffer.length,
          contentType: responseCandidate.contentType,
          sourceUrl: responseCandidate.sourceUrl,
          strategy: "captured-response",
        }),
      );
      return;
    }

    if (capturedDownloads.length) {
      const downloadCandidate = await consumeDownload(capturedDownloads[0]);
      if (downloadCandidate) {
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        await fs.writeFile(outputPath, downloadCandidate.buffer);
        process.stdout.write(
          JSON.stringify({
            ok: true,
            output: outputPath,
            bytes: downloadCandidate.buffer.length,
            contentType: downloadCandidate.contentType,
            sourceUrl: downloadCandidate.sourceUrl,
            strategy: "download-event",
          }),
        );
        return;
      }
    }

    const sessionTargetPayload = await fetchPdfWithBrowserSession(
      context,
      targetUrl,
    ).catch(() => null);
    if (sessionTargetPayload) {
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, sessionTargetPayload.buffer);
      process.stdout.write(
        JSON.stringify({
          ok: true,
          output: outputPath,
          bytes: sessionTargetPayload.buffer.length,
          contentType: sessionTargetPayload.contentType,
          sourceUrl: sessionTargetPayload.sourceUrl,
          strategy: "session-fetch-target",
        }),
      );
      return;
    }

    const popupPromise = page
      .context()
      .waitForEvent("page", { timeout: 4000 })
      .catch(() => null);
    const clicked = await clickPdfAffordance(page);
    if (clicked) {
      const popup = popupPromise ? await popupPromise.catch(() => null) : null;
      await page.waitForTimeout(1500);
      const clickedResponse = capturedResponses[0];
      if (clickedResponse) {
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        await fs.writeFile(outputPath, clickedResponse.buffer);
        process.stdout.write(
          JSON.stringify({
            ok: true,
            output: outputPath,
            bytes: clickedResponse.buffer.length,
            contentType: clickedResponse.contentType,
            sourceUrl: clickedResponse.sourceUrl,
            strategy: "clicked-response",
          }),
        );
        return;
      }
      const popupPayload = await capturePdfFromPopup(context, popup);
      if (popupPayload) {
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        await fs.writeFile(outputPath, popupPayload.buffer);
        process.stdout.write(
          JSON.stringify({
            ok: true,
            output: outputPath,
            bytes: popupPayload.buffer.length,
            contentType: popupPayload.contentType,
            sourceUrl: popupPayload.sourceUrl,
            strategy: "popup-response",
          }),
        );
        return;
      }
      if (capturedDownloads.length) {
        const clickedDownload = await consumeDownload(capturedDownloads[0]);
        if (clickedDownload) {
          await fs.mkdir(path.dirname(outputPath), { recursive: true });
          await fs.writeFile(outputPath, clickedDownload.buffer);
          process.stdout.write(
            JSON.stringify({
              ok: true,
              output: outputPath,
              bytes: clickedDownload.buffer.length,
              contentType: clickedDownload.contentType,
              sourceUrl: clickedDownload.sourceUrl,
              strategy: "clicked-download",
            }),
          );
          return;
        }
      }
    }

    const pdfCandidates = await findPdfCandidates(page, targetUrl);
    for (const candidateUrl of pdfCandidates) {
      const sessionPayload = await fetchPdfWithBrowserSession(
        context,
        candidateUrl,
      ).catch(() => null);
      if (sessionPayload) {
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        await fs.writeFile(outputPath, sessionPayload.buffer);
        process.stdout.write(
          JSON.stringify({
            ok: true,
            output: outputPath,
            bytes: sessionPayload.buffer.length,
            contentType: sessionPayload.contentType,
            sourceUrl: sessionPayload.sourceUrl,
            strategy:
              candidateUrl === targetUrl
                ? "session-fetch-target"
                : "session-fetch-candidate",
          }),
        );
        return;
      }
      const payload = await fetchPdfBase64(page, candidateUrl).catch(() => null);
      if (!payload) {
        continue;
      }
      const buffer = Buffer.from(payload.base64, "base64");
      if (!looksLikePdfBytes(buffer, payload.contentType)) {
        continue;
      }
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, buffer);
      process.stdout.write(
        JSON.stringify({
          ok: true,
          output: outputPath,
          bytes: payload.length,
          contentType: payload.contentType || "application/pdf",
          sourceUrl: payload.finalUrl || candidateUrl,
          strategy: candidateUrl === targetUrl ? "fetch-target" : "fetch-candidate",
        }),
      );
      return;
    }

    throw new Error("No PDF payload could be recovered from the page or its download links.");
  } finally {
    await browser.close();
  }
}

await main();
