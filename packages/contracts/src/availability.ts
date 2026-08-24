import { z } from 'zod';
import { IsoDateTimeSchema } from './common.js';
import { ResourceTypeSchema } from './resource.js';

const BusinessIdSchema = z.string().trim().min(1);

export const AVAILABILITY_STATUSES = [
  'AVAILABLE',
  'UNAVAILABLE',
  'HOLD',
  'EXPIRED',
  'UNKNOWN',
] as const;
export const AvailabilityStatusSchema = z.enum(AVAILABILITY_STATUSES);
export type AvailabilityStatus = z.infer<typeof AvailabilityStatusSchema>;

export const AVAILABILITY_GRANULARITIES = ['DATE', 'DATETIME', 'RANGE'] as const;
export const AvailabilityGranularitySchema = z.enum(AVAILABILITY_GRANULARITIES);
export type AvailabilityGranularity = z.infer<typeof AvailabilityGranularitySchema>;

export const PARSE_STATUSES = ['PARSED', 'UNPARSED'] as const;
export const ParseStatusSchema = z.enum(PARSE_STATUSES);
export type ParseStatus = z.infer<typeof ParseStatusSchema>;

export const CONFIDENCE_LEVELS = ['HIGH', 'MEDIUM', 'LOW'] as const;
export const ConfidenceSchema = z.enum(CONFIDENCE_LEVELS);
export type Confidence = z.infer<typeof ConfidenceSchema>;

export const AvailabilitySchema = z
  .object({
    availability_id: BusinessIdSchema,
    resource_key: BusinessIdSchema,
    resource_type: ResourceTypeSchema,
    start_at: IsoDateTimeSchema.nullable(),
    end_at: IsoDateTimeSchema.nullable(),
    status: AvailabilityStatusSchema,
    granularity: AvailabilityGranularitySchema,
    raw_text: z.string().min(1),
    parse_status: ParseStatusSchema,
    confidence: ConfidenceSchema,
    source_updated_at: IsoDateTimeSchema.nullable(),
    expires_at: IsoDateTimeSchema.nullable(),
    migration_key: BusinessIdSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.start_at &&
      value.end_at &&
      Date.parse(value.start_at) > Date.parse(value.end_at)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['end_at'],
        message: 'end_at must not precede start_at',
      });
    }
  });

export type AvailabilitySlot = z.infer<typeof AvailabilitySchema>;
export const AvailabilitySlotSchema = AvailabilitySchema;
