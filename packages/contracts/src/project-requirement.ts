import { z } from 'zod';
import { IsoDateTimeSchema } from './common.js';
import { ConfidenceSchema, ParseStatusSchema } from './availability.js';
import { ResourceTypeSchema } from './resource.js';

const BusinessIdSchema = z.string().trim().min(1);

export const REQUIRED_VALUES = ['YES', 'NO', 'UNKNOWN'] as const;
export const RequiredSchema = z.enum(REQUIRED_VALUES);
export type RequiredValue = z.infer<typeof RequiredSchema>;

export const ProjectRequirementSchema = z
  .object({
    requirement_id: BusinessIdSchema,
    project_id: BusinessIdSchema,
    role_type: ResourceTypeSchema,
    required_count: z.number().int().min(0),
    date_window_start: IsoDateTimeSchema.nullable(),
    date_window_end: IsoDateTimeSchema.nullable(),
    duration_hours: z.number().min(0).nullable(),
    location: z.string().nullable(),
    style_tags: z.string().nullable(),
    size_constraint: z.string().nullable(),
    budget_max: z.number().min(0).nullable(),
    required: RequiredSchema,
    source_plan_url: z.string().nullable(),
    source_excerpt: z.string().nullable(),
    parse_status: ParseStatusSchema,
    confidence: ConfidenceSchema,
    migration_key: BusinessIdSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.date_window_start &&
      value.date_window_end &&
      Date.parse(value.date_window_start) > Date.parse(value.date_window_end)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['date_window_end'],
        message: 'date_window_end must not precede date_window_start',
      });
    }
  });

export type ProjectRequirement = z.infer<typeof ProjectRequirementSchema>;
