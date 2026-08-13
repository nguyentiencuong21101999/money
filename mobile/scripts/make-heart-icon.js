// Sinh icon hình trái tim (1024×1024 PNG) không cần thư viện ngoài — chỉ dùng
// zlib có sẵn trong Node. Chạy: node scripts/make-heart-icon.js
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const SIZE = 1024;

// Nền gradient hồng → tím, trái tim trắng hơi bóng. Đọc rõ cả ở cỡ icon nhỏ.
function bgColor(y) {
  const t = y / SIZE;
  return [
    Math.round(0xff * (1 - t) + 0xc0 * t),
    Math.round(0x5a * (1 - t) + 0x22 * t),
    Math.round(0x7a * (1 - t) + 0x8a * t),
  ];
}

// Phương trình ẩn của trái tim: (x²+y²−1)³ − x²y³ ≤ 0.
function insideHeart(nx, ny) {
  const x = nx * 1.6;
  const y = -ny * 1.6;
  const a = x * x + y * y - 1;
  return a * a * a - x * x * y * y * y <= 0;
}

const raw = Buffer.alloc(SIZE * (1 + SIZE * 4)); // mỗi hàng: 1 byte filter + RGBA
let p = 0;
for (let y = 0; y < SIZE; y++) {
  raw[p++] = 0; // filter type 0 (None)
  const [br, bg, bb] = bgColor(y);
  for (let x = 0; x < SIZE; x++) {
    const nx = (x / SIZE) * 2 - 1;
    const ny = (y / SIZE) * 2 - 1;
    // Đẩy tim xuống một chút cho cân giữa khung.
    const inside = insideHeart(nx, ny + 0.15);
    if (inside) {
      raw[p++] = 0xff;
      raw[p++] = 0xf2;
      raw[p++] = 0xf6;
      raw[p++] = 0xff;
    } else {
      raw[p++] = br;
      raw[p++] = bg;
      raw[p++] = bb;
      raw[p++] = 0xff;
    }
  }
}

// --- Đóng gói PNG tối giản ---
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
})();

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(CRC(body), 0);
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const outDir = path.resolve(__dirname, "../assets");
for (const name of ["icon.png", "favicon.png", "splash-icon.png"]) {
  fs.writeFileSync(path.join(outDir, name), png);
}
console.log(`Đã ghi icon trái tim ${SIZE}×${SIZE} (${png.length} bytes) vào assets/`);
