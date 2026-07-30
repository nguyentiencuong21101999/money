#!/usr/bin/env node
/**
 * Kiểm tra chuỗi model dự phòng bằng key thật.
 * Chạy: npm run check-models
 *
 * Quan trọng: script GỌI THẬT vào từng model bằng một ảnh 1x1, không chỉ đọc
 * danh sách. Vì danh sách models vẫn liệt kê những model đã ngừng nhận key mới
 * (gọi vào là 404 "no longer available to new users") — chỉ liệt kê thì báo nhầm là dùng được.
 */
import { readFileSync } from "node:fs";

/** Phải khớp với DEFAULT_MODELS trong src/app/api/scan/route.ts */
const CHAIN = [
  "gemini-3.5-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
];

/** Thử thêm mấy con này khi chuỗi chính có model hỏng. */
const BACKUPS = [
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
  "gemini-3-flash-preview",
  "gemini-2.0-flash",
];

/** PNG 1x1 — đủ để kiểm tra model có nhận input ảnh hay không. */
const PIXEL =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const API = "https://generativelanguage.googleapis.com/v1beta";

function readEnvLocal() {
  try {
    return Object.fromEntries(
      readFileSync(new URL("../.env.local", import.meta.url), "utf8")
        .split("\n")
        .map((line) => line.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/))
        .filter(Boolean)
        .map((m) => [m[1], m[2].trim()]),
    );
  } catch {
    return {};
  }
}

const env = readEnvLocal();
const apiKey = process.env.GEMINI_API_KEY || env.GEMINI_API_KEY;

if (!apiKey) {
  console.error(
    "Chưa có GEMINI_API_KEY. Điền vào .env.local rồi chạy lại (bước B1 trong CHECKLIST.md).",
  );
  process.exit(1);
}

/** Gọi thật một lượt cực nhỏ, trả về trạng thái của model. */
async function probe(model) {
  const started = Date.now();
  try {
    const response = await fetch(`${API}/models/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType: "image/png", data: PIXEL } },
              { text: "Trả lời đúng một chữ: ok" },
            ],
          },
        ],
        generationConfig: { temperature: 0, maxOutputTokens: 8 },
      }),
    });

    const ms = Date.now() - started;
    if (response.ok) return { model, state: "ok", ms };

    const detail = (await response.json())?.error?.message ?? "";
    if (response.status === 429) return { model, state: "quota", detail };
    if (response.status === 404) return { model, state: "gone", detail };
    return { model, state: "error", detail: `${response.status} ${detail}` };
  } catch (e) {
    return { model, state: "error", detail: e.message };
  }
}

const LABEL = {
  ok: (r) => `✓  ${r.model.padEnd(24)} dùng được (${(r.ms / 1000).toFixed(1)}s)`,
  quota: (r) => `⏳ ${r.model.padEnd(24)} hết quota hôm nay — mai lại dùng được`,
  gone: (r) => `✗  ${r.model.padEnd(24)} không còn nhận key mới`,
  error: (r) => `✗  ${r.model.padEnd(24)} ${r.detail?.slice(0, 70)}`,
};

console.log("\nĐang gọi thử từng model bằng 1 ảnh nhỏ…\n");
const results = await Promise.all(CHAIN.map(probe));
for (const r of results) console.log("  " + LABEL[r.state](r));

const broken = results.filter((r) => r.state === "gone" || r.state === "error");

if (broken.length === 0) {
  console.log("\nCả chuỗi đều ổn — không cần chỉnh gì.\n");
} else {
  console.log(`\n${broken.length} model trong chuỗi hỏng. Đang tìm model thay thế…\n`);
  const extra = (await Promise.all(BACKUPS.map(probe))).filter((r) => r.state === "ok");
  for (const r of extra) console.log("  " + LABEL.ok(r));

  const working = [...results, ...extra]
    .filter((r) => r.state === "ok" || r.state === "quota")
    .map((r) => r.model);

  console.log("\nDán dòng này vào .env.local:\n");
  console.log(`  GEMINI_MODELS=${working.join(",")}\n`);
}
