import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'bun:test';

const packageRoot = resolve(import.meta.dir, '..');
const fixtureSourcePath = resolve(
  import.meta.dir,
  'fixtures/public-type-contracts.ts',
);
const fixtureTsconfigPath = resolve(
  import.meta.dir,
  'tsconfig.type-tests.json',
);
const ttscBinary = resolve(packageRoot, '../../node_modules/.bin/ttsc');

function runTypeFixture() {
  return spawnSync(ttscBinary, ['-p', fixtureTsconfigPath, '--noEmit'], {
    cwd: packageRoot,
    encoding: 'utf8',
  });
}

describe('@wp-typia/dataviews type contracts', () => {
  test('consumer-style public imports compile through the dedicated fixture', () => {
    const result = runTypeFixture();

    expect(
      {
        code: result.status,
        stderr: result.stderr,
        stdout: result.stdout,
      },
      result.stderr || result.stdout,
    ).toEqual({
      code: 0,
      stderr: '',
      stdout: '',
    });
  });

  test('fixture locks the owned public facade names', () => {
    const fixtureSource = readFileSync(fixtureSourcePath, 'utf8');

    expect(fixtureSource).toContain('@wp-typia/dataviews');
    expect(fixtureSource).toContain('defineDataViews');
    expect(fixtureSource).toContain('DataViewsField');
    expect(fixtureSource).toContain('DataViewsFieldValidationRules');
    expect(fixtureSource).toContain('DataViewsQueryAdapterOptions');
    expect(fixtureSource).toContain('DataViewsView');
    expect(fixtureSource).toContain('DataFormConfig');
    expect(fixtureSource).toContain('DataFormConfigOptions');
    expect(fixtureSource).toContain('DataFormFieldInput');
    expect(fixtureSource).toContain('DataFormFieldLayout');
    expect(fixtureSource).toContain('DataFormPanelFieldSummary');
    expect(fixtureSource).toContain('DefinedDataViews');
    expect(fixtureSource).toContain('DefineDataViewsInput');
    expect(fixtureSource).toContain('QueryAdapter');
    expect(fixtureSource).toContain('createDataFormConfig');
    expect(fixtureSource).toContain('createDataViewsQueryAdapter');
    expect(fixtureSource).toContain('toDataViewsQueryArgs');
    expect(fixtureSource).toContain('@ts-expect-error');
  });
});
