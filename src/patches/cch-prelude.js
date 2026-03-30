// cch billing hash sanitizer — injected into the claude cli bundle at launch time.
// normalizes cch=<5 hex char> tokens in /v1/messages request bodies to prevent
// upstream cache-busting hash drift from invalidating the prompt cache.
//
// this file is read by cli-patches.ts and injected after the hashbang.
// it runs as a self-contained iife — no imports, no typescript, no module system.
// the __CCH_FIXED_VALUE__ placeholder is replaced at injection time.

(() => {
  const patchMarker = Symbol.for("ccc.cch-request-sanitizer.installed");
  if (globalThis[patchMarker]) return;
  globalThis[patchMarker] = true;

  const cchMatcher = /\bcch=[\da-f]{5}\b/i;
  const cchPattern = /\bcch=[\da-f]{5}\b/gi;
  const replacement = "__CCH_FIXED_VALUE__";

  const sanitizeString = (value) => {
    if (typeof value !== "string" || !cchMatcher.test(value)) return value;
    return value.replace(cchPattern, replacement);
  };

  const sanitizeValue = (value) => {
    if (typeof value === "string") return sanitizeString(value);

    if (Array.isArray(value)) {
      let changed = false;
      const next = value.map((item) => {
        const sanitized = sanitizeValue(item);
        if (sanitized !== item) changed = true;
        return sanitized;
      });
      return changed ? next : value;
    }

    if (!value || typeof value !== "object") return value;

    let changed = false;
    const next = Object.fromEntries(
      Object.entries(value).map(([key, child]) => {
        const sanitized = sanitizeValue(child);
        if (sanitized !== child) changed = true;
        return [key, sanitized];
      }),
    );

    return changed ? next : value;
  };

  const sanitizeBody = (body) => {
    if (typeof body !== "string" || !cchMatcher.test(body)) return body;

    try {
      return JSON.stringify(sanitizeValue(JSON.parse(body)));
    } catch {
      return sanitizeString(body);
    }
  };

  const getRequestUrl = (input) => {
    if (typeof input === "string") return input;
    if (typeof URL !== "undefined" && input instanceof URL) return input.toString();
    if (typeof Request !== "undefined" && input instanceof Request) return input.url;
    if (input && typeof input === "object" && "url" in input) return String(input.url);
    return "";
  };

  const isMessagesRequest = (input) => getRequestUrl(input).includes("/v1/messages");
  const originalFetch = globalThis.fetch?.bind(globalThis);
  if (!originalFetch) return;

  globalThis.fetch = async (input, init) => {
    if (!isMessagesRequest(input)) return originalFetch(input, init);

    if (typeof init?.body === "string") {
      const sanitizedBody = sanitizeBody(init.body);
      if (sanitizedBody === init.body) return originalFetch(input, init);
      return originalFetch(input, { ...init, body: sanitizedBody });
    }

    if (typeof Request !== "undefined" && input instanceof Request) {
      try {
        const requestBody = await input.clone().text();
        const sanitizedBody = sanitizeBody(requestBody);
        if (sanitizedBody === requestBody) return originalFetch(input, init);

        if (init) return originalFetch(input, { ...init, body: sanitizedBody });
        return originalFetch(new Request(input, { body: sanitizedBody }));
      } catch {
        return originalFetch(input, init);
      }
    }

    return originalFetch(input, init);
  };
})();
