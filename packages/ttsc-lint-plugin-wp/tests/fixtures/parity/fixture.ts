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
const message = 'Dynamic message';
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
__('Please wait...', 'my-plugin');
__('Binary ' + 'wait...', 'my-plugin');
__('Choose 1-3 items', 'my-plugin');
__('Do not  collapse this', 'my-plugin');
__(`Line one
line two`, 'my-plugin');
__(' Trim this', 'my-plugin');
__(` Template whitespace `, 'my-plugin');
__('%s', 'my-plugin');
__(message, 'my-plugin');
__(`Dynamic ${value}`, 'my-plugin');
_x('Literal text', 'Context...', 'my-plugin');
// translators: %d: Count
__('Count: %s', 'my-plugin');
// translators: %s: Label, %d: Count
__('Label: %s', 'my-plugin');
__('Address: %s', 'my-plugin');
// translators: %s: City
__('City: %s', 'my-plugin');
// translators: %s: Preference
sprintf(__('Preference: %s', 'my-plugin'), value);
// translators: city: City
__('City: %(city)s', 'my-plugin');
// translators: 1: Address, 2: City
__('Address: %1$s, City: %2$s', 'my-plugin');
// translators: %.2f: Percentage
__('Percentage: %.2f', 'my-plugin');
// translators: %(named).2s: Truncated name
__('Truncated name: %(named).2s', 'my-plugin');
/*
 * translators: %s is the city name.
 * Keep the locale's preferred spelling.
 */
__('Unknown city: %s', 'my-plugin');
// translators: %s: Point count, 1: First, 2: Second
__('%s point', 'my-plugin');
// translators: %s: Surname
const unrelated = true;
__('Surname: %s', 'my-plugin');
void unrelated;
void __experimentalBlocked;
void __unstableAllowed;
