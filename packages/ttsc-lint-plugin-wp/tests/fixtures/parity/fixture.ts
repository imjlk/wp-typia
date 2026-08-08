import {
  __experimentalBlocked,
  __unstableAllowed,
} from '@wordpress/components';

const __ = (text = '', domain = '') => `${text}${domain}`;
const _n = (single = '', plural = '', count = 0, domain = '') =>
  `${single}${plural}${count}${domain}`;
const _x = (text = '', context = '', domain = '') =>
  `${text}${context}${domain}`;
const _nx = (
  single = '',
  plural = '',
  count = 0,
  context = '',
  domain = '',
) => `${single}${plural}${count}${context}${domain}`;
const _n_noop = (single = '', plural = '', domain = '') =>
  `${single}${plural}${domain}`;
const _nx_noop = (single = '', plural = '', context = '', domain = '') =>
  `${single}${plural}${context}${domain}`;
const sprintf = (format = '', first = '', second = '') =>
  `${format}${first}${second}`;
const domain = 'dynamic';
const value = 'value';

__('Wrong domain', 'wrong');
__('Missing domain');
__('Dynamic domain', domain);
_x('Wrong contextual domain', 'context', 'wrong');
_nx('One item', 'Many items', 2, 'context', 'wrong');
// Direct template literals remain TemplateLiteral nodes in the upstream rule.
__('Template domain', `my-plugin`);
sprintf();
sprintf('No value argument');
sprintf('No placeholder', value);
sprintf('%s and %2$s', value, value);
// These edge cases intentionally follow the upstream rule's placeholder regex.
sprintf('%b', value);
sprintf('%%%s', value);
sprintf(`%s`, value);
sprintf(_n('%s item', 'items', 2, 'my-plugin'), value);
// WordPress 25.8.0 does not classify the noop helpers as translation functions.
_n_noop('One', 'Many', 'wrong');
_nx_noop('One', 'Many', 'context', 'wrong');
sprintf(_n_noop('%s item', 'items', 'wrong'), value);
__('Allowed domain', 'my-plugin');
_x('Allowed contextual domain', 'context', 'my-plugin');
_nx('One item', 'Many items', 2, 'context', 'my-plugin');
sprintf('%s', value);
sprintf('%1$s and %2$s', value, value);
sprintf(__(`\u0025s`, 'my-plugin'), value);
void __experimentalBlocked;
void __unstableAllowed;
