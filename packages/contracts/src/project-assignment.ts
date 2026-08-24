import { z } from 'zod';
import { IsoDateTimeSchema } from './common.js';
import { ResourceTypeSchema } from './resource.js';

const BusinessIdSchema = z.string().trim().min(1);

export const ASSIGNMENT_STATUSES = [
  'PROPOSED',
  'CONFIRMED',
  'CONFLICT',
  'CANCELLED',
] as const;
export const AssignmentStatusSchema = z.enum(ASSIGNMENT_STATUSES);
export type AssignmentStatus = z.infer<typeof AssignmentStatusSchema>;

export const ProjectAssignmentSchema = z
  .object({
    assignment_id: BusinessIdSchema,
    project_id: BusinessIdSchema,
    resource_key: BusinessIdSchema,
    role: ResourceTypeSchema,
    proposed_start: IsoDateTimeSchema.nullable(),
    proposed_end: IsoDateTimeSchema.nullable(),
    status: AssignmentStatusSchema,
    conflict_reason: z.string().nullable(),
    confirmed_at: IsoDateTimeSchema.nullable(),
    source: z.string().nullable(),
    migration_key: BusinessIdSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.proposed_start &&
      value.proposed_end &&
      Date.parse(value.proposed_start) > Date.parse(value.proposed_end)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['proposed_end'],
        message: 'proposed_end must not precede proposed_start',
      });
    }
  });

export type ProjectAssignment = z.infer<typeof ProjectAssignmentSchema>;
