import { clsx } from 'clsx';

/** Class strings shared by the classic primitives and pages. */
export const classicLink = 'text-[#337ab7] hover:text-[#23527c] hover:underline';
export const classicInput =
  'px-2 py-1 text-sm bg-white border border-[#ced4da] rounded-sm text-zinc-900 ' +
  'placeholder:text-zinc-400 focus:outline-none focus:border-[#80bdff] disabled:bg-zinc-100';
export const classicSelect = clsx(classicInput, 'pe-6');
