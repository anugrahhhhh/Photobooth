// Deteksi slot dari kanal alpha PNG template (murni).
// Setiap area transparan yang tersambung (4-tetangga) menjadi satu slot berupa kotak pembatasnya.

export function detectSlots(alpha, width, height, { threshold = 128, minAreaRatio = 0.005 } = {}) {
  const total = width * height;
  const seen = new Uint8Array(total);
  const stack = new Int32Array(total);
  const minPixels = minAreaRatio * total;
  const boxes = [];

  for (let start = 0; start < total; start++) {
    if (seen[start] || alpha[start] >= threshold) continue;
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    let count = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    while (top > 0) {
      const p = stack[--top];
      const x = p % width;
      const y = (p - x) / width;
      count++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      // Tetangga dipush satu kali saja (ditandai saat dipush), jadi stack tidak melebihi total.
      if (x > 0 && !seen[p - 1] && alpha[p - 1] < threshold) (seen[p - 1] = 1), (stack[top++] = p - 1);
      if (x < width - 1 && !seen[p + 1] && alpha[p + 1] < threshold) (seen[p + 1] = 1), (stack[top++] = p + 1);
      if (y > 0 && !seen[p - width] && alpha[p - width] < threshold) (seen[p - width] = 1), (stack[top++] = p - width);
      if (y < height - 1 && !seen[p + width] && alpha[p + width] < threshold) (seen[p + width] = 1), (stack[top++] = p + width);
    }

    if (count >= minPixels) boxes.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 });
  }

  return sortReadingOrder(boxes);
}

// Atas → bawah, lalu kiri → kanan. Slot masuk baris aktif bila y-nya di atas setengah tinggi slot pertama baris itu.
function sortReadingOrder(boxes) {
  const byY = [...boxes].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = [];
  for (const b of byY) {
    const row = rows.at(-1);
    if (row && b.y < row[0].y + row[0].h / 2) row.push(b);
    else rows.push([b]);
  }
  return rows.flatMap((row) => row.sort((a, b) => a.x - b.x));
}
