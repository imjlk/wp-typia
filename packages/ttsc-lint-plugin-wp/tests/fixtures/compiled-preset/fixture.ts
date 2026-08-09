var value = 1;
declare const process: { env: { IS_WORDPRESS_CORE: string } };

process.env.IS_WORDPRESS_CORE;

export { value };
