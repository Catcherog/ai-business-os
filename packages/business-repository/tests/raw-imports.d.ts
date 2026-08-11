// Allow `?raw` text imports of source files in boundary tests (vitest resolves
// these; this declaration satisfies tsc --noEmit).
declare module '*.ts?raw' {
  const content: string;
  export default content;
}
