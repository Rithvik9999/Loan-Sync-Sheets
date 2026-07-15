// Vercel serverless entry point.
//
// Plain JavaScript, importing the pre-bundled app produced by
// build-vercel.mjs (see vercel.json's buildCommand). Keeping this file as
// plain JS (not TypeScript) means Vercel never type-checks it against our
// source tree, avoiding module-resolution mismatches between this
// project's tsconfig and Vercel's own TypeScript defaults.
export { default } from "../dist-vercel/app.mjs";
