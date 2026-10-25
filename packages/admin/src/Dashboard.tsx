import { Card, CardBody, CardHeader, Notice, Spinner } from '@wordpress/components';
import { useEffect, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import { fetchHealth, formatBytes, sortChecks, type CheckStatus, type Health } from './health.ts';

const STATUS_LABEL: Record<CheckStatus, string> = {
	ok: __('OK', 'blumoon-product-studio'),
	warning: __('Check', 'blumoon-product-studio'),
	error: __('Problem', 'blumoon-product-studio'),
};

type State = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; health: Health };

export function Dashboard() {
	const [state, setState] = useState<State>({ kind: 'loading' });

	useEffect(() => {
		fetchHealth()
			.then((health) => {
				setState({ kind: 'ready', health });
			})
			.catch((error: unknown) => {
				setState({
					kind: 'error',
					message: error instanceof Object && 'message' in error ? String(error.message) : __('Unknown error', 'blumoon-product-studio'),
				});
			});
	}, []);

	return (
		<div className="bps-admin">
			<h1>{__('Product Studio', 'blumoon-product-studio')}</h1>
			<Card>
				<CardHeader>
					<h2 className="bps-admin__title">{__('System health', 'blumoon-product-studio')}</h2>
				</CardHeader>
				<CardBody>
					{state.kind === 'loading' && <Spinner />}
					{state.kind === 'error' && (
						<Notice status="error" isDismissible={false}>
							{sprintf(
								/* translators: %s: error message. */
								__('Could not load the health report: %s', 'blumoon-product-studio'),
								state.message,
							)}
						</Notice>
					)}
					{state.kind === 'ready' && <Report health={state.health} />}
				</CardBody>
			</Card>
		</div>
	);
}

function Report({ health }: { health: Health }) {
	const { versions, limits } = health;
	return (
		<>
			<ul className="bps-checks" aria-label={__('Checks', 'blumoon-product-studio')}>
				{sortChecks(health.checks).map((check) => (
					<li key={check.id} className={`bps-check bps-check--${check.status}`}>
						<span className="bps-check__badge">{STATUS_LABEL[check.status]}</span>
						<span className="bps-check__label">{check.label}</span>
						{check.message !== '' && <span className="bps-check__message">{check.message}</span>}
					</li>
				))}
			</ul>
			<dl className="bps-facts">
				<dt>{__('Plugin', 'blumoon-product-studio')}</dt>
				<dd>{versions.plugin}</dd>
				<dt>PHP</dt>
				<dd>{versions.php}</dd>
				<dt>WordPress</dt>
				<dd>{versions.wp}</dd>
				<dt>WooCommerce</dt>
				<dd>{versions.wc ?? '—'}</dd>
				<dt>{__('Database schema', 'blumoon-product-studio')}</dt>
				<dd>{versions.db}</dd>
				<dt>{__('Memory limit', 'blumoon-product-studio')}</dt>
				<dd>{limits.memory === '-1' ? __('Unlimited', 'blumoon-product-studio') : limits.memory}</dd>
				<dt>{__('Max upload', 'blumoon-product-studio')}</dt>
				<dd>{formatBytes(limits.maxUpload)}</dd>
			</dl>
		</>
	);
}
