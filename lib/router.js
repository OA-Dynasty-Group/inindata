class Router {
  constructor() {
    this.routes = [];
  }

  add(method, pattern, handler) {
    const segments = pattern.split('/').filter(Boolean);
    const paramNames = [];
    const regexParts = segments.map(seg => {
      if (seg.startsWith(':')) {
        paramNames.push(seg.slice(1));
        return '([^/]+)';
      }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    });
    const regex = new RegExp('^' + regexParts.join('/') + '$');
    this.routes.push({ method: method.toUpperCase(), regex, paramNames, handler });
  }

  get(pattern, handler) { this.add('GET', pattern, handler); }
  post(pattern, handler) { this.add('POST', pattern, handler); }
  put(pattern, handler) { this.add('PUT', pattern, handler); }
  patch(pattern, handler) { this.add('PATCH', pattern, handler); }
  delete(pattern, handler) { this.add('DELETE', pattern, handler); }

  async handle(req, res, data) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const method = req.method;
    const pathname = url.pathname;

    for (const route of this.routes) {
      if (route.method !== method && route.method !== '*') continue;
      const segments = pathname.split('/').filter(Boolean);
      const match = route.regex.exec(segments.join('/'));
      if (!match) continue;

      const params = {};
      route.paramNames.forEach((name, i) => { params[name] = match[i + 1]; });

      req.urlObj = url;
      req.segments = segments;
      await route.handler(req, res, data, params);
      return true;
    }
    return false;
  }
}

module.exports = Router;
