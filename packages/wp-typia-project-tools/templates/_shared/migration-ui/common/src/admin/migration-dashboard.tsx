/* eslint-disable no-alert */
import { useState } from '@wordpress/element';
import { Button, Card, CardBody, Notice, Spinner } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

import {
  type BatchMigrationResult,
  type BlockScanResult,
  batchMigrateScanResults,
  generateMigrationReport,
  scanSiteForMigrations,
} from '../migration-detector';

interface MigrationStats {
  needsMigration: number;
  riskTotals: {
    additive: number;
    rename: number;
    semanticTransform: number;
    unionBreaking: number;
  };
  total: number;
  unknown: number;
  versions: Record<string, number>;
}

const TEXT_DOMAIN = '{{textDomain}}';

function formatUnionStatus(
  status: BlockScanResult['preview']['unionBranches'][number]['status'],
) {
  switch (status) {
    case 'auto':
      return __('auto', TEXT_DOMAIN);
    case 'current':
      return __('current', TEXT_DOMAIN);
    case 'manual':
      return __('manual', TEXT_DOMAIN);
    default:
      return __('unknown', TEXT_DOMAIN);
  }
}

function formatRiskSummaryLine(result: BlockScanResult['analysis']): string {
  return `${__('additive', TEXT_DOMAIN)} ${result.riskSummary.additive.count}, ${__('rename', TEXT_DOMAIN)} ${result.riskSummary.rename.count}, ${__('transform', TEXT_DOMAIN)} ${result.riskSummary.semanticTransform.count}, ${__('union breaking', TEXT_DOMAIN)} ${result.riskSummary.unionBreaking.count}`;
}

function collectStats(results: BlockScanResult[]): MigrationStats {
  return results.reduce<MigrationStats>(
    (accumulator, result) => {
      accumulator.total += 1;
      if (result.analysis.needsMigration) {
        accumulator.needsMigration += 1;
      }
      if (result.analysis.currentMigrationVersion === 'unknown') {
        accumulator.unknown += 1;
      }
      accumulator.versions[result.analysis.currentMigrationVersion] =
        (accumulator.versions[result.analysis.currentMigrationVersion] ?? 0) +
        1;
      accumulator.riskTotals.additive +=
        result.analysis.riskSummary.additive.count;
      accumulator.riskTotals.rename += result.analysis.riskSummary.rename.count;
      accumulator.riskTotals.semanticTransform +=
        result.analysis.riskSummary.semanticTransform.count;
      accumulator.riskTotals.unionBreaking +=
        result.analysis.riskSummary.unionBreaking.count;
      return accumulator;
    },
    {
      needsMigration: 0,
      riskTotals: {
        additive: 0,
        rename: 0,
        semanticTransform: 0,
        unionBreaking: 0,
      },
      total: 0,
      unknown: 0,
      versions: {},
    },
  );
}

function downloadFile(contents: string, fileName: string, type: string) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function formatUnionSummary(result: BlockScanResult['preview']): string {
  if (result.unionBranches.length === 0) {
    return __('No union branch changes', TEXT_DOMAIN);
  }

  return result.unionBranches
    .map(
      (branch) =>
        `${branch.field}: ${branch.legacyBranch ?? __('unknown', TEXT_DOMAIN)} → ${
          branch.nextBranch ?? __('unknown', TEXT_DOMAIN)
        } (${formatUnionStatus(branch.status)})`,
    )
    .join(', ');
}

function renderJsonPreview(value: unknown) {
  return (
    <pre
      style={{
        background: '#f6f7f7',
        borderRadius: '4px',
        margin: '8px 0 0',
        overflowX: 'auto',
        padding: '8px',
      }}
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function MigrationDashboard() {
  const [results, setResults] = useState<BlockScanResult[]>([]);
  const [dryRunResult, setDryRunResult] = useState<BatchMigrationResult | null>(
    null,
  );
  const [executionResult, setExecutionResult] =
    useState<BatchMigrationResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stats = collectStats(results);

  const runScan = async () => {
    setIsScanning(true);
    setError(null);
    setDryRunResult(null);

    try {
      setResults(await scanSiteForMigrations());
    } catch (scanError) {
      setError(
        scanError instanceof Error ? scanError.message : String(scanError),
      );
    } finally {
      setIsScanning(false);
    }
  };

  const runDryRun = async () => {
    setError(null);
    setExecutionResult(null);

    try {
      setDryRunResult(await batchMigrateScanResults(results, { dryRun: true }));
    } catch (batchError) {
      setError(
        batchError instanceof Error ? batchError.message : String(batchError),
      );
    }
  };

  const runBatchMigration = async () => {
    if (
      !window.confirm(
        __('Migrate all detected legacy blocks now?', '{{textDomain}}'),
      )
    ) {
      return;
    }

    setIsMigrating(true);
    setError(null);

    try {
      setExecutionResult(
        await batchMigrateScanResults(results, { dryRun: false }),
      );
      await runScan();
    } catch (batchError) {
      setError(
        batchError instanceof Error ? batchError.message : String(batchError),
      );
    } finally {
      setIsMigrating(false);
    }
  };

  const downloadReport = () => {
    downloadFile(
      generateMigrationReport(results),
      'typia-migration-report.md',
      'text/markdown',
    );
  };

  const downloadJson = () => {
    downloadFile(
      JSON.stringify(
        {
          executionResult,
          dryRunResult,
          results,
        },
        null,
        2,
      ),
      'typia-migration-report.json',
      'application/json',
    );
  };

  return (
    <div className="wp-typia-migration-dashboard">
      <Card>
        <CardBody>
          <div style={{ display: 'grid', gap: '12px' }}>
            <div>
              <strong>{__('Migration Manager', '{{textDomain}}')}</strong>
              <p style={{ margin: '4px 0 0' }}>
                {__(
                  'Scan posts for legacy attributes, preview field-level changes, and batch migrate to the current Typia contract.',
                  '{{textDomain}}',
                )}
              </p>
            </div>

            <div
              style={{
                display: 'flex',
                gap: '8px',
                flexWrap: 'wrap',
              }}
            >
              <Button
                variant="secondary"
                onClick={runScan}
                disabled={isScanning}
              >
                {isScanning
                  ? __('Scanning…', '{{textDomain}}')
                  : __('Scan site', '{{textDomain}}')}
              </Button>
              <Button
                variant="secondary"
                onClick={runDryRun}
                disabled={results.length === 0 || isScanning || isMigrating}
              >
                {__('Preview dry run', '{{textDomain}}')}
              </Button>
              <Button
                variant="primary"
                onClick={runBatchMigration}
                disabled={results.length === 0 || isScanning || isMigrating}
              >
                {isMigrating
                  ? __('Migrating…', '{{textDomain}}')
                  : __('Run migration', '{{textDomain}}')}
              </Button>
              <Button
                variant="tertiary"
                onClick={downloadReport}
                disabled={results.length === 0}
              >
                {__('Export Markdown', '{{textDomain}}')}
              </Button>
              <Button
                variant="tertiary"
                onClick={downloadJson}
                disabled={
                  results.length === 0 &&
                  dryRunResult === null &&
                  executionResult === null
                }
              >
                {__('Export JSON', TEXT_DOMAIN)}
              </Button>
            </div>

            {isScanning && <Spinner />}

            {error && (
              <Notice status="error" isDismissible={false}>
                {error}
              </Notice>
            )}

            <Notice status="info" isDismissible={false}>
              {__('Detected blocks needing attention:', '{{textDomain}}')}{' '}
              <strong>{stats.total}</strong>
              <br />
              {__('Needs migration:', '{{textDomain}}')}{' '}
              <strong>{stats.needsMigration}</strong>
              <br />
              {__('Unknown version matches:', '{{textDomain}}')}{' '}
              <strong>{stats.unknown}</strong>
            </Notice>

            {executionResult && (
              <Notice
                status={executionResult.failed > 0 ? 'warning' : 'success'}
                isDismissible={false}
              >
                {__('Migration summary', TEXT_DOMAIN)}:{' '}
                {executionResult.successful}{' '}
                {__('post(s) migrated,', TEXT_DOMAIN)} {executionResult.failed}{' '}
                {__('post(s) blocked.', TEXT_DOMAIN)}
              </Notice>
            )}

            {!executionResult && dryRunResult && (
              <Notice
                status={dryRunResult.failed > 0 ? 'warning' : 'success'}
                isDismissible={false}
              >
                {__('Dry run summary', TEXT_DOMAIN)}: {dryRunResult.successful}{' '}
                {__('post(s) ready,', TEXT_DOMAIN)} {dryRunResult.failed}{' '}
                {__('post(s) blocked.', TEXT_DOMAIN)}
              </Notice>
            )}

            {results.map((result) => (
              <Card key={`${result.postId}:${result.blockPath.join('.')}`}>
                <CardBody>
                  <div
                    style={{
                      display: 'grid',
                      gap: '8px',
                    }}
                  >
                    <div>
                      <strong>{result.postTitle}</strong> ({result.blockName})
                      <div style={{ fontSize: '12px', opacity: 0.8 }}>
                        {__('Migration version', '{{textDomain}}')}:{' '}
                        {result.analysis.currentMigrationVersion} →{' '}
                        {result.analysis.targetMigrationVersion}
                      </div>
                    </div>
                    <div style={{ fontSize: '12px' }}>
                      {__('Risk summary', '{{textDomain}}')}:{' '}
                      {formatRiskSummaryLine(result.analysis)}
                    </div>
                    <div style={{ fontSize: '12px' }}>
                      {__('Changed fields', '{{textDomain}}')}:{' '}
                      {result.preview.changedFields.join(', ') ||
                        __('none', '{{textDomain}}')}
                    </div>
                    <div style={{ fontSize: '12px' }}>
                      {__('Union branches', '{{textDomain}}')}:{' '}
                      {formatUnionSummary(result.preview)}
                    </div>
                    {result.preview.unresolved.length > 0 && (
                      <Notice status="warning" isDismissible={false}>
                        {result.preview.unresolved.join(', ')}
                      </Notice>
                    )}
                    {result.preview.validationErrors.length > 0 && (
                      <Notice status="error" isDismissible={false}>
                        {result.preview.validationErrors.join(', ')}
                      </Notice>
                    )}
                    <div>
                      <strong>{__('Before', '{{textDomain}}')}</strong>
                      {renderJsonPreview(result.preview.before)}
                    </div>
                    <div>
                      <strong>{__('After', '{{textDomain}}')}</strong>
                      {renderJsonPreview(result.preview.after)}
                    </div>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
