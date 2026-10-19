import { screen, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';

/**
 * Drive a `ClassicChosen` picker the way a person does: open the box by its
 * accessible name, click the option by its label. Each call adds one option
 * to the selection (the drop closes after a pick, as Chosen's does).
 */
export async function pickChosen(user: UserEvent, name: string, ...labels: Array<string | RegExp>): Promise<void> {
  for (const label of labels) {
    await user.click(screen.getByRole('combobox', { name }));
    await user.click(within(screen.getByRole('listbox', { name })).getByRole('option', { name: label }));
  }
}

/** The chip labels a `ClassicChosen` box is showing, in order. */
export function chosenChips(name: string): string[] {
  const box = screen.getByRole('combobox', { name }).closest('span[class*="min-h-"]');
  if (!box) return [];
  return Array.from(box.querySelectorAll('button[aria-label^="Remove "]'))
    .map((b) => b.getAttribute('aria-label')!.replace(/^Remove /, ''));
}
