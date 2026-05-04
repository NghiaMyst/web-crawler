import { z } from 'zod';

// Categories from SCHEMA.md sources table category column.
export const sourceCategoryEnum = z.enum(['game', 'football', 'anime', 'manga', 'music']);
export const crawlerTypeEnum = z.enum(['cheerio', 'playwright']);

export const sourceSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  displayName: z.string().min(1, 'Display name is required').max(100, 'Display name too long'),
  url: z.string().url('Must be a valid URL'),
  category: sourceCategoryEnum,
  parserKey: z.string().min(1, 'Parser key is required').max(50),
  crawlerType: crawlerTypeEnum,
  crawlInterval: z.coerce.number().int().min(60, 'Minimum 60 seconds').max(86400, 'Maximum 24 hours'),
  priority: z.coerce.number().int().min(1).max(10),
  isActive: z.boolean(),
});

export type SourceFormData = z.infer<typeof sourceSchema>;

// For edit operations, the API only accepts a subset (UpdateSourceRequest):
export const sourceUpdateSchema = sourceSchema
  .pick({ displayName: true, url: true, crawlInterval: true, priority: true, isActive: true })
  .partial();

export type SourceUpdateFormData = z.infer<typeof sourceUpdateSchema>;
