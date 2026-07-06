// Centralized API client
const API = '/api';

function formatApiErrorDetail(detail, fallbackStatus){
  if(typeof detail === 'string' && detail.trim()) return detail;
  if(Array.isArray(detail)){
    const messages = detail.map(item => {
      if(typeof item === 'string') return item;
      if(item && typeof item === 'object'){
        const location = Array.isArray(item.loc) ? item.loc.join('.') : '';
        const message = item.msg || JSON.stringify(item);
        return location ? `${location}: ${message}` : message;
      }
      return '';
    }).filter(Boolean);
    if(messages.length) return messages.join('; ');
  }
  if(detail && typeof detail === 'object'){
    if(typeof detail.message === 'string' && detail.message.trim()) return detail.message;
    return JSON.stringify(detail);
  }
  return `Request failed: ${fallbackStatus}`;
}

async function apiFetch(path, options = {}) {
  const res = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(formatApiErrorDetail(err.detail, res.status));
  }
  return res.json();
}

async function apiGet(path) { return apiFetch(path); }
async function apiPost(path, body) { return apiFetch(path, { method: 'POST', body: JSON.stringify(body) }); }
async function apiPut(path, body) { return apiFetch(path, { method: 'PUT', body: JSON.stringify(body) }); }
async function apiDelete(path) { return apiFetch(path, { method: 'DELETE' }); }
