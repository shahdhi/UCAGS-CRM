/**
 * Lightweight URL router for Supabase Edge Functions.
 * Supports path params like /my/:batchName/:sheetName/:leadId
 */

export type Handler = (req: Request, params: Record<string, string>) => Promise<Response>;

interface Route {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: Handler;
}

export class Router {
  private routes: Route[] = [];

  private add(method: string, path: string, handler: Handler) {
    // Convert :param to named capture groups
    const paramNames: string[] = [];
    const regexStr = path
      .replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_: string, name: string) => {
        paramNames.push(name);
        return '([^/]+)';
      })
      .replace(/\*/g, '.*');
    const pattern = new RegExp(`^${regexStr}$`);
    this.routes.push({ method: method.toUpperCase(), pattern, paramNames, handler });
  }

  get(path: string, handler: Handler) { this.add('GET', path, handler); return this; }
  post(path: string, handler: Handler) { this.add('POST', path, handler); return this; }
  put(path: string, handler: Handler) { this.add('PUT', path, handler); return this; }
  delete(path: string, handler: Handler) { this.add('DELETE', path, handler); return this; }
  patch(path: string, handler: Handler) { this.add('PATCH', path, handler); return this; }

  async handle(req: Request): Promise<Response | null> {
    const url = new URL(req.url);
    // Strip function prefix: /functions/v1/function-name
    let pathname = url.pathname;
    // Remove leading function path segments (Supabase adds /functions/v1/<name>)
    const fnMatch = pathname.match(/^\/functions\/v1\/[^/]+(\/.*)?$/);
    if (fnMatch) pathname = fnMatch[1] || '/';

    for (const route of this.routes) {
      if (route.method !== req.method) continue;
      const match = pathname.match(route.pattern);
      if (!match) continue;
      const params: Record<string, string> = {};
      route.paramNames.forEach((name, i) => { params[name] = decodeURIComponent(match[i + 1] ?? ''); });
      return route.handler(req, params);
    }
    return null;
  }
}
