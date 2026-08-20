// Runtime configuration for zm-dashboard. Loaded by index.html before the app.
//
// Leave empty to call the API at /api/v3 on the same origin (reverse-proxied).
// To point the UI elsewhere set `apiBase`, e.g.
//   window.__ZM_CONFIG__ = { apiBase: 'https://zm.example.net/api/v3' };
// The Docker image regenerates this file from ZM_API_BASE on every start.
window.__ZM_CONFIG__ = {};
