import { z } from 'zod';

export const alertConditionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('new_item') }),
  z.object({ type: z.literal('field_changed'), fieldPath: z.string().min(1, 'Field path is required') }),
  z.object({
    type: z.literal('threshold'),
    fieldPath: z.string().min(1, 'Field path is required'),
    threshold: z.coerce.number(),
  }),
]);

export const channelEnum = z.enum(['telegram', 'discord']);

export const alertRuleSchema = z.object({
  sourceId: z.string().uuid('SourceId must be a UUID'),
  name: z.string().min(1, 'Name is required').max(200, 'Name too long'),
  condition: alertConditionSchema,
  messageTpl: z.string().max(2000).optional(),
  channel: channelEnum,
  isActive: z.boolean().optional(),
});

export const alertRuleUpdateSchema = z
  .object({
    name: z.string().min(1).max(200),
    condition: alertConditionSchema,
    messageTpl: z.string().max(2000),
    channel: channelEnum,
    isActive: z.boolean(),
  })
  .partial();

export type AlertRuleFormData = z.infer<typeof alertRuleSchema>;
export type AlertRuleUpdateFormData = z.infer<typeof alertRuleUpdateSchema>;
