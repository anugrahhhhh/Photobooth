// Chip filter jumlah slot: null = "Semua", lalu jumlah unik naik.
export function slotCountChips(templates) {
  const counts = [...new Set(templates.map((t) => t.slots.length))].sort((a, b) => a - b);
  return [null, ...counts];
}

export function filterBySlots(templates, count) {
  return count == null ? templates : templates.filter((t) => t.slots.length === count);
}
