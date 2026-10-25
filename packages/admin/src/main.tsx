import { createRoot } from '@wordpress/element';
import { Dashboard } from './Dashboard.tsx';
import './admin.css';

const root = document.getElementById('bps-admin-root');
if (root) {
	createRoot(root).render(<Dashboard />);
}
