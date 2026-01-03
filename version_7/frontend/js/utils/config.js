export const API_URL = "";
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
export const WS_URL = `${protocol}//${window.location.host}/ws`;