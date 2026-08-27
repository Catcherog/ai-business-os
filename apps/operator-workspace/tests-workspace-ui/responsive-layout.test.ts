import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');

describe('responsive layout contract', () => {
  it('lets the app grid and mobile navigation shrink with the viewport', () => {
    expect(styles).toMatch(/\.sidebar,\s*\.content,\s*\.nav\s*\{\s*min-width:\s*0;/);
  });
});
