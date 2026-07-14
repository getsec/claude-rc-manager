export function deriveName(url) {
  const last = String(url).replace(/\/+$/, '').split(/[/:]/).pop() || '';
  return last.replace(/\.git$/, '');
}

export function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
