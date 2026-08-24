import { z } from 'zod';
import { IsoDateTimeSchema } from './common.js';

const BusinessIdSchema = z.string().trim().min(1);

export const PUBLISH_PLATFORMS = [
  'XIAOHONGSHU',
  'WECHAT',
  'DOUYIN',
  'INSTAGRAM',
  'OTHER',
] as const;
export const PublishPlatformSchema = z.enum(PUBLISH_PLATFORMS);
export type PublishPlatform = z.infer<typeof PublishPlatformSchema>;

export const MATERIAL_TYPES = ['PHOTO', 'VIDEO', 'COPY', 'OTHER'] as const;
export const MaterialTypeSchema = z.enum(MATERIAL_TYPES);
export type MaterialType = z.infer<typeof MaterialTypeSchema>;

export const PUBLISH_STATUSES = ['PLANNED', 'PUBLISHED', 'FAILED', 'CANCELLED'] as const;
export const PublishStatusSchema = z.enum(PUBLISH_STATUSES);
export type PublishStatus = z.infer<typeof PublishStatusSchema>;

export const PublishItemSchema = z
  .object({
    publish_item_id: BusinessIdSchema,
    project_id: BusinessIdSchema,
    platform: PublishPlatformSchema,
    account: z.string().nullable(),
    material_type: MaterialTypeSchema,
    title: z.string().nullable(),
    copy: z.string().nullable(),
    tags: z.string().nullable(),
    planned_at: IsoDateTimeSchema.nullable(),
    published_at: IsoDateTimeSchema.nullable(),
    status: PublishStatusSchema,
    publish_url: z.string().nullable(),
    metrics_json: z.string().nullable(),
    source_aliases_json: z.string().nullable(),
    migration_key: BusinessIdSchema,
  })
  .strict();

export type PublishItem = z.infer<typeof PublishItemSchema>;
