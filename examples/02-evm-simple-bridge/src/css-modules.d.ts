/**
 * CSS Modules type declarations
 *
 * Allows TypeScript to import .css files as modules with typed class names.
 * Vite handles the actual CSS processing at build time.
 */
declare module "*.module.css" {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}
