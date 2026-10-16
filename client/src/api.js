export async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, options);
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) throw new Error(payload?.error || `Request failed (${response.status})`);
  return payload;
}

export const jsonBody = (value) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(value)
});

export const dateLabel = (value) => {
  if (!value) return 'Date unknown';
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return 'Date unknown';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

export const timeAgo = (value) => {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'just now';
  const delta = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return dateLabel(value);
};

export const imageUrl = (url) => {
  if (!url) return '';
  if (/^https?:\/\//i.test(url) || url.startsWith('data:') || url.startsWith('blob:')) return url;
  return url.startsWith('/') ? url : `/${url}`;
};
