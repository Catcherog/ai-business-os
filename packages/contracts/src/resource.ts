import { z } from 'zod';
import { IsoDateTimeSchema } from './common.js';

const BusinessIdSchema = z.string().trim().min(1);

export const RESOURCE_TYPES = [
  'MODEL',
  'MAKEUP',
  'PHOTOGRAPHER',
  'STUDIO',
  'COSTUME',
  'RETOUCH',
  'PROP',
  'OTHER',
] as const;
export const ResourceTypeSchema = z.enum(RESOURCE_TYPES);
export type ResourceType = z.infer<typeof ResourceTypeSchema>;

export const COOPERATION_STATUSES = ['ACTIVE', 'INACTIVE', 'PENDING', 'UNKNOWN'] as const;
export const CooperationStatusSchema = z.enum(COOPERATION_STATUSES);
export type CooperationStatus = z.infer<typeof CooperationStatusSchema>;
export const ResourceStatusSchema = CooperationStatusSchema;
export type ResourceStatus = CooperationStatus;

/** Storage-agnostic resource master record. */
export const ResourceSchema = z
  .object({
    resource_key: BusinessIdSchema,
    resource_id: BusinessIdSchema.nullable(),
    resource_type: ResourceTypeSchema,
    name: z.string().min(1),
    xiaohongshu_name: z.string().nullable(),
    xiaohongshu_profile_url: z.string().nullable(),
    wechat: z.string().nullable(),
    phone: z.string().nullable(),
    city: z.string().nullable(),
    address: z.string().nullable(),
    styles: z.string().nullable(),
    size_raw: z.string().nullable(),
    quote_raw: z.string().nullable(),
    quote_min: z.number().min(0).nullable(),
    quote_max: z.number().min(0).nullable(),
    priority: z.number().nullable(),
    cooperation_status: CooperationStatusSchema,
    rating: z.number().min(0).max(5).nullable(),
    availability_raw: z.string().nullable(),
    work_url: z.string().nullable(),
    source_aliases_json: z.string().nullable(),
    migration_key: BusinessIdSchema,
    legacy_updated_at: IsoDateTimeSchema.nullable(),
  })
  .strict();

export type Resource = z.infer<typeof ResourceSchema>;
