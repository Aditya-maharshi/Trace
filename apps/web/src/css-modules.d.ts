/* eslint-disable @typescript-eslint/no-explicit-any */
declare module "*.module.css" {
  // any is required here so dot-property access works with noPropertyAccessFromIndexSignature: true
  const classes: any;
  export default classes;
}
