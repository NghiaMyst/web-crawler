import axios from 'axios';
import * as robotsParserModule from 'robots-parser';
import { connection } from '../connection.js';

// robots-parser is a CJS module; under Node16 module resolution we need .default
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const robotsParser = (robotsParserModule as any).default ?? robotsParserModule;

const CACHE_TTL_S = 86400; // 24 hours
const USER_AGENT = 'PersonalCrawlerBot/1.0';

/**
 * Check whether a URL is allowed by the target domain's robots.txt.
 *
 * Strategy (per D-03):
 *  1. Parse hostname from the URL
 *  2. Check Redis cache (key: crawl:robots:{hostname})
 *  3. On cache miss: fetch robots.txt via HTTP (timeout 5s)
 *  4. On fetch error: default to permissive (allow)
 *  5. Cache result with 24h TTL
 *  6. Parse with robots-parser and return isAllowed result
 *
 * SSRF mitigation (T-02-03): the fetch URL is always
 * `{protocol}//{hostname}/robots.txt` — derived from the validated
 * crawl URL via `new URL()`. No user-controlled path component.
 */
export async function isUrlAllowed(url: string): Promise<boolean> {
  const { hostname, protocol } = new URL(url);
  const cacheKey = `crawl:robots:${hostname}`;
  const robotsUrl = `${protocol}//${hostname}/robots.txt`;

  // Check cache first
  let robotsTxt = await connection.get(cacheKey);

  if (robotsTxt === null) {
    // Cache miss — fetch robots.txt
    try {
      const response = await axios.get<string>(robotsUrl, {
        timeout: 5000,
        responseType: 'text',
        headers: {
          'User-Agent': USER_AGENT,
        },
      });
      robotsTxt = response.data;
    } catch {
      // Failed fetch — permissive default per D-03
      robotsTxt = '';
    }

    // Cache the result (empty string also gets cached to avoid repeated failures)
    await connection.set(cacheKey, robotsTxt, 'EX', CACHE_TTL_S);
  }

  const robots = robotsParser(robotsUrl, robotsTxt);
  return robots.isAllowed(url, USER_AGENT) !== false;
}
