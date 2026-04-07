import axios from 'axios';
import * as cheerio from 'cheerio';
import { logger } from '../logger.js';

export interface CheerioResult {
  url: string;
  titleText: string;
  bodyLength: number;
  rawHtml: string;
}

// cheerioFetch — HTTP GET + Cheerio parse
// Always sets User-Agent per CONVENTIONS.md
export async function cheerioFetch(
  url: string,
  sourceId: string,
  jobId: string,
): Promise<CheerioResult> {
  const response = await axios.get<string>(url, {
    headers: {
      'User-Agent': 'PersonalCrawlerBot/1.0',
      'Accept': 'text/html,application/xhtml+xml',
    },
    timeout: 15_000,
    responseType: 'text',
  });

  const $ = cheerio.load(response.data);
  const titleText = $('title').text().trim();
  const bodyLength = response.data.length;

  logger.info('Cheerio crawl result', { url, sourceId, jobId, titleText, bodyLength });

  return { url, titleText, bodyLength, rawHtml: response.data };
}
