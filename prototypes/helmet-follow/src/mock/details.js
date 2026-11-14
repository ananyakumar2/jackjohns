import { el } from './ui.js';
const stub = (root) => root.append('…');
export const DETAILS = [{ id: 'card', name: 'Card', idea: '', render: stub, email: () => el('div') }];
