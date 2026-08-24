import type { CreateFieldInput } from './feishu-client.js';

export const FEISHU_FIELD_TYPE = {
  TEXT: 1,
  NUMBER: 2,
  SELECT: 3,
  DATETIME: 5,
} as const;

export interface SchemaFieldDefinition extends CreateFieldInput {
  description: string;
  options?: readonly string[];
}

export interface SchemaTableDefinition {
  name: string;
  description: string;
  /** Existing OS tables are patched but never recreated by this bootstrap. */
  existing: boolean;
  fields: readonly SchemaFieldDefinition[];
}

const text = (field_name: string, description: string): SchemaFieldDefinition => ({
  field_name,
  type: FEISHU_FIELD_TYPE.TEXT,
  description,
});

const number = (field_name: string, description: string): SchemaFieldDefinition => ({
  field_name,
  type: FEISHU_FIELD_TYPE.NUMBER,
  description,
});

const datetime = (field_name: string, description: string): SchemaFieldDefinition => ({
  field_name,
  type: FEISHU_FIELD_TYPE.DATETIME,
  description,
});

const select = (
  field_name: string,
  options: readonly string[],
  description: string,
): SchemaFieldDefinition => ({
  field_name,
  type: FEISHU_FIELD_TYPE.SELECT,
  options,
  description,
  property: {
    options: options.map((name) => ({ name })),
  },
});

const existingTable = (
  name: string,
  fields: readonly SchemaFieldDefinition[],
  description: string,
): SchemaTableDefinition => ({ name, fields, description, existing: true });

const canonicalTable = (
  name: string,
  fields: readonly SchemaFieldDefinition[],
  description: string,
): SchemaTableDefinition => ({ name, fields, description, existing: false });

const SOURCE_CHANNELS = ['BASE', 'SHEET', 'DOCUMENT', 'COLLATOR', 'OTHER'] as const;
const RESOURCE_TYPES = [
  'MODEL',
  'MAKEUP',
  'PHOTOGRAPHER',
  'STUDIO',
  'COSTUME',
  'RETOUCH',
  'PROP',
  'OTHER',
] as const;
const CONFIDENCE = ['HIGH', 'MEDIUM', 'LOW'] as const;
const PARSE_STATUS = ['PARSED', 'UNPARSED'] as const;

export const TARGET_SCHEMA: readonly SchemaTableDefinition[] = [
  existingTable(
    '数据表',
    [],
    'Existing ingestion and lead-candidate table; no ordinary business master data is imported here.',
  ),
  existingTable(
    'Customers',
    [
      text('Migration Key', 'Deterministic migration identity for the canonical customer.'),
      text('Source Aliases JSON', 'Redacted or structured legacy source aliases.'),
      select('Source Channel', SOURCE_CHANNELS, 'Origin channel of the customer record.'),
      text('Region', 'Normalized region or city supplied by the source.'),
      text('Preferred Styles', 'Raw or normalized preferred shooting styles.'),
      text('Preferred Time Raw', 'Original free-text preferred time.'),
      text('Budget Range Raw', 'Original budget range text.'),
      text('Follow-up Notes', 'Notes retained from legacy sources.'),
      number('Shoot Count', 'Known number of shoots.'),
      datetime('Legacy Updated At', 'Latest source update timestamp.'),
    ],
    'Existing customer master table with additive migration provenance fields.',
  ),
  existingTable(
    'Projects',
    [
      text('Migration Key', 'Deterministic migration identity for the canonical project.'),
      text('Legacy Project IDs JSON', 'All legacy project identifiers retained as JSON.'),
      text('Project Name', 'Canonical project name.'),
      text('Shoot Location', 'Location supplied by the project source.'),
      text('Owner Raw', 'Original project owner value.'),
      text('Participants Raw', 'Original participant value.'),
      text('Style', 'Project style.'),
      text('Theme', 'Project theme.'),
      text('Plan URL', 'Source plan URL.'),
      text('Drive Folder URL', 'Source Drive folder URL.'),
      text('Wiki URL', 'Source Wiki URL.'),
      text('Makeup Raw', 'Original makeup requirement.'),
      text('Model Candidates Raw', 'Original model candidate value.'),
      datetime('Delivery At', 'Known delivery timestamp.'),
      datetime('Legacy Updated At', 'Latest source update timestamp.'),
    ],
    'Existing project master table with additive migration and execution fields.',
  ),
  existingTable(
    'Business Events',
    [
      text('Migration Key', 'Deterministic migration identity for the event.'),
      text('Source Table', 'Legacy source table name.'),
      text('Source Record ID', 'Legacy source record identifier.'),
      text('Source Payload Hash', 'Stable hash of the source payload.'),
    ],
    'Existing business event table with migration provenance fields.',
  ),
  existingTable(
    'Tasks',
    [],
    'Existing OS task table; canonical task fields remain frozen.',
  ),
  existingTable(
    'Evidence',
    [
      text('Migration Key', 'Deterministic migration identity for the evidence row.'),
      select('Evidence Type', ['LEGACY_METRIC_SNAPSHOT', 'LEGACY_INGESTION', 'WRITE_LOG', 'OTHER'], 'Evidence classification.'),
      text('Source Table', 'Legacy source table name.'),
      text('Source Record ID', 'Legacy source record identifier.'),
      text('Source Payload Hash', 'Stable hash of the source payload.'),
      text('Redacted Payload JSON', 'Redacted evidence payload; no credentials or contact secrets.'),
    ],
    'Existing source evidence table with additive migration fields.',
  ),
  existingTable(
    'BUSOS Asset',
    [],
    'Existing Lumen asset table; its IMAGE/LUMEN semantics remain frozen.',
  ),
  canonicalTable(
    'Resources',
    [
      text('Resource Key', 'Stable canonical resource identity.'),
      text('Resource ID', 'Legacy or canonical resource identifier.'),
      select('Resource Type', RESOURCE_TYPES, 'Canonical resource category.'),
      text('Name', 'Resource display name.'),
      text('Xiaohongshu Name', 'Xiaohongshu display name.'),
      text('Xiaohongshu Profile URL', 'Query-stripped Xiaohongshu profile URL.'),
      text('WeChat', 'Resource WeChat identifier.'),
      text('Phone', 'Resource phone number.'),
      text('City', 'Resource city.'),
      text('Address', 'Resource address.'),
      text('Styles', 'Supported styles.'),
      text('Size Raw', 'Original size information.'),
      text('Quote Raw', 'Original quote text.'),
      number('Quote Min', 'Minimum determinable quote.'),
      number('Quote Max', 'Maximum determinable quote.'),
      number('Priority', 'Operational resource priority.'),
      select('Cooperation Status', ['ACTIVE', 'INACTIVE', 'PENDING', 'UNKNOWN'], 'Cooperation state.'),
      number('Rating', 'Known resource rating.'),
      text('Availability Raw', 'Original availability text.'),
      text('Work URL', 'Portfolio or work URL.'),
      text('Source Aliases JSON', 'Source aliases retained as JSON.'),
      text('Migration Key', 'Deterministic migration identity.'),
      datetime('Legacy Updated At', 'Latest source update timestamp.'),
    ],
    'Canonical resource master table.',
  ),
  canonicalTable(
    'Resource Availability',
    [
      text('Availability ID', 'Stable availability identity.'),
      text('Resource Key', 'Canonical resource identity as text.'),
      select('Resource Type', RESOURCE_TYPES, 'Resource category.'),
      datetime('Start At', 'Start of an unambiguous availability interval.'),
      datetime('End At', 'End of an unambiguous availability interval.'),
      select('Status', ['AVAILABLE', 'UNAVAILABLE', 'HOLD', 'EXPIRED', 'UNKNOWN'], 'Availability state.'),
      select('Granularity', ['DATE', 'DATETIME', 'RANGE'], 'Temporal granularity.'),
      text('Raw Text', 'Original availability text, never overwritten.'),
      select('Parse Status', PARSE_STATUS, 'Whether dates were parsed without inference.'),
      select('Confidence', CONFIDENCE, 'Confidence of the availability interpretation.'),
      datetime('Source Updated At', 'Source update timestamp.'),
      datetime('Expires At', 'Availability expiry timestamp.'),
      text('Migration Key', 'Deterministic migration identity.'),
    ],
    'Canonical availability intervals; ambiguous natural-language ranges remain raw and UNPARSED.',
  ),
  canonicalTable(
    'Project Requirements',
    [
      text('Requirement ID', 'Stable project requirement identity.'),
      text('Project ID', 'Canonical project identity as text.'),
      select('Role Type', RESOURCE_TYPES, 'Required resource category.'),
      number('Required Count', 'Required number of resources.'),
      datetime('Date Window Start', 'Known requirement window start.'),
      datetime('Date Window End', 'Known requirement window end.'),
      number('Duration Hours', 'Required duration in hours.'),
      text('Location', 'Requirement location.'),
      text('Style Tags', 'Required style tags.'),
      text('Size Constraint', 'Raw size constraint.'),
      number('Budget Max', 'Maximum determinable budget.'),
      select('Required', ['YES', 'NO', 'UNKNOWN'], 'Whether this requirement is mandatory.'),
      text('Source Plan URL', 'Source plan URL.'),
      text('Source Excerpt', 'Source excerpt supporting the requirement.'),
      select('Parse Status', PARSE_STATUS, 'Whether requirement dates and values were parsed.'),
      select('Confidence', CONFIDENCE, 'Requirement interpretation confidence.'),
      text('Migration Key', 'Deterministic migration identity.'),
    ],
    'Canonical project requirements.',
  ),
  canonicalTable(
    'Project Assignments',
    [
      text('Assignment ID', 'Stable project assignment identity.'),
      text('Project ID', 'Canonical project identity as text.'),
      text('Resource Key', 'Canonical resource identity as text.'),
      select('Role', RESOURCE_TYPES, 'Assigned resource role.'),
      datetime('Proposed Start', 'Proposed assignment start.'),
      datetime('Proposed End', 'Proposed assignment end.'),
      select('Status', ['PROPOSED', 'CONFIRMED', 'CONFLICT', 'CANCELLED'], 'Assignment state.'),
      text('Conflict Reason', 'Human-readable conflict reason.'),
      datetime('Confirmed At', 'Confirmation timestamp.'),
      text('Source', 'Assignment source.'),
      text('Migration Key', 'Deterministic migration identity.'),
    ],
    'Canonical project-to-resource assignments.',
  ),
  canonicalTable(
    'Publish Items',
    [
      text('Publish Item ID', 'Stable publish item identity.'),
      text('Project ID', 'Canonical project identity as text.'),
      select('Platform', ['XIAOHONGSHU', 'WECHAT', 'DOUYIN', 'INSTAGRAM', 'OTHER'], 'Publishing platform.'),
      text('Account', 'Publishing account.'),
      select('Material Type', ['PHOTO', 'VIDEO', 'COPY', 'OTHER'], 'Material category.'),
      text('Title', 'Publish title.'),
      text('Copy', 'Publish copy.'),
      text('Tags', 'Publish tags.'),
      datetime('Planned At', 'Planned publish timestamp.'),
      datetime('Published At', 'Actual publish timestamp.'),
      select('Status', ['PLANNED', 'PUBLISHED', 'FAILED', 'CANCELLED'], 'Publish state.'),
      text('Publish URL', 'Published item URL.'),
      text('Metrics JSON', 'Metrics snapshot as JSON.'),
      text('Source Aliases JSON', 'Source aliases retained as JSON.'),
      text('Migration Key', 'Deterministic migration identity.'),
    ],
    'Canonical publishing operations.',
  ),
  canonicalTable(
    'Media Assets',
    [
      text('Media Asset ID', 'Stable media asset identity.'),
      text('Project ID', 'Canonical project identity as text.'),
      select('Asset Type', ['PHOTO', 'VIDEO', 'AUDIO', 'OTHER'], 'Asset category.'),
      text('Storage URI', 'Storage URI retained as text.'),
      number('Asset Count', 'Number of assets represented.'),
      datetime('Capture At', 'Capture timestamp.'),
      text('Photographer', 'Photographer value.'),
      select('Status', ['AVAILABLE', 'ARCHIVED', 'MISSING', 'OTHER'], 'Asset state.'),
      select('Adaptation Status', ['PENDING', 'ADAPTED', 'NOT_REQUIRED', 'UNKNOWN'], 'Adaptation state.'),
      text('Target Accounts', 'Target accounts.'),
      text('Published Accounts', 'Accounts where the asset was published.'),
      text('Source Aliases JSON', 'Source aliases retained as JSON.'),
      text('Migration Key', 'Deterministic migration identity.'),
    ],
    'Canonical media catalog separate from the frozen BUSOS Asset table.',
  ),
  canonicalTable(
    'Content Research',
    [
      text('Research ID', 'Stable research identity.'),
      select('Platform', ['XIAOHONGSHU', 'WECHAT', 'DOUYIN', 'INSTAGRAM', 'OTHER'], 'Research platform.'),
      text('Source URL', 'Canonical research source URL.'),
      text('Title', 'Research title.'),
      text('Copy', 'Research copy.'),
      text('Core Elements', 'Core reusable elements.'),
      text('Tags', 'Research tags.'),
      text('Metrics JSON', 'Metrics snapshot as JSON.'),
      datetime('Published At', 'Source publication timestamp.'),
      text('Reusable Points', 'Reusable points.'),
      text('Migration Key', 'Deterministic migration identity.'),
    ],
    'Canonical content research library.',
  ),
  canonicalTable(
    'Communication Scripts',
    [
      text('Script ID', 'Stable communication script identity.'),
      text('Scene', 'Communication scene.'),
      text('Audience', 'Intended audience.'),
      text('Goal', 'Communication goal.'),
      text('Body', 'Script body.'),
      text('Notes', 'Script notes.'),
      text('Effect', 'Observed or expected effect.'),
      select('Resource Type', RESOURCE_TYPES, 'Applicable resource category.'),
      select('Customer Stage', ['LEAD', 'QUALIFIED', 'BOOKED', 'COMPLETED', 'FOLLOW_UP', 'OTHER'], 'Customer lifecycle stage.'),
      datetime('Version At', 'Script version timestamp.'),
      select('Status', ['DRAFT', 'ACTIVE', 'ARCHIVED'], 'Script state.'),
      text('Source Aliases JSON', 'Source aliases retained as JSON.'),
      text('Migration Key', 'Deterministic migration identity.'),
    ],
    'Canonical communication script library.',
  ),
  canonicalTable(
    'Knowledge',
    [
      text('Knowledge ID', 'Stable knowledge identity.'),
      select('Knowledge Type', ['KNOWLEDGE_INDEX', 'SYSTEM_RULE', 'SOP_IMPROVEMENT', 'OTHER'], 'Knowledge classification.'),
      text('Title', 'Knowledge title.'),
      text('Detail', 'Knowledge detail.'),
      text('Keywords', 'Search keywords.'),
      text('Scenario', 'Applicable scenario.'),
      text('Source URL', 'Source URL.'),
      text('Owner Raw', 'Original owner value.'),
      select('Workflow Status', ['DRAFT', 'ACTIVE', 'REVIEW', 'ARCHIVED'], 'Workflow state.'),
      datetime('Due At', 'Due timestamp.'),
      datetime('Version At', 'Version timestamp.'),
      text('Migration Key', 'Deterministic migration identity.'),
    ],
    'Canonical knowledge and SOP index.',
  ),
  canonicalTable(
    'Migration Registry',
    [
      text('Migration ID', 'Stable migration registry identity.'),
      text('Run ID', 'Migration run identifier.'),
      select('Source Type', ['TARGET_BASE', 'LEGACY_BASE', 'SHEET', 'DOCUMENT', 'OTHER'], 'Source system type.'),
      text('Source Token Hash', 'Redacted stable source token hash.'),
      text('Source Table', 'Source table or sheet name.'),
      text('Source Record ID', 'Source record identifier.'),
      text('Source Business Key', 'Source business key.'),
      text('Source Payload Hash', 'Stable source payload hash.'),
      text('Target Table', 'Target canonical table name.'),
      text('Target Record ID', 'Target record identifier after write.'),
      select('Decision', ['CREATE', 'UPDATE', 'SKIP', 'NEEDS_REVIEW'], 'Migration decision.'),
      select('Confidence', CONFIDENCE, 'Migration confidence.'),
      text('Duplicate Of', 'Canonical migration key of the duplicate.'),
      text('Conflict JSON', 'Conflict details as JSON.'),
      select('Status', ['PLANNED', 'APPLIED', 'VERIFIED', 'FAILED', 'NEEDS_REVIEW'], 'Migration status.'),
      text('Error Code', 'Stable error code.'),
      text('Error Summary', 'Redacted error summary.'),
      datetime('Migrated At', 'Migration timestamp.'),
    ],
    'Canonical migration registry and audit trail.',
  ),
];

export function toCreateFieldInput(field: SchemaFieldDefinition): CreateFieldInput {
  const { field_name, type, property, description } = field;
  return { field_name, type, property, description };
}
