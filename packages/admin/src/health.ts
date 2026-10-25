import apiFetch from '@wordpress/api-fetch';

export type CheckStatus = 'ok' | 'warning' | 'error';

export interface HealthCheck {
	id: string;
	label: string;
	status: CheckStatus;
	message: string;
}

export interface Health {
	status: 'ok' | 'error';
	versions: { plugin: string; php: string; wp: string; wc: string | null; db: number };
	imagick: { available: boolean; heic: boolean; pdf: boolean };
	limits: { memory: string; maxUpload: number };
	checks: HealthCheck[];
}

/** GET /bps/v1/health. apiFetch adds the REST nonce in wp-admin. */
export const fetchHealth = (): Promise<Health> => apiFetch<Health>({ path: '/bps/v1/health' });

/** Worst status first, so problems are at the top of the list. */
export const sortChecks = (checks: HealthCheck[]): HealthCheck[] => {
	const rank: Record<CheckStatus, number> = { error: 0, warning: 1, ok: 2 };
	return [...checks].sort((a, b) => rank[a.status] - rank[b.status]);
};

export const formatBytes = (bytes: number): string =>
	bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`;
