/**
 * Đo bảng màu thay vì ước lượng bằng mắt.
 *
 * Hai câu hỏi mà mắt thường trả lời sai:
 *   1. Chữ trên nền này có đủ tương phản để đọc không (WCAG cần 4.5 cho chữ
 *      thường, 3.0 cho mảng màu lớn như cột biểu đồ)?
 *   2. Hai màu đứng cạnh nhau trong biểu đồ, người mù màu có phân biệt được
 *      không? Khoảng 8% nam giới không thấy trục đỏ-lục.
 *
 * Chạy: node scripts/validate-palette.mjs
 */

// ---------------------------------------------------------------- sRGB cơ bản

const hex = (h) => {
  const n = parseInt(h.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** sRGB 0-255 → tuyến tính 0-1. Bước bắt buộc: mọi phép trộn và đo sáng đều
 *  phải làm trên không gian tuyến tính, cộng thẳng số hex là sai. */
const toLinear = (c) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

const toSrgb = (l) => {
  const s = l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(s * 255)));
};

const luminance = ([r, g, b]) =>
  0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

/** Tỉ số tương phản WCAG 2.x. */
const contrast = (a, b) => {
  const [x, y] = [luminance(hex(a)), luminance(hex(b))].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

/** Phủ màu `fg` mờ alpha lên nền `bg` đục — trộn trong không gian tuyến tính. */
const over = (fg, bg, alpha) => {
  const [f, b] = [hex(fg), hex(bg)];
  return (
    "#" +
    [0, 1, 2]
      .map((i) => toSrgb(alpha * toLinear(f[i]) + (1 - alpha) * toLinear(b[i])))
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
  );
};

// ------------------------------------------------------------------ CIELAB ΔE

/** sRGB → Lab (D65). Lab mới là nơi "khoảng cách" xấp xỉ đúng cảm nhận mắt;
 *  đo khoảng cách thẳng trong RGB cho ra kết quả vô nghĩa. */
const toLab = ([r, g, b]) => {
  const [R, G, B] = [toLinear(r), toLinear(g), toLinear(b)];
  const x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

/**
 * CIEDE2000. Dài dòng nhưng không thay bằng khoảng cách Euclid trong Lab được:
 * Euclid thổi phồng chênh lệch ở vùng bão hoà cao, đúng vùng mà cặp màu biểu đồ
 * đang nằm — đo kiểu đó thì cặp nào cũng "đạt".
 */
const deltaE = (x, y) => {
  const [L1, A1, B1] = toLab(hex(x));
  const [L2, A2, B2] = toLab(hex(y));

  const C1 = Math.hypot(A1, B1);
  const C2 = Math.hypot(A2, B2);
  const cBar = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(cBar ** 7 / (cBar ** 7 + 25 ** 7)));

  const a1 = (1 + G) * A1;
  const a2 = (1 + G) * A2;
  const c1 = Math.hypot(a1, B1);
  const c2 = Math.hypot(a2, B2);

  const hue = (b, a) => (a === 0 && b === 0 ? 0 : (deg(Math.atan2(b, a)) + 360) % 360);
  const h1 = hue(B1, a1);
  const h2 = hue(B2, a2);

  const dL = L2 - L1;
  const dC = c2 - c1;

  let dh = 0;
  if (c1 * c2 !== 0) {
    dh = h2 - h1;
    if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
  }
  const dH = 2 * Math.sqrt(c1 * c2) * Math.sin(rad(dh) / 2);

  const lBar = (L1 + L2) / 2;
  const cBarP = (c1 + c2) / 2;

  let hBar;
  if (c1 * c2 === 0) hBar = h1 + h2;
  else if (Math.abs(h1 - h2) <= 180) hBar = (h1 + h2) / 2;
  else hBar = h1 + h2 < 360 ? (h1 + h2 + 360) / 2 : (h1 + h2 - 360) / 2;

  const T =
    1 -
    0.17 * Math.cos(rad(hBar - 30)) +
    0.24 * Math.cos(rad(2 * hBar)) +
    0.32 * Math.cos(rad(3 * hBar + 6)) -
    0.2 * Math.cos(rad(4 * hBar - 63));

  const sL = 1 + (0.015 * (lBar - 50) ** 2) / Math.sqrt(20 + (lBar - 50) ** 2);
  const sC = 1 + 0.045 * cBarP;
  const sH = 1 + 0.015 * cBarP * T;

  const dTheta = 30 * Math.exp(-(((hBar - 275) / 25) ** 2));
  const rC = 2 * Math.sqrt(cBarP ** 7 / (cBarP ** 7 + 25 ** 7));
  const rT = -Math.sin(rad(2 * dTheta)) * rC;

  return Math.sqrt(
    (dL / sL) ** 2 +
      (dC / sC) ** 2 +
      (dH / sH) ** 2 +
      rT * (dC / sC) * (dH / sH),
  );
};

// -------------------------------------------------------------- Mô phỏng mù màu

/** Ma trận Machado 2009, mức nặng 1.0, áp trên RGB tuyến tính. */
const CVD = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

const simulate = (color, kind) => {
  const m = CVD[kind];
  const lin = hex(color).map(toLinear);
  return (
    "#" +
    m
      .map((row) => toSrgb(row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2]))
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
  );
};

// ------------------------------------------------------------------ Tiêu chí

/*
  Ngưỡng hiệu chỉnh theo thang của chính script này (CIEDE2000 + Machado), neo
  vào hai phán quyết đã có sẵn trong globals.css của bảng hồng cũ:
    hồng ↔ xanh dương  → chấp nhận, protan 22.6
    hồng ↔ xanh ngọc   → loại,      deutan 17.2
  Nên vạch nằm giữa hai số đó. Bản CSS cũ ghi ngưỡng 8 nhưng đo bằng thang khác
  (số của họ nhỏ hơn thang này khoảng một nửa), không bê nguyên con số sang được.
*/
const CVD_MIN = 20;
/** Mắt thường thì đòi cao hơn hẳn — hai chuỗi số liệu phải tách bạch rõ. */
const NORMAL_MIN = 30;
/** WCAG cho mảng màu lớn (cột, thanh, chấm chú giải). */
const AREA_MIN = 3;

function checkPair(expense, income, surface) {
  const rows = [
    ["ΔE mắt thường", deltaE(expense, income), NORMAL_MIN],
    ["ΔE protan", deltaE(simulate(expense, "protan"), simulate(income, "protan")), CVD_MIN],
    ["ΔE deutan", deltaE(simulate(expense, "deutan"), simulate(income, "deutan")), CVD_MIN],
    ["ΔE tritan", deltaE(simulate(expense, "tritan"), simulate(income, "tritan")), CVD_MIN],
    [`tương phản ${expense}`, contrast(expense, surface), AREA_MIN],
    [`tương phản ${income}`, contrast(income, surface), AREA_MIN],
  ];
  return { rows, pass: rows.every(([, v, min]) => v >= min) };
}

const fmt = (v) => v.toFixed(2).padStart(6);
const mark = (ok) => (ok ? "  ok" : "  FAIL");

function report(title, expense, income, surface) {
  const { rows, pass } = checkPair(expense, income, surface);
  const score = rows.filter(([, v, min]) => v >= min).length;
  console.log(`\n${title}  (${expense} ↔ ${income} trên ${surface})  ${score}/${rows.length}`);
  for (const [label, value, min] of rows) {
    console.log(`  ${label.padEnd(22)} ${fmt(value)}  cần ≥ ${String(min).padStart(2)}${mark(value >= min)}`);
  }
  return pass;
}

// ------------------------------------------------------------------- Chạy thật

const args = process.argv.slice(2);

if (args.includes("--legacy")) {
  // Đối chiếu với các con số đã ghi trong globals.css để chắc script đo đúng.
  console.log("=== Bảng hồng cũ — kiểm chứng script ===");
  report("hồng ↔ xanh dương", "#d6336c", "#2a78d6", "#fffafb");
  report("hồng ↔ xanh ngọc (đã loại)", "#d6336c", "#0f9b8e", "#fffafb");
  console.log("\n  trắng trên #c2255c:", contrast("#ffffff", "#c2255c").toFixed(2));
  process.exit(0);
}

if (args.includes("--dark")) {
  /*
    Nền tím đậm, chữ trắng. Điểm mấu chốt: ở chế độ tối, kính phải là lớp phủ
    TỐI (khói) chứ không phải lớp trắng mỏng. Trắng mỏng chồng lên vệt gradient
    sáng thì mặt thẻ sáng theo, chữ trắng hết đọc được — quét lần trước trượt
    sạch vì lý do đó.

    Trường hợp xấu nhất đảo chiều so với nền sáng: chữ trắng khó đọc nhất ở chỗ
    nền SÁNG nhất. Cột quyết định là `muted` (chữ mờ nhất).
  */
  console.log("=== Nền tối, kính khói ===");
  console.log("khói     đặc  mặt kính  trắng  ink-2  muted   tím    lục");
  const bright = over("#a855f7", "#241047", 0.75); // đỉnh sáng nhất của gradient
  console.log(`gradient chỗ sáng nhất: ${bright}\n`);
  for (const tint of ["#1a0b38", "#241047"]) {
    for (const a of [0.4, 0.5, 0.6, 0.7]) {
      const surface = over(tint, bright, a);
      const vals = [
        contrast("#ffffff", surface),
        contrast("#e4dcf7", surface),
        contrast("#c9bfe6", surface),
        contrast("#c4b5fd", surface),
        contrast("#5eead4", surface),
      ];
      const bad = vals[2] < 4.5 || vals[3] < 4.5;
      console.log(
        `${tint}  ${a.toFixed(2)} ${surface}  ` +
          vals.map(fmt).join(" ") + (bad ? "  FAIL" : ""),
      );
    }
  }
  process.exit(0);
}

if (args.includes("--tune")) {
  /*
    Quét độ đậm gradient × độ trong của kính. Muốn kính "ra kính" thì nền phải
    đậm và lớp trắng phải mỏng — nhưng đó cũng chính là hai thứ ăn mòn tương
    phản chữ. Bảng này chỉ ra vạch dừng thay vì chỉnh mò.
    Cột quyết định là `muted` (chữ mờ nhất) và cột tương phản màu xanh lục
    (màu biểu đồ yếu nhất, cần ≥ 3).
  */
  const PLANE = "#f4eeff";
  const VIOLET = "#7c3aed";
  console.log("gradient  kính   nền thẻ   muted  lục   tím");
  for (const g of [0.3, 0.4, 0.5, 0.6]) {
    for (const a of [0.5, 0.55, 0.6, 0.65, 0.72]) {
      const surface = over("#ffffff", over(VIOLET, PLANE, g), a);
      const muted = contrast("#6d6478", surface);
      const green = contrast("#059669", surface);
      const violet = contrast("#7c3aed", surface);
      const bad = muted < 4.5 || green < 3 || violet < 3;
      console.log(
        `  ${g.toFixed(2)}   ${a.toFixed(2)}  ${surface}  ${fmt(muted)} ${fmt(green)} ${fmt(violet)}${bad ? "  FAIL" : ""}`,
      );
    }
  }
  process.exit(0);
}

if (args.includes("--new")) {
  /*
    Bảng hồng cánh sen hiện hành.

    Mặt kính ở đây là số ĐO từ ảnh chụp thật, không suy ra từ công thức: công
    thức trộn alpha bỏ qua saturate() của backdrop-filter và bỏ qua vị trí thẻ
    trôi qua gradient khi cuộn, nên từng dự đoán lệch rất xa (#f2f1f4 dự đoán
    so với #d5d4d5 thực tế ở bản trước). Muốn đo lại thì chụp trang với nội dung
    bị ẩn rồi lấy pixel tối nhất trên các bề mặt .card/.glass-bar/.glass-chip.
  */
  const SURFACE = "#febee6"; // mặt kính TỐI nhất qua mọi nấc cuộn
  /*
    ACCENT là --color-expense: màu nhận diện của app (chữ, viền, nền hover) VÀ
    cũng là màu cột "tiền vào". OUTFLOW là --color-outflow, chỉ dùng cho cột
    "tiền ra". Hai vai này tách nhau nên đừng gộp lại một biến — gộp rồi thì
    dòng kiểm "chữ" sẽ đo nhầm sang màu cột và báo trượt oan.
  */
  const ACCENT = "#911ba0";
  const OUTFLOW = "#9d174d"; // = --color-danger-text, cột và số dùng chung

  console.log("=== Bảng hồng cánh sen + kính mờ ===");
  console.log(`\n  mặt kính tối nhất (đo thật): ${SURFACE}`);

  const text = [
    ["ink (chữ chính)", "#1f1023", 4.5],
    ["ink-2 (chữ phụ)", "#574560", 4.5],
    ["muted (chữ mờ)", "#5c4a64", 4.5],
    ["tím làm chữ", ACCENT, 4.5],
    ["số cộng (= tím tiền vào)", ACCENT, 4.5],
    ["số trừ", OUTFLOW, 4.5],
    ["trắng trên nút", "#ffffff", 4.5],
  ];

  let ok = true;
  console.log("\n  Chữ trên mặt kính:");
  for (const [label, color, min] of text) {
    const v = label === "trắng trên nút" ? contrast(color, "#7c1687") : contrast(color, SURFACE);
    ok &&= v >= min;
    console.log(`    ${label.padEnd(18)} ${fmt(v)}  cần ≥ ${min}${mark(v >= min)}`);
  }

  /*
    Cặp tím ↔ hồng là NGOẠI LỆ chủ dự án đã chọn sau khi được báo trước (xem
    ghi chú đầu globals.css). In đầy đủ số liệu để luôn thấy rõ mình đang đánh
    đổi cái gì, nhưng không tính vào kết quả — nếu tính thì lệnh này đỏ vĩnh
    viễn và mất luôn tác dụng cảnh báo cho mọi thứ khác. Tương phản VẪN bắt buộc.
  */
  report("Cặp biểu đồ: tím tiền vào ↔ hồng tiền ra (ngoại lệ mù màu)", OUTFLOW, ACCENT, SURFACE);
  for (const [label, color] of [["cột tiền vào", ACCENT], ["cột tiền ra", OUTFLOW]]) {
    const v = contrast(color, SURFACE);
    ok &&= v >= AREA_MIN;
    console.log(`  ${label.padEnd(22)} ${fmt(v)}  cần ≥ ${AREA_MIN}${mark(v >= AREA_MIN)}`);
  }
  process.exit(ok ? 0 : 1);
}

if (args.length >= 2) {
  const [expense, income, surface = "#ffffff"] = args;
  process.exit(report("cặp cần đo", expense, income, surface) ? 0 : 1);
}

console.log("Dùng: node scripts/validate-palette.mjs <tiền-ra> <tiền-vào> [nền]");
console.log("      node scripts/validate-palette.mjs --legacy");
