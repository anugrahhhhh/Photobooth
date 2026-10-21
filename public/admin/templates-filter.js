// Saring daftar template menurut nama (tanpa peka huruf besar/kecil) dan status.
export function filterTemplates(list, { query = '', status = 'all' } = {}) {
  const q = query.trim().toLowerCase();
  return list.filter((t) => (status === 'all' || t.status === status) && (!q || t.name.toLowerCase().includes(q)));
}
