/**
 * Static server that reproduces the Vercel deployment locally.
 *
 * `serve dist` and `vite preview` both ignore `vercel.json`, so neither the
 * security headers nor the SPA rewrites are applied, and a page can pass locally
 * yet break once deployed. Two resources are blocked only under the real CSP: a
 * Google Fonts stylesheet pulled in by `@solana/wallet-adapter-react-ui`, and a
 * Google Analytics script pulled in by `@aptos-labs/wallet-adapter-core`.
 *
 * Headers and rewrites are read from `vercel.json` at startup rather than copied,
 * so this cannot drift from what Vercel actually serves.
 */

import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(HERE, "../..");
const DIST = resolve(REPO_ROOT, "dist");
const VERCEL_JSON = resolve(REPO_ROOT, "vercel.json");

interface VercelHeaderRule {
  source: string;
  headers: { key: string; value: string }[];
}

interface VercelRewriteRule {
  source: string;
  destination: string;
}

interface VercelConfig {
  headers?: VercelHeaderRule[];
  rewrites?: VercelRewriteRule[];
  trailingSlash?: boolean;
}

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
};

/**
 * Converts a Vercel `source` pattern (`/app/:path*`, `/(.*)`) into a RegExp.
 *
 * Placeholders are substituted before escaping, not after. Escaping first turns
 * `(.*)` into `\(\.\*\)`, which no later replacement matches, and the rule then
 * silently matches nothing.
 */
function sourceToRegExp(source: string): RegExp {
  const WILDCARD = "\u0000w"; // (.*) and :name*, crossing path separators
  const SEGMENT = "\u0000s"; // :name, one path segment

  const tokenised = source
    .replace(/\(\.\*\)/g, WILDCARD)
    .replace(/:\w+\*/g, WILDCARD)
    .replace(/:\w+/g, SEGMENT);

  const escaped = tokenised.replace(/[.+^${}()|[\]\\?*]/g, "\\$&");

  const pattern = escaped.split(WILDCARD).join(".*").split(SEGMENT).join("[^/]+");
  return new RegExp(`^${pattern}$`);
}

function loadConfig(): VercelConfig {
  return JSON.parse(readFileSync(VERCEL_JSON, "utf8")) as VercelConfig;
}

/**
 * Resolves a URL path to a file on disk, applying Vercel's ordering: the
 * filesystem wins, and rewrites are only a fallback for what it does not serve.
 */
function resolveFile(urlPath: string, rewrites: VercelRewriteRule[]): string | null {
  const clean = normalize(decodeURIComponent(urlPath.split("?")[0] ?? "/")).replace(
    /^(\.\.[/\\])+/,
    ""
  );

  const direct = join(DIST, clean);
  if (existsSync(direct) && statSync(direct).isFile()) return direct;

  const asIndex = join(DIST, clean, "index.html");
  if (existsSync(asIndex) && statSync(asIndex).isFile()) return asIndex;

  for (const rule of rewrites) {
    if (sourceToRegExp(rule.source).test(clean)) {
      const target = join(DIST, rule.destination);
      if (existsSync(target) && statSync(target).isFile()) return target;
    }
  }

  return null;
}

export function startCspServer(port: number): Promise<{ url: string; close: () => Promise<void> }> {
  const config = loadConfig();
  const headerRules = (config.headers ?? []).map((rule) => ({
    match: sourceToRegExp(rule.source),
    headers: rule.headers,
  }));
  const rewrites = config.rewrites ?? [];

  const server = createServer((req, res) => {
    const urlPath = req.url ?? "/";

    // One bad request must not take the server down. An uncaught throw here,
    // for example a malformed percent-escape reaching decodeURIComponent, ends
    // the process and every later test fails with ECONNREFUSED rather than
    // pointing at its own cause.
    let file: string | null;
    let requestPath: string;
    try {
      file = resolveFile(urlPath, rewrites);
      // Vercel applies header rules by URL path, not by the file finally served.
      requestPath = normalize(decodeURIComponent(urlPath.split("?")[0] ?? "/"));
    } catch {
      res.statusCode = 400;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end(`400 Bad Request: ${urlPath}`);
      return;
    }

    for (const rule of headerRules) {
      if (rule.match.test(requestPath)) {
        for (const { key, value } of rule.headers) res.setHeader(key, value);
      }
    }

    if (!file) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end(`404 Not Found: ${urlPath}`);
      return;
    }

    res.statusCode = 200;
    res.setHeader(
      "Content-Type",
      MIME_TYPES[extname(file).toLowerCase()] ?? "application/octet-stream"
    );
    const stream = createReadStream(file);
    stream.on("error", () => {
      res.statusCode = 500;
      res.end("500 Internal Server Error");
    });
    stream.pipe(res);
  });

  server.on("clientError", (_err, socket) => {
    socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
  });

  return new Promise((resolvePromise) => {
    server.listen(port, "127.0.0.1", () => {
      resolvePromise({
        url: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => {
              done();
            });
          }),
      });
    });
  });
}

// Run directly (`pnpm -F e2e serve`) to browse dist/ with the production headers.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const port = Number(process.env.PORT ?? 8800);
  if (!existsSync(DIST)) {
    console.error(`dist/ not found at ${DIST}. Run "pnpm build:site" first.`);
    process.exit(1);
  }
  void startCspServer(port).then(({ url }) => {
    console.log(`Serving ${DIST} with vercel.json headers + rewrites at ${url}`);
  });
}
