const BLOCK_NESTING_RELATION_KEYS = [
  'parent',
  'ancestor',
  'allowedBlocks',
] as const;

type BlockNestingRelationKey = (typeof BLOCK_NESTING_RELATION_KEYS)[number];

export type BlockInnerBlocksTemplateAttributes = Readonly<Record<string, unknown>>;

export type BlockInnerBlocksTemplateItem = readonly [
  blockName: string,
  attributes?: BlockInnerBlocksTemplateAttributes,
  innerBlocks?: BlockInnerBlocksTemplate,
];

export type BlockInnerBlocksTemplate = readonly BlockInnerBlocksTemplateItem[];

export type BlockInnerBlocksTemplateContract = Readonly<
  Record<string, BlockInnerBlocksTemplate>
>;

export interface BlockNestingRule {
  ancestor?: readonly string[];
  allowedBlocks?: readonly string[];
  parent?: readonly string[];
  template?: BlockInnerBlocksTemplate;
}

export type BlockNestingContract = Readonly<Record<string, BlockNestingRule>>;

export interface ValidateBlockNestingContractOptions {
  allowExternalBlockNames?: boolean;
  knownBlockNames?: readonly string[];
}

interface NormalizedBlockNestingRule {
  ancestor?: string[];
  allowedBlocks?: string[];
  parent?: string[];
}

type NormalizedBlockInnerBlocksTemplateItem = [
  blockName: string,
  attributes?: Record<string, unknown>,
  innerBlocks?: NormalizedBlockInnerBlocksTemplate,
];

type NormalizedBlockInnerBlocksTemplate = NormalizedBlockInnerBlocksTemplateItem[];

interface KnownBlockNameValidationContext {
  allowExternalBlockNames: boolean;
  knownBlockNames: ReadonlySet<string>;
  knownBlockNamespaces: ReadonlySet<string>;
}

export interface ValidateInnerBlocksTemplatesOptions
  extends ValidateBlockNestingContractOptions {
  nesting?: BlockNestingContract;
}

export interface RenderInnerBlocksTemplateModuleOptions {
  exportName?: string;
}

export type BlockPatternNestingDiagnosticSeverity = 'error' | 'warning';

export type BlockPatternNestingDiagnosticCode =
  | 'disallowed-child-block'
  | 'invalid-block-ancestor'
  | 'invalid-block-parent'
  | 'invalid-block-pattern-attributes'
  | 'invalid-block-pattern-comment'
  | 'unbalanced-block-pattern-comment'
  | 'unknown-block';

export interface ParsedBlockPatternBlock {
  attributes: Record<string, unknown>;
  blockName: string;
  innerBlocks: ParsedBlockPatternBlock[];
}

export interface BlockPatternNestingDiagnostic {
  blockName?: string;
  blockPath?: string;
  code: BlockPatternNestingDiagnosticCode;
  message: string;
  patternFile?: string;
  severity: BlockPatternNestingDiagnosticSeverity;
}

export interface ValidateBlockPatternContentNestingOptions
  extends ValidateBlockNestingContractOptions {
  nesting: BlockNestingContract;
  patternFile?: string;
}

export interface ValidateBlockPatternContentNestingResult {
  blocks: ParsedBlockPatternBlock[];
  diagnostics: BlockPatternNestingDiagnostic[];
  errors: BlockPatternNestingDiagnostic[];
  warnings: BlockPatternNestingDiagnostic[];
}

const TYPESCRIPT_IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/u;
const WORDPRESS_BLOCK_COMMENT_PATTERN = /<!--([\s\S]*?)-->/gu;

function quoteTypeScriptString(value: string): string {
  let escaped = '';

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    const character = value[index] ?? '';

    switch (character) {
      case '\\':
        escaped += '\\\\';
        break;
      case "'":
        escaped += "\\'";
        break;
      case '\b':
        escaped += '\\b';
        break;
      case '\f':
        escaped += '\\f';
        break;
      case '\n':
        escaped += '\\n';
        break;
      case '\r':
        escaped += '\\r';
        break;
      case '\t':
        escaped += '\\t';
        break;
      case '\v':
        escaped += '\\v';
        break;
      default:
        if (
          code < 0x20 ||
          code === 0x2028 ||
          code === 0x2029 ||
          (code >= 0xd800 && code <= 0xdfff)
        ) {
          escaped += `\\u${code.toString(16).padStart(4, '0')}`;
        } else {
          escaped += character;
        }
    }
  }

  return `'${escaped}'`;
}

function indentTypeScriptValue(value: string, spaces: number): string {
  const indentation = ' '.repeat(spaces);
  return value
    .split('\n')
    .map((line) => `${indentation}${line}`)
    .join('\n');
}

function renderTypeScriptValue(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string') {
    return quoteTypeScriptString(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(
        'TypeScript value rendering requires finite numbers.',
      );
    }
    return String(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]';
    }
    const renderedEntries = value.map((entry) => renderTypeScriptValue(entry));
    const compact = `[${renderedEntries.join(', ')}]`;
    if (
      compact.length <= 80 &&
      renderedEntries.every((entry) => !entry.includes('\n'))
    ) {
      return compact;
    }
    return `[\n${renderedEntries
      .map((entry) => `${indentTypeScriptValue(entry, 2)},`)
      .join('\n')}\n]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return '{}';
    }
    return `{\n${entries
      .map(([key, entry]) => {
        if (entry === undefined) {
          throw new TypeError(
            'TypeScript value rendering does not accept undefined properties.',
          );
        }
        const renderedKey = TYPESCRIPT_IDENTIFIER_PATTERN.test(key)
          ? key
          : quoteTypeScriptString(key);
        const renderedValue = renderTypeScriptValue(entry);
        const [firstLine = '', ...remainingLines] = renderedValue.split('\n');
        const lines = [
          `  ${renderedKey}: ${firstLine}`,
          ...remainingLines.map((line) => `  ${line}`),
        ];
        lines[lines.length - 1] = `${lines[lines.length - 1] ?? ''},`;
        return lines.join('\n');
      })
      .join('\n')}\n}`;
  }

  throw new TypeError(`Unsupported TypeScript value type: ${typeof value}.`);
}

function hasOwn(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function formatKnownBlockNames(knownBlockNames: ReadonlySet<string>): string {
  return [...knownBlockNames].sort().join(', ');
}

function getBlockNamespace(blockName: string): string {
  return blockName.slice(0, blockName.indexOf('/'));
}

function assertBlockName(name: string, context: string): void {
  if (name.length === 0 || name !== name.trim() || !name.includes('/')) {
    throw new Error(`${context} must be a non-empty namespaced block name.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertJsonSerializable(
  value: unknown,
  context: string,
  seen = new Set<object>(),
): void {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error(`${context} must be JSON-serializable.`);
  }

  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return;
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      throw new Error(
        `${context} must be JSON-serializable and must not contain circular references.`,
      );
    }
    seen.add(value);
    value.forEach((item, index) => {
      assertJsonSerializable(item, `${context}[${index}]`, seen);
    });
    seen.delete(value);
    return;
  }

  if (isRecord(value)) {
    if (seen.has(value)) {
      throw new Error(
        `${context} must be JSON-serializable and must not contain circular references.`,
      );
    }
    seen.add(value);
    for (const [key, item] of Object.entries(value)) {
      assertJsonSerializable(item, `${context}.${key}`, seen);
    }
    seen.delete(value);
    return;
  }

  throw new Error(`${context} must be JSON-serializable.`);
}

function normalizeRelationList(
  value: unknown,
  context: string,
): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${context} must be an array of block names.`);
  }

  const seen = new Set<string>();
  return value.map((item, index) => {
    if (typeof item !== 'string') {
      throw new Error(`${context}[${index}] must be a block name string.`);
    }
    assertBlockName(item, `${context}[${index}]`);
    if (seen.has(item)) {
      throw new Error(`${context} must not contain duplicate block "${item}".`);
    }
    seen.add(item);
    return item;
  });
}

function normalizeInnerBlocksTemplate(
  value: unknown,
  context: string,
): NormalizedBlockInnerBlocksTemplate {
  if (!Array.isArray(value)) {
    throw new Error(
      `${context} must be an array of InnerBlocks template tuples.`,
    );
  }

  return value.map((item, index) => {
    const itemContext = `${context}[${index}]`;
    if (!Array.isArray(item) || item.length < 1 || item.length > 3) {
      throw new Error(
        `${itemContext} must be an InnerBlocks tuple: [blockName, attributes?, innerBlocks?].`,
      );
    }

    const blockName = item[0];
    if (typeof blockName !== 'string') {
      throw new Error(`${itemContext}[0] must be a block name string.`);
    }
    assertBlockName(blockName, `${itemContext}[0]`);

    const normalizedItem: NormalizedBlockInnerBlocksTemplateItem = [blockName];
    if (item.length >= 2) {
      const attributes = item[1];
      if (!isRecord(attributes)) {
        throw new Error(`${itemContext}[1] must be a template attributes object.`);
      }
      assertJsonSerializable(attributes, `${itemContext}[1]`);
      normalizedItem[1] = attributes;
    }
    if (item.length === 3) {
      normalizedItem[2] = normalizeInnerBlocksTemplate(
        item[2],
        `${itemContext}[2]`,
      );
    }

    return normalizedItem;
  });
}

function normalizeBlockNestingRule(
  blockName: string,
  rule: unknown,
): NormalizedBlockNestingRule {
  if (!isRecord(rule)) {
    throw new Error(`Block nesting rule for "${blockName}" must be an object.`);
  }

  const normalized: NormalizedBlockNestingRule = {};
  for (const key of BLOCK_NESTING_RELATION_KEYS) {
    if (!hasOwn(rule, key)) {
      continue;
    }

    normalized[key] = normalizeRelationList(
      (rule as Record<string, unknown>)[key],
      `Block nesting rule "${blockName}".${key}`,
    );
  }

  if (hasOwn(rule, 'template')) {
    normalizeInnerBlocksTemplate(
      (rule as Record<string, unknown>).template,
      `Block nesting rule "${blockName}".template`,
    );
  }

  return normalized;
}

function createKnownBlockNameValidationContext(
  options: ValidateBlockNestingContractOptions,
): KnownBlockNameValidationContext | null {
  if (!options.knownBlockNames) {
    return null;
  }

  const knownBlockNames = new Set(options.knownBlockNames);
  return {
    allowExternalBlockNames: options.allowExternalBlockNames === true,
    knownBlockNames,
    knownBlockNamespaces: new Set(
      [...knownBlockNames].map((blockName) => getBlockNamespace(blockName)),
    ),
  };
}

function validateKnownBlockName(
  issues: string[],
  knownBlockNameContext: KnownBlockNameValidationContext | null,
  blockName: string,
  context: string,
  options: {
    allowExternalBlockName?: boolean;
  } = {},
): void {
  if (
    !knownBlockNameContext ||
    knownBlockNameContext.knownBlockNames.has(blockName)
  ) {
    return;
  }

  const isExternalBlockName =
    options.allowExternalBlockName === true &&
    knownBlockNameContext.allowExternalBlockNames &&
    !knownBlockNameContext.knownBlockNamespaces.has(
      getBlockNamespace(blockName),
    );

  if (isExternalBlockName) {
    return;
  }

  issues.push(
    `${context} references unknown block "${blockName}". Expected one of: ${formatKnownBlockNames(
      knownBlockNameContext.knownBlockNames,
    )}.`,
  );
}

function normalizeBlockNestingContract(
  contract: BlockNestingContract,
): Record<string, NormalizedBlockNestingRule> {
  if (!isRecord(contract)) {
    throw new Error('Block nesting contract must be an object.');
  }

  return Object.fromEntries(
    Object.entries(contract).map(([blockName, rule]) => {
      assertBlockName(blockName, `Block nesting contract key "${blockName}"`);
      return [blockName, normalizeBlockNestingRule(blockName, rule)];
    }),
  );
}

export function defineBlockNesting<const Contract extends BlockNestingContract>(
  contract: Contract,
): Contract {
  validateBlockNestingContract(contract);
  return contract;
}

export function defineInnerBlocksTemplates<
  const Contract extends BlockInnerBlocksTemplateContract,
>(templates: Contract): Contract {
  validateInnerBlocksTemplates(templates);
  return templates;
}

export function validateBlockNestingContract(
  contract: BlockNestingContract,
  options: ValidateBlockNestingContractOptions = {},
): void {
  const normalized = normalizeBlockNestingContract(contract);
  const knownBlockNameContext =
    createKnownBlockNameValidationContext(options);
  const issues: string[] = [];

  for (const [blockName, rule] of Object.entries(normalized)) {
    validateKnownBlockName(
      issues,
      knownBlockNameContext,
      blockName,
      'Contract key',
    );

    for (const key of BLOCK_NESTING_RELATION_KEYS) {
      const relatedBlockNames = rule[key];
      if (!relatedBlockNames) {
        continue;
      }

      for (const relatedBlockName of relatedBlockNames) {
        validateKnownBlockName(
          issues,
          knownBlockNameContext,
          relatedBlockName,
          `${blockName}.${key}`,
          { allowExternalBlockName: true },
        );
        if (
          relatedBlockName === blockName &&
          (key === 'parent' || key === 'ancestor')
        ) {
          issues.push(`${blockName}.${key} must not reference itself.`);
        }
      }
    }
  }

  const embeddedTemplates = getInnerBlocksTemplatesFromNesting(contract);
  validateInnerBlocksTemplatesAgainstNormalizedNesting(
    embeddedTemplates,
    normalized,
    issues,
    knownBlockNameContext,
  );

  for (const [childBlockName, rule] of Object.entries(normalized)) {
    for (const parentBlockName of rule.parent ?? []) {
      const parentRule = normalized[parentBlockName];
      if (
        parentRule?.allowedBlocks &&
        parentRule.allowedBlocks.length > 0 &&
        !parentRule.allowedBlocks.includes(childBlockName)
      ) {
        issues.push(
          `${childBlockName}.parent includes "${parentBlockName}", but ${parentBlockName}.allowedBlocks does not include "${childBlockName}".`,
        );
      }
    }
  }

  for (const [parentBlockName, rule] of Object.entries(normalized)) {
    for (const childBlockName of rule.allowedBlocks ?? []) {
      const childRule = normalized[childBlockName];
      if (
        childRule?.parent &&
        childRule.parent.length > 0 &&
        !childRule.parent.includes(parentBlockName)
      ) {
        issues.push(
          `${parentBlockName}.allowedBlocks includes "${childBlockName}", but ${childBlockName}.parent does not include "${parentBlockName}".`,
        );
      }
    }
  }

  if (issues.length > 0) {
    throw new Error(
      `Invalid block nesting contract:\n${issues.map((issue) => `- ${issue}`).join('\n')}`,
    );
  }
}

export function getInnerBlocksTemplatesFromNesting(
  nesting: BlockNestingContract,
): BlockInnerBlocksTemplateContract {
  if (!isRecord(nesting)) {
    throw new Error('Block nesting contract must be an object.');
  }

  const templates: Record<string, BlockInnerBlocksTemplate> = {};
  for (const [blockName, rule] of Object.entries(nesting)) {
    if (
      isRecord(rule) &&
      hasOwn(rule, 'template') &&
      rule.template !== undefined
    ) {
      assertBlockName(blockName, `Block nesting contract key "${blockName}"`);
      templates[blockName] = rule.template as BlockInnerBlocksTemplate;
    }
  }

  return templates;
}

function normalizeInnerBlocksTemplateContract(
  templates: BlockInnerBlocksTemplateContract,
): Record<string, NormalizedBlockInnerBlocksTemplate> {
  if (!isRecord(templates)) {
    throw new Error('InnerBlocks template contract must be an object.');
  }

  return Object.fromEntries(
    Object.entries(templates).map(([blockName, template]) => {
      assertBlockName(blockName, `InnerBlocks template key "${blockName}"`);
      return [
        blockName,
        normalizeInnerBlocksTemplate(
          template,
          `InnerBlocks template "${blockName}"`,
        ),
      ];
    }),
  );
}

function hasRelationshipOverlap(
  expectedBlockNames: readonly string[],
  actualBlockNames: readonly string[],
): boolean {
  return expectedBlockNames.some((blockName) =>
    actualBlockNames.includes(blockName),
  );
}

function validateInnerBlocksTemplateList(
  issues: string[],
  template: NormalizedBlockInnerBlocksTemplate,
  parentBlockName: string,
  ancestorBlockNames: readonly string[],
  nesting: Record<string, NormalizedBlockNestingRule>,
  knownBlockNameContext: KnownBlockNameValidationContext | null,
  context: string,
): void {
  const parentRule = nesting[parentBlockName];

  template.forEach((item, index) => {
    const childBlockName = item[0];
    const itemContext = `${context}[${index}]`;
    validateKnownBlockName(
      issues,
      knownBlockNameContext,
      childBlockName,
      `${itemContext}[0]`,
      { allowExternalBlockName: true },
    );

    if (
      parentRule?.allowedBlocks &&
      parentRule.allowedBlocks.length > 0 &&
      !parentRule.allowedBlocks.includes(childBlockName)
    ) {
      issues.push(
        `${itemContext} uses "${childBlockName}", but ${parentBlockName}.allowedBlocks does not include "${childBlockName}".`,
      );
    }

    const childRule = nesting[childBlockName];
    if (
      childRule?.parent &&
      childRule.parent.length > 0 &&
      !childRule.parent.includes(parentBlockName)
    ) {
      issues.push(
        `${itemContext} uses "${childBlockName}", but ${childBlockName}.parent does not include "${parentBlockName}".`,
      );
    }

    const childAncestors = [...ancestorBlockNames, parentBlockName];
    if (
      childRule?.ancestor &&
      childRule.ancestor.length > 0 &&
      !hasRelationshipOverlap(childRule.ancestor, childAncestors)
    ) {
      issues.push(
        `${itemContext} uses "${childBlockName}", but ${childBlockName}.ancestor does not include any ancestor in ${childAncestors.join(' -> ')}.`,
      );
    }

    if (item[2]) {
      validateInnerBlocksTemplateList(
        issues,
        item[2],
        childBlockName,
        childAncestors,
        nesting,
        knownBlockNameContext,
        `${itemContext}[2]`,
      );
    }
  });
}

function validateInnerBlocksTemplatesAgainstNormalizedNesting(
  templates: BlockInnerBlocksTemplateContract,
  nesting: Record<string, NormalizedBlockNestingRule>,
  issues: string[],
  knownBlockNameContext: KnownBlockNameValidationContext | null,
): void {
  const normalizedTemplates = normalizeInnerBlocksTemplateContract(templates);

  for (const [blockName, template] of Object.entries(normalizedTemplates)) {
    validateKnownBlockName(
      issues,
      knownBlockNameContext,
      blockName,
      'InnerBlocks template key',
    );
    validateInnerBlocksTemplateList(
      issues,
      template,
      blockName,
      [],
      nesting,
      knownBlockNameContext,
      `InnerBlocks template "${blockName}"`,
    );
  }
}

export function validateInnerBlocksTemplates(
  templates: BlockInnerBlocksTemplateContract,
  options: ValidateInnerBlocksTemplatesOptions = {},
): void {
  const nesting = options.nesting
    ? normalizeBlockNestingContract(options.nesting)
    : {};
  const knownBlockNameContext =
    createKnownBlockNameValidationContext(options);
  const issues: string[] = [];

  validateInnerBlocksTemplatesAgainstNormalizedNesting(
    templates,
    nesting,
    issues,
    knownBlockNameContext,
  );

  if (issues.length > 0) {
    throw new Error(
      `Invalid InnerBlocks template contract:\n${issues.map((issue) => `- ${issue}`).join('\n')}`,
    );
  }
}

function addBlockPatternDiagnostic(
  diagnostics: BlockPatternNestingDiagnostic[],
  diagnostic: BlockPatternNestingDiagnostic,
): void {
  diagnostics.push(diagnostic);
}

function normalizeSerializedBlockName(rawBlockName: string): string | null {
  const blockName = rawBlockName.includes('/')
    ? rawBlockName
    : `core/${rawBlockName}`;
  try {
    assertBlockName(blockName, 'Serialized block name');
  } catch {
    return null;
  }

  return blockName;
}

function parseBlockPatternComment(
  commentBody: string,
  diagnostics: BlockPatternNestingDiagnostic[],
  patternFile?: string,
):
  | {
      attributes: Record<string, unknown>;
      blockName: string;
      selfClosing: boolean;
      type: 'open';
    }
  | {
      blockName: string;
      type: 'close';
    }
  | null {
  const source = commentBody.trim();
  if (!source.startsWith('wp:') && !source.startsWith('/wp:')) {
    return null;
  }

  if (source.startsWith('/wp:')) {
    const rawBlockName = source.slice('/wp:'.length).trim().split(/\s+/u)[0];
    const blockName = rawBlockName
      ? normalizeSerializedBlockName(rawBlockName)
      : null;
    if (!blockName) {
      addBlockPatternDiagnostic(diagnostics, {
        code: 'invalid-block-pattern-comment',
        message: `Unable to parse serialized closing block comment "<!-- ${source} -->".`,
        patternFile,
        severity: 'warning',
      });
      return null;
    }

    return {
      blockName,
      type: 'close',
    };
  }

  const openSource = source.slice('wp:'.length).trim();
  const whitespaceIndex = openSource.search(/\s/u);
  let rawBlockName =
    whitespaceIndex === -1 ? openSource : openSource.slice(0, whitespaceIndex);
  let remainder =
    whitespaceIndex === -1 ? '' : openSource.slice(whitespaceIndex).trim();
  let selfClosing = false;

  if (rawBlockName.endsWith('/')) {
    rawBlockName = rawBlockName.slice(0, -1);
    selfClosing = true;
  }

  if (remainder.endsWith('/')) {
    remainder = remainder.slice(0, -1).trim();
    selfClosing = true;
  }

  const blockName = rawBlockName
    ? normalizeSerializedBlockName(rawBlockName)
    : null;
  if (!blockName) {
    addBlockPatternDiagnostic(diagnostics, {
      code: 'invalid-block-pattern-comment',
      message: `Unable to parse serialized opening block comment "<!-- ${source} -->".`,
      patternFile,
      severity: 'warning',
    });
    return null;
  }

  let attributes: Record<string, unknown> = {};
  if (remainder.length > 0) {
    try {
      const parsedAttributes = JSON.parse(remainder) as unknown;
      if (isRecord(parsedAttributes)) {
        attributes = parsedAttributes;
      } else {
        addBlockPatternDiagnostic(diagnostics, {
          blockName,
          code: 'invalid-block-pattern-attributes',
          message: `Serialized block "${blockName}" attributes must be a JSON object.`,
          patternFile,
          severity: 'warning',
        });
      }
    } catch (error) {
      addBlockPatternDiagnostic(diagnostics, {
        blockName,
        code: 'invalid-block-pattern-attributes',
        message: `Unable to parse serialized block "${blockName}" attributes: ${
          error instanceof Error ? error.message : String(error)
        }.`,
        patternFile,
        severity: 'warning',
      });
    }
  }

  return {
    attributes,
    blockName,
    selfClosing,
    type: 'open',
  };
}

function formatBlockPatternPath(pathSegments: readonly string[]): string {
  return pathSegments.join(' > ');
}

function findOpenBlockStackIndex(
  stack: readonly {
    block: ParsedBlockPatternBlock;
    pathSegments: string[];
  }[],
  blockName: string,
): number {
  for (let index = stack.length - 1; index > 0; index -= 1) {
    if (stack[index]?.block.blockName === blockName) {
      return index;
    }
  }

  return -1;
}

function parseBlockPatternContent(
  content: string,
  patternFile?: string,
): {
  blocks: ParsedBlockPatternBlock[];
  diagnostics: BlockPatternNestingDiagnostic[];
} {
  const diagnostics: BlockPatternNestingDiagnostic[] = [];
  const rootBlock: ParsedBlockPatternBlock = {
    attributes: {},
    blockName: '__root__',
    innerBlocks: [],
  };
  const stack: {
    block: ParsedBlockPatternBlock;
    pathSegments: string[];
  }[] = [
    {
      block: rootBlock,
      pathSegments: [],
    },
  ];

  for (const match of content.matchAll(WORDPRESS_BLOCK_COMMENT_PATTERN)) {
    const comment = parseBlockPatternComment(
      match[1] ?? '',
      diagnostics,
      patternFile,
    );
    if (!comment) {
      continue;
    }

    if (comment.type === 'close') {
      const openStackIndex = findOpenBlockStackIndex(stack, comment.blockName);
      if (openStackIndex === -1) {
        addBlockPatternDiagnostic(diagnostics, {
          blockName: comment.blockName,
          code: 'unbalanced-block-pattern-comment',
          message: `Serialized closing block "${comment.blockName}" does not match an open block.`,
          patternFile,
          severity: 'warning',
        });
        continue;
      }

      if (openStackIndex !== stack.length - 1) {
        for (
          let unclosedIndex = stack.length - 1;
          unclosedIndex > openStackIndex;
          unclosedIndex -= 1
        ) {
          const unclosedBlock = stack[unclosedIndex];
          if (!unclosedBlock) {
            continue;
          }
          addBlockPatternDiagnostic(diagnostics, {
            blockName: unclosedBlock.block.blockName,
            blockPath: formatBlockPatternPath(unclosedBlock.pathSegments),
            code: 'unbalanced-block-pattern-comment',
            message: `Serialized opening block "${unclosedBlock.block.blockName}" was not closed before "${comment.blockName}" closed.`,
            patternFile,
            severity: 'warning',
          });
        }
        addBlockPatternDiagnostic(diagnostics, {
          blockName: comment.blockName,
          blockPath: formatBlockPatternPath(
            stack[stack.length - 1]?.pathSegments ?? [],
          ),
          code: 'unbalanced-block-pattern-comment',
          message: `Serialized closing block "${comment.blockName}" appeared before all nested blocks were closed.`,
          patternFile,
          severity: 'warning',
        });
      }

      stack.length = openStackIndex + 1;
      stack.pop();
      continue;
    }

    const parent = stack[stack.length - 1];
    if (!parent) {
      continue;
    }

    const block: ParsedBlockPatternBlock = {
      attributes: comment.attributes,
      blockName: comment.blockName,
      innerBlocks: [],
    };
    const blockPathSegments = [
      ...parent.pathSegments,
      `${block.blockName}[${parent.block.innerBlocks.length}]`,
    ];
    parent.block.innerBlocks.push(block);

    if (!comment.selfClosing) {
      stack.push({
        block,
        pathSegments: blockPathSegments,
      });
    }
  }

  for (let index = stack.length - 1; index > 0; index -= 1) {
    const openBlock = stack[index];
    if (!openBlock) {
      continue;
    }
    addBlockPatternDiagnostic(diagnostics, {
      blockName: openBlock.block.blockName,
      blockPath: formatBlockPatternPath(openBlock.pathSegments),
      code: 'unbalanced-block-pattern-comment',
      message: `Serialized opening block "${openBlock.block.blockName}" was not closed.`,
      patternFile,
      severity: 'warning',
    });
  }

  return {
    blocks: rootBlock.innerBlocks,
    diagnostics,
  };
}

function isKnownOrAllowedExternalBlockName(
  knownBlockNameContext: KnownBlockNameValidationContext | null,
  blockName: string,
): boolean {
  if (!knownBlockNameContext) {
    return true;
  }

  if (knownBlockNameContext.knownBlockNames.has(blockName)) {
    return true;
  }

  return (
    knownBlockNameContext.allowExternalBlockNames &&
    !knownBlockNameContext.knownBlockNamespaces.has(
      getBlockNamespace(blockName),
    )
  );
}

function validateParsedPatternBlocksAgainstNesting(
  issues: BlockPatternNestingDiagnostic[],
  blocks: readonly ParsedBlockPatternBlock[],
  nesting: Record<string, NormalizedBlockNestingRule>,
  knownBlockNameContext: KnownBlockNameValidationContext | null,
  patternFile: string | undefined,
  ancestorBlockNames: readonly string[] = [],
  pathSegments: readonly string[] = [],
): void {
  const parentBlockName = ancestorBlockNames[ancestorBlockNames.length - 1];
  const parentRule = parentBlockName ? nesting[parentBlockName] : undefined;

  blocks.forEach((block, index) => {
    const blockPathSegments = [
      ...pathSegments,
      `${block.blockName}[${index}]`,
    ];
    const blockPath = formatBlockPatternPath(blockPathSegments);
    const childRule = nesting[block.blockName];

    if (!isKnownOrAllowedExternalBlockName(knownBlockNameContext, block.blockName)) {
      addBlockPatternDiagnostic(issues, {
        blockName: block.blockName,
        blockPath,
        code: 'unknown-block',
        message: `Pattern content references unknown block "${block.blockName}". Its own nesting requirements were skipped.`,
        patternFile,
        severity: 'warning',
      });
    }

    if (
      parentRule?.allowedBlocks &&
      parentRule.allowedBlocks.length > 0 &&
      !parentRule.allowedBlocks.includes(block.blockName)
    ) {
      addBlockPatternDiagnostic(issues, {
        blockName: block.blockName,
        blockPath,
        code: 'disallowed-child-block',
        message: `${parentBlockName}.allowedBlocks does not include "${block.blockName}".`,
        patternFile,
        severity: 'error',
      });
    }

    if (childRule?.parent && childRule.parent.length > 0) {
      if (!parentBlockName) {
        addBlockPatternDiagnostic(issues, {
          blockName: block.blockName,
          blockPath,
          code: 'invalid-block-parent',
          message: `"${block.blockName}" requires one of these parent blocks: ${childRule.parent.join(', ')}.`,
          patternFile,
          severity: 'error',
        });
      } else if (!childRule.parent.includes(parentBlockName)) {
        addBlockPatternDiagnostic(issues, {
          blockName: block.blockName,
          blockPath,
          code: 'invalid-block-parent',
          message: `"${block.blockName}" requires one of these parent blocks: ${childRule.parent.join(', ')}, but found "${parentBlockName}".`,
          patternFile,
          severity: 'error',
        });
      }
    }

    if (
      childRule?.ancestor &&
      childRule.ancestor.length > 0 &&
      !hasRelationshipOverlap(childRule.ancestor, ancestorBlockNames)
    ) {
      addBlockPatternDiagnostic(issues, {
        blockName: block.blockName,
        blockPath,
        code: 'invalid-block-ancestor',
        message: `"${block.blockName}" requires one of these ancestor blocks: ${childRule.ancestor.join(', ')}.`,
        patternFile,
        severity: 'error',
      });
    }

    validateParsedPatternBlocksAgainstNesting(
      issues,
      block.innerBlocks,
      nesting,
      knownBlockNameContext,
      patternFile,
      [...ancestorBlockNames, block.blockName],
      blockPathSegments,
    );
  });
}

/**
 * Parse serialized WordPress block comments in a pattern file and compare the
 * discovered block tree with a typed block nesting contract.
 *
 * Relationship violations are returned as `error` diagnostics. Unknown blocks,
 * malformed block comments, and unparseable attributes are returned as
 * `warning` diagnostics so callers can surface them without mutating content.
 *
 * @param content PHP or HTML pattern source containing serialized block comments.
 * @param options Pattern filename, nesting contract, and known block-name policy.
 * @returns Parsed block tree plus split warning/error diagnostics.
 */
export function validateBlockPatternContentNesting(
  content: string,
  options: ValidateBlockPatternContentNestingOptions,
): ValidateBlockPatternContentNestingResult {
  validateBlockNestingContract(options.nesting, {
    allowExternalBlockNames: options.allowExternalBlockNames,
    knownBlockNames: options.knownBlockNames,
  });

  const nesting = normalizeBlockNestingContract(options.nesting);
  const knownBlockNameContext = createKnownBlockNameValidationContext(options);
  const parsed = parseBlockPatternContent(content, options.patternFile);
  const diagnostics = [...parsed.diagnostics];

  validateParsedPatternBlocksAgainstNesting(
    diagnostics,
    parsed.blocks,
    nesting,
    knownBlockNameContext,
    options.patternFile,
  );

  return {
    blocks: parsed.blocks,
    diagnostics,
    errors: diagnostics.filter((diagnostic) => diagnostic.severity === 'error'),
    warnings: diagnostics.filter(
      (diagnostic) => diagnostic.severity === 'warning',
    ),
  };
}

/**
 * Format one pattern nesting diagnostic with its file and serialized block path.
 *
 * @param diagnostic Diagnostic returned by `validateBlockPatternContentNesting`.
 * @returns Human-readable diagnostic message.
 */
export function formatBlockPatternContentNestingDiagnostic(
  diagnostic: BlockPatternNestingDiagnostic,
): string {
  const location = [
    diagnostic.patternFile,
    diagnostic.blockPath ? `at ${diagnostic.blockPath}` : undefined,
  ]
    .filter(Boolean)
    .join(' ');
  const prefix = location.length > 0 ? `${location}: ` : '';

  return `${prefix}${diagnostic.message}`;
}

/**
 * Format multiple pattern nesting diagnostics as a bullet list.
 *
 * @param diagnostics Diagnostics returned by `validateBlockPatternContentNesting`.
 * @returns Human-readable bullet list suitable for CLI errors or warnings.
 */
export function formatBlockPatternContentNestingDiagnostics(
  diagnostics: readonly BlockPatternNestingDiagnostic[],
): string {
  return diagnostics
    .map(
      (diagnostic) =>
        `- ${formatBlockPatternContentNestingDiagnostic(diagnostic)}`,
    )
    .join('\n');
}

export function renderInnerBlocksTemplateModule(
  templates: BlockInnerBlocksTemplateContract,
  options: RenderInnerBlocksTemplateModuleOptions = {},
): string {
  validateInnerBlocksTemplates(templates);

  const exportName = options.exportName ?? 'INNER_BLOCKS_TEMPLATES';
  if (!TYPESCRIPT_IDENTIFIER_PATTERN.test(exportName)) {
    throw new Error(
      `renderInnerBlocksTemplateModule: exportName "${exportName}" is not a valid TypeScript identifier.`,
    );
  }
  const serializedTemplates = renderTypeScriptValue(templates);

  return [
    '/* This file is generated by wp-typia. Do not edit manually. */',
    '',
    'export type WpTypiaInnerBlocksTemplateAttributes = Record<string, unknown>;',
    'export type WpTypiaInnerBlocksTemplateItem = [',
    '  blockName: string,',
    '  attributes?: WpTypiaInnerBlocksTemplateAttributes,',
    '  innerBlocks?: WpTypiaInnerBlocksTemplate,',
    '];',
    'export type WpTypiaInnerBlocksTemplate = WpTypiaInnerBlocksTemplateItem[];',
    '',
    `export const ${exportName} = ${serializedTemplates} satisfies Record<`,
    '  string,',
    '  WpTypiaInnerBlocksTemplate',
    '>;',
    '',
    'export type WpTypiaInnerBlocksTemplateName =',
    `  keyof typeof ${exportName};`,
    '',
  ].join('\n');
}

export function applyBlockNestingMetadata({
  blockJson,
  blockName,
  nesting,
}: {
  blockJson: Record<string, unknown>;
  blockName: string;
  nesting?: BlockNestingContract;
}): BlockNestingRelationKey[] {
  if (!nesting || !hasOwn(nesting, blockName)) {
    return [];
  }

  validateBlockNestingContract(nesting);

  const rule = normalizeBlockNestingRule(blockName, nesting[blockName]);
  const appliedKeys: BlockNestingRelationKey[] = [];

  for (const key of BLOCK_NESTING_RELATION_KEYS) {
    if (hasOwn(rule, key)) {
      blockJson[key] = rule[key];
      appliedKeys.push(key);
    } else {
      delete blockJson[key];
    }
  }

  return appliedKeys;
}
