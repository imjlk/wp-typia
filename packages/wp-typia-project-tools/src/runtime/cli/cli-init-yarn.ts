import fs from 'node:fs';
import path from 'node:path';

import type { PackageManagerId } from '../shared/package-managers.js';
import type { InitFilePlan } from './cli-init-types.js';

const YARN_PNP_MARKERS = ['.pnp.cjs', '.pnp.loader.mjs'] as const;
const YARN_NODE_LINKER_LINE = /^(nodeLinker\s*:\s*)(?:"[^"]*"|'[^']*'|[^#\r\n]*?)(\s*(?:#.*)?)$/mu;
const YARN_NODE_LINKER_VALUE = /^nodeLinker\s*:\s*(?:"([^"]*)"|'([^']*)'|([^#\r\n]*?))(?:\s*(?:#.*)?)?$/mu;

export interface YarnPnpNodeModulesConfig {
  filePlan: InitFilePlan;
  path: string;
  source: string;
}

function getYarnNodeLinker(source: string): string | undefined {
  const match = source.match(YARN_NODE_LINKER_VALUE);
  if (!match) {
    return undefined;
  }

  return (match[1] ?? match[2] ?? match[3] ?? '').trim();
}

function renderYarnNodeModulesConfig(source: string): string {
  if (YARN_NODE_LINKER_LINE.test(source)) {
    return source.replace(YARN_NODE_LINKER_LINE, '$1node-modules$2');
  }

  const lineEnding = source.includes('\r\n') ? '\r\n' : '\n';
  return `${source}${source.length === 0 || source.endsWith('\n') ? '' : lineEnding}nodeLinker: node-modules${lineEnding}`;
}

/**
 * Plan the minimal Yarn configuration change that makes generated postinstall
 * compatibility hooks safe for an already-installed Plug'n'Play project.
 *
 * Yarn PnP resolves package files from read-only zip archives. The generated
 * @ttsc/lint hook deliberately patches a pinned formatter source, so retrofit
 * projects switch only an observed PnP installation to Yarn's mutable
 * node-modules linker before the next install runs that hook.
 */
export function getYarnPnpNodeModulesConfig(
  projectDir: string,
  packageManager: PackageManagerId,
): YarnPnpNodeModulesConfig | undefined {
  if (packageManager !== 'yarn') {
    return undefined;
  }

  const yarnRcPath = path.join(projectDir, '.yarnrc.yml');
  const yarnRcExists = fs.existsSync(yarnRcPath);
  const currentSource = yarnRcExists ? fs.readFileSync(yarnRcPath, 'utf8') : '';
  const pnpConfigured = getYarnNodeLinker(currentSource) === 'pnp';
  const pnpInstalled = YARN_PNP_MARKERS.some((filename) =>
    fs.existsSync(path.join(projectDir, filename)),
  );

  if (!pnpConfigured && !pnpInstalled) {
    return undefined;
  }

  const source = renderYarnNodeModulesConfig(currentSource);
  if (source === currentSource) {
    return undefined;
  }

  return {
    filePlan: {
      action: yarnRcExists ? 'update' : 'add',
      path: '.yarnrc.yml',
      purpose:
        "Switch Yarn Plug'n'Play to node-modules so the generated @ttsc/lint compatibility hook only writes mutable dependency files.",
    },
    path: yarnRcPath,
    source,
  };
}
