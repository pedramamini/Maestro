/**
 * YAML Playbook Parser
 *
 * Parses YAML playbook files into executable playbook structures.
 */

import * as fs from 'fs';
import * as yaml from 'js-yaml';
import type { YamlPlaybook, PlaybookStep } from './types';

/**
 * Parse error with location information
 */
export class PlaybookParseError extends Error {
  constructor(
    message: string,
    public readonly file?: string,
    public readonly line?: number
  ) {
    super(message);
    this.name = 'PlaybookParseError';
  }
}

/**
 * Validate a playbook step structure
 */
function validateStep(step: unknown, index: number): PlaybookStep {
  if (typeof step !== 'object' || step === null) {
    throw new PlaybookParseError(`Step ${index + 1} must be an object`);
  }

  const s = step as Record<string, unknown>;

  if (typeof s.action !== 'string' || !s.action) {
    throw new PlaybookParseError(`Step ${index + 1} must have an 'action' field`);
  }

  const validatedStep: PlaybookStep = {
    action: s.action,
  };

  if (s.name !== undefined) {
    if (typeof s.name !== 'string') {
      throw new PlaybookParseError(`Step ${index + 1}: 'name' must be a string`);
    }
    validatedStep.name = s.name;
  }

  if (s.inputs !== undefined) {
    if (typeof s.inputs !== 'object' || s.inputs === null) {
      throw new PlaybookParseError(`Step ${index + 1}: 'inputs' must be an object`);
    }
    validatedStep.inputs = s.inputs as Record<string, unknown>;
  }

  if (s.store_as !== undefined) {
    if (typeof s.store_as !== 'string') {
      throw new PlaybookParseError(`Step ${index + 1}: 'store_as' must be a string`);
    }
    validatedStep.store_as = s.store_as;
  }

  if (s.condition !== undefined) {
    if (typeof s.condition !== 'string') {
      throw new PlaybookParseError(`Step ${index + 1}: 'condition' must be a string`);
    }
    validatedStep.condition = s.condition;
  }

  if (s.continue_on_error !== undefined) {
    if (typeof s.continue_on_error !== 'boolean') {
      throw new PlaybookParseError(`Step ${index + 1}: 'continue_on_error' must be a boolean`);
    }
    validatedStep.continue_on_error = s.continue_on_error;
  }

  if (s.on_failure !== undefined) {
    if (!Array.isArray(s.on_failure)) {
      throw new PlaybookParseError(`Step ${index + 1}: 'on_failure' must be an array`);
    }
    validatedStep.on_failure = s.on_failure.map((fs, fi) =>
      validateStep(fs, fi)
    );
  }

  return validatedStep;
}

/**
 * Validate and parse a YAML playbook object
 */
function validatePlaybook(data: unknown, file?: string): YamlPlaybook {
  if (typeof data !== 'object' || data === null) {
    throw new PlaybookParseError('Playbook must be an object', file);
  }

  const d = data as Record<string, unknown>;

  if (typeof d.name !== 'string' || !d.name) {
    throw new PlaybookParseError("Playbook must have a 'name' field", file);
  }

  if (!Array.isArray(d.steps)) {
    throw new PlaybookParseError("Playbook must have a 'steps' array", file);
  }

  if (d.steps.length === 0) {
    throw new PlaybookParseError("Playbook must have at least one step", file);
  }

  const playbook: YamlPlaybook = {
    name: d.name,
    steps: d.steps.map((step, index) => validateStep(step, index)),
  };

  if (d.description !== undefined) {
    if (typeof d.description !== 'string') {
      throw new PlaybookParseError("'description' must be a string", file);
    }
    playbook.description = d.description;
  }

  if (d.inputs !== undefined) {
    if (typeof d.inputs !== 'object' || d.inputs === null) {
      throw new PlaybookParseError("'inputs' must be an object", file);
    }
    playbook.inputs = d.inputs as YamlPlaybook['inputs'];
  }

  return playbook;
}

/**
 * Parse a YAML string into a playbook
 */
export function parseYamlPlaybook(content: string, file?: string): YamlPlaybook {
  try {
    const data = yaml.load(content);
    return validatePlaybook(data, file);
  } catch (error) {
    if (error instanceof PlaybookParseError) {
      throw error;
    }
    if (error instanceof yaml.YAMLException) {
      throw new PlaybookParseError(
        `YAML parse error: ${error.message}`,
        file,
        error.mark?.line
      );
    }
    throw new PlaybookParseError(
      `Failed to parse playbook: ${error instanceof Error ? error.message : String(error)}`,
      file
    );
  }
}

/**
 * Parse a YAML playbook file
 */
export function parseYamlPlaybookFile(filePath: string): YamlPlaybook {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return parseYamlPlaybook(content, filePath);
  } catch (error) {
    if (error instanceof PlaybookParseError) {
      throw error;
    }
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new PlaybookParseError(`Playbook file not found: ${filePath}`, filePath);
    }
    throw new PlaybookParseError(
      `Failed to read playbook file: ${error instanceof Error ? error.message : String(error)}`,
      filePath
    );
  }
}

/**
 * Tokenize a shorthand string, respecting quotes
 * Returns an array of tokens with quotes removed
 */
function tokenizeShorthand(shorthand: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuote: string | null = null;

  for (let i = 0; i < shorthand.length; i++) {
    const char = shorthand[i];

    if (inQuote) {
      if (char === inQuote) {
        // End of quoted string
        inQuote = null;
      } else {
        current += char;
      }
    } else if (char === '"' || char === "'") {
      // Start of quoted string
      inQuote = char;
    } else if (/\s/.test(char)) {
      // Whitespace - end current token if any
      if (current) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }

  // Add final token if any
  if (current) {
    tokens.push(current);
  }

  return tokens;
}

/**
 * Convert a simple action step syntax to a full step object
 * Supports shorthand like: "ios.snapshot" or "ios.snapshot --simulator 'iPhone 15'"
 */
export function parseShorthandStep(shorthand: string): PlaybookStep {
  const tokens = tokenizeShorthand(shorthand);
  const action = tokens[0];

  if (!action) {
    throw new PlaybookParseError('Empty action shorthand');
  }

  const step: PlaybookStep = { action };
  const inputs: Record<string, unknown> = {};

  // Parse --key value pairs
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.startsWith('--')) {
      const key = token.slice(2).replace(/-/g, '_');
      const nextToken = tokens[i + 1];
      if (nextToken && !nextToken.startsWith('--')) {
        inputs[key] = nextToken;
        i++;
      } else {
        // Flag without value
        inputs[key] = true;
      }
    }
  }

  if (Object.keys(inputs).length > 0) {
    step.inputs = inputs;
  }

  return step;
}
