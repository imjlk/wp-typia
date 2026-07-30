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
    removal: number;
    rename: number;
    semanticTransform: number;
    unionBreaking: number;
  };
  total: number;
  unknown: number;
  versions: Record< string, number >;
}

function formatRiskSummaryLine(
	result: BlockScanResult[ 'analysis' ],
): string {
  return `additive ${ result.riskSummary.additive.count }, removal ${ result.riskSummary.removal.count }, rename ${ result.riskSummary.rename.count }, transform ${ result.riskSummary.semanticTransform.count }, union breaking ${ result.riskSummary.unionBreaking.count }`;
}

function findAnalysisForPreview(
	results: BlockScanResult[],
	postId: number,
	blockPath: number[],
): BlockScanResult[ 'analysis' ] | null {
  return (
		results.find(
			( result ) =>
				result.postId === postId &&
				result.blockPath.join( '.' ) === blockPath.join( '.' ),
		)?.analysis ?? null
	);
}

function collectStats( results: BlockScanResult[] ): MigrationStats {
  return results.reduce< MigrationStats >(
		( accumulator, result ) => {
			accumulator.total += 1;
			if ( result.analysis.needsMigration ) {
				accumulator.needsMigration += 1;
			}
			if ( result.analysis.currentMigrationVersion === 'unknown' ) {
				accumulator.unknown += 1;
			}
			accumulator.versions[ result.analysis.currentMigrationVersion ] =
				( accumulator.versions[
					result.analysis.currentMigrationVersion
				] ?? 0 ) + 1;
			accumulator.riskTotals.additive +=
				result.analysis.riskSummary.additive.count;
			accumulator.riskTotals.removal +=
				result.analysis.riskSummary.removal.count;
			accumulator.riskTotals.rename +=
				result.analysis.riskSummary.rename.count;
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
				removal: 0,
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

function downloadFile( contents: string, fileName: string, type: string ) {
  const blob = new Blob( [ contents ], { type } );
  const url = URL.createObjectURL( blob );
  const link = document.createElement( 'a' );
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL( url );
}

function formatUnionSummary( result: BlockScanResult[ 'preview' ] ): string {
  if ( result.unionBranches.length === 0 ) {
    return __( 'No union branch changes', 'my-typia-block' );
  }

  return result.unionBranches
		.map(
			( branch ) =>
				`${ branch.field }: ${ branch.legacyBranch ?? 'unknown' } → ${
					branch.nextBranch ?? 'unknown'
				} (${ branch.status })`,
		)
		.join( ', ' );
}

function renderJsonPreview( value: unknown ) {
  return (
		<pre
			style={ {
				background: '#f6f7f7',
				borderRadius: '4px',
				margin: '8px 0 0',
				overflowX: 'auto',
				padding: '8px',
			} }
		>
			{ JSON.stringify( value, null, 2 ) }
		</pre>
	);
}

export function MigrationDashboard() {
  const [ results, setResults ] = useState< BlockScanResult[] >( [] );
  const [ dryRunResult, setDryRunResult ] =
		useState< BatchMigrationResult | null >( null );
  const [ isScanning, setIsScanning ] = useState( false );
  const [ isMigrating, setIsMigrating ] = useState( false );
  const [ error, setError ] = useState< string | null >( null );

  const stats = collectStats( results );

  const runScan = async () => {
    setIsScanning( true );
    setError( null );
    setDryRunResult( null );

    try {
      setResults( await scanSiteForMigrations() );
    } catch ( scanError ) {
      setError(
        scanError instanceof Error ? scanError.message : String(scanError),
      );
    } finally {
      setIsScanning( false );
    }
  };

  const runDryRun = async () => {
    setError( null );

    try {
      setDryRunResult(
        await batchMigrateScanResults( results, { dryRun: true } ),
      );
    } catch ( batchError ) {
      setError(
        batchError instanceof Error ? batchError.message : String(batchError),
      );
    }
  };

  const runBatchMigration = async () => {
    if (
			! window.confirm(
        __('Migrate all detected legacy blocks now?', 'my-typia-block'),
      )
		) {
      return;
    }

    setIsMigrating( true );
    setError( null );

    try {
      setDryRunResult(
        await batchMigrateScanResults( results, { dryRun: false } ),
      );
      await runScan();
    } catch ( batchError ) {
      setError(
        batchError instanceof Error ? batchError.message : String(batchError),
      );
    } finally {
      setIsMigrating( false );
    }
  };

  const downloadReport = () => {
    downloadFile(
      generateMigrationReport(results),
      'my-typia-block-migration-report.md',
      'text/markdown',
    );
  };

  const downloadJson = () => {
    downloadFile(
      JSON.stringify(
        {
          dryRunResult,
          results,
        },
        null,
        2,
      ),
      'my-typia-block-migration-report.json',
      'application/json',
    );
  };

  return (
		<div className="my-typia-block-migration-dashboard">
			<Card>
				<CardBody>
					<div style={ { display: 'grid', gap: '12px' } }>
						<div>
							<strong>
								{ __( 'Migration Manager', 'my-typia-block' ) }
							</strong>
							<p style={ { margin: '4px 0 0' } }>
								{ __(
									'Scan posts for legacy attributes, preview field-level changes, and batch migrate to the current Typia contract.',
									'my-typia-block',
								) }
							</p>
						</div>

						<div
							style={ {
								display: 'flex',
								gap: '8px',
								flexWrap: 'wrap',
							} }
						>
							<Button
								variant="secondary"
								onClick={ runScan }
								disabled={ isScanning }
							>
								{ isScanning
									? __( 'Scanning…', 'my-typia-block' )
									: __( 'Scan site', 'my-typia-block' ) }
							</Button>
							<Button
								variant="secondary"
								onClick={ runDryRun }
								disabled={
									results.length === 0 ||
									isScanning ||
									isMigrating
								}
							>
								{ __( 'Dry run', 'my-typia-block' ) }
							</Button>
							<Button
								variant="primary"
								onClick={ runBatchMigration }
								disabled={
									stats.needsMigration === 0 ||
									isScanning ||
									isMigrating
								}
							>
								{ isMigrating
									? __( 'Migrating…', 'my-typia-block' )
									: __( 'Migrate all', 'my-typia-block' ) }
							</Button>
							<Button
								variant="tertiary"
								onClick={ downloadReport }
								disabled={ results.length === 0 }
							>
								{ __( 'Download markdown', 'my-typia-block' ) }
							</Button>
							<Button
								variant="tertiary"
								onClick={ downloadJson }
								disabled={ results.length === 0 }
							>
								{ __( 'Download JSON', 'my-typia-block' ) }
							</Button>
						</div>

						{ ( isScanning || isMigrating ) && <Spinner /> }

						{ error && (
							<Notice status="error" isDismissible={ false }>
								{ error }
							</Notice>
						) }

						{ results.length > 0 && (
							<div style={ { display: 'grid', gap: '8px' } }>
								<div>
									<strong>
										{ __( 'Summary', 'my-typia-block' ) }
									</strong>
									<ul
										style={ {
											margin: '8px 0 0',
											paddingLeft: '20px',
										} }
									>
										<li>
											{ __(
												'Detected blocks',
												'my-typia-block',
											) }
											: { stats.total }
										</li>
										<li>
											{ __(
												'Need migration',
												'my-typia-block',
											) }
											: { stats.needsMigration }
										</li>
										<li>
											{ __(
												'Unknown shape',
												'my-typia-block',
											) }
											: { stats.unknown }
										</li>
										<li>
											{ __(
												'Risk summary',
												'my-typia-block',
											) }
											: additive{ ' ' }
											{ stats.riskTotals.additive },
											removal{ ' ' }
											{ stats.riskTotals.removal },
											rename { stats.riskTotals.rename },
											transform{ ' ' }
											{
												stats.riskTotals
													.semanticTransform
											}
											, union breaking{ ' ' }
											{ stats.riskTotals.unionBreaking }
										</li>
									</ul>
								</div>

								<div>
									<strong>
										{ __(
											'Version distribution',
											'my-typia-block',
										) }
									</strong>
									<ul
										style={ {
											margin: '8px 0 0',
											paddingLeft: '20px',
										} }
									>
										{ Object.entries( stats.versions ).map(
											( [ version, count ] ) => (
												<li key={ version }>
													{ version }: { count }
												</li>
											),
										) }
									</ul>
								</div>

								<div>
									<strong>
										{ __(
											'Latest results',
											'my-typia-block',
										) }
									</strong>
									<div
										style={ {
											display: 'grid',
											gap: '8px',
											marginTop: '8px',
										} }
									>
										{ results.map( ( result ) => (
											<details
												key={ `${
													result.postId
												}:${ result.blockPath.join(
													'.',
												) }` }
											>
												<summary>
													<strong>
														{ result.postTitle }
													</strong>
													{ ' — ' }
													{
														result.analysis
															.currentMigrationVersion
													}{ ' ' }
													→{ ' ' }
													{
														result.analysis
															.targetMigrationVersion
													}
													{ ' · ' }
													{
														result.preview
															.changedFields
															.length
													}{ ' ' }
													{ __(
														'changed',
														'my-typia-block',
													) }
													{ result.preview.unresolved
														.length > 0
														? ' · manual review'
														: '' }
													{ result.preview
														.validationErrors
														.length > 0
														? ' · validation issues'
														: '' }
												</summary>
												<div
													style={ {
														marginTop: '8px',
														display: 'grid',
														gap: '8px',
													} }
												>
													<div>
														<strong>
															{ __(
																'Changed fields',
																'my-typia-block',
															) }
														</strong>
														<div>
															{ result.preview
																.changedFields
																.length > 0
																? result.preview.changedFields.join(
																		', ',
																  )
																: __(
																		'None',
																		'my-typia-block',
																  ) }
														</div>
													</div>
													<div>
														<strong>
															{ __(
																'Risk summary',
																'my-typia-block',
															) }
														</strong>
														<div>
															{ formatRiskSummaryLine(
																result.analysis,
															) }
														</div>
													</div>
													<div>
														<strong>
															{ __(
																'Union branches',
																'my-typia-block',
															) }
														</strong>
														<div>
															{ formatUnionSummary(
																result.preview,
															) }
														</div>
													</div>
													{ result.preview.unresolved
														.length > 0 && (
														<div>
															<strong>
																{ __(
																	'Manual review',
																	'my-typia-block',
																) }
															</strong>
															<div>
																{ result.preview.unresolved.join(
																	', ',
																) }
															</div>
														</div>
													) }
													{ result.preview
														.validationErrors
														.length > 0 && (
														<div>
															<strong>
																{ __(
																	'Validation',
																	'my-typia-block',
																) }
															</strong>
															<div>
																{ result.preview.validationErrors.join(
																	', ',
																) }
															</div>
														</div>
													) }
													<div>
														<strong>
															{ __(
																'Before',
																'my-typia-block',
															) }
														</strong>
														{ renderJsonPreview(
															result.preview
																.before,
														) }
													</div>
													<div>
														<strong>
															{ __(
																'After',
																'my-typia-block',
															) }
														</strong>
														{ renderJsonPreview(
															result.preview.after,
														) }
													</div>
												</div>
											</details>
										) ) }
									</div>
								</div>
							</div>
						) }

						{ dryRunResult && (
							<div style={ { display: 'grid', gap: '8px' } }>
								<strong>
									{ __(
										'Dry-run preview',
										'my-typia-block',
									) }
								</strong>
								<div
									style={ {
										display: 'grid',
										gap: '8px',
										marginTop: '8px',
									} }
								>
									{ dryRunResult.posts.map( ( post ) => (
										<details key={ post.postId }>
											<summary>
												<strong>
													{ post.postTitle }
												</strong>
												{ ' — ' }
												{ post.status }
												{ post.reason
													? ` (${ post.reason })`
													: '' }
											</summary>
											<div
												style={ {
													marginTop: '8px',
													display: 'grid',
													gap: '8px',
												} }
											>
												{ post.previews.map(
													( preview ) => {
														const analysis =
															findAnalysisForPreview(
																results,
																post.postId,
																preview.blockPath,
															);

														return (
															<div
																key={ preview.blockPath.join(
																	'.',
																) }
															>
																<div>
																	<strong>
																		{
																			preview.currentMigrationVersion
																		}{ ' ' }
																		→{ ' ' }
																		{
																			preview.targetMigrationVersion
																		}
																	</strong>
																	{ preview
																		.preview
																		.changedFields
																		.length >
																	0
																		? ` · ${ preview.preview.changedFields.join(
																				', ',
																		  ) }`
																		: '' }
																	{ analysis
																		? ` · ${ formatRiskSummaryLine(
																				analysis,
																		  ) }`
																		: '' }
																	{ preview.reason
																		? ` · ${ preview.reason }`
																		: '' }
																</div>
																<div>
																	{ formatUnionSummary(
																		preview.preview,
																	) }
																</div>
																{ renderJsonPreview(
																	{
																		after: preview
																			.preview
																			.after,
																		before: preview
																			.preview
																			.before,
																		unresolved:
																			preview
																				.preview
																				.unresolved,
																		validationErrors:
																			preview
																				.preview
																				.validationErrors,
																	},
																) }
															</div>
														);
													},
												) }
											</div>
										</details>
									) ) }
								</div>
							</div>
						) }
					</div>
				</CardBody>
			</Card>
		</div>
	);
}
