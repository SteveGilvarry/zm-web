import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GroupEditDialog } from './GroupEditDialog';
import type { Group } from '@/api/groups';

const groups: Group[] = [
  { id: 1, name: 'Outdoor', parent_id: null },
  { id: 2, name: 'Indoor', parent_id: null },
  { id: 3, name: 'Front Yard', parent_id: 1 },
  { id: 4, name: 'East Lawn', parent_id: 3 },
];

describe('GroupEditDialog — visibility', () => {
  it('renders nothing when open=false', () => {
    const { container } = render(
      <GroupEditDialog
        open={false}
        editing={null}
        groups={groups}
        onClose={() => {}}
        onSubmit={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the create dialog when open=true and editing=null', () => {
    render(
      <GroupEditDialog
        open={true}
        editing={null}
        groups={groups}
        onClose={() => {}}
        onSubmit={() => {}}
      />,
    );
    expect(screen.getByRole('dialog', { name: /create group/i })).toBeInTheDocument();
    // Top-level option present.
    expect(screen.getByRole('option', { name: /none \(top level\)/i })).toBeInTheDocument();
  });
});

describe('GroupEditDialog — parent selector cycle prevention', () => {
  it('excludes the editing group and its descendants from the parent dropdown', () => {
    render(
      <GroupEditDialog
        open={true}
        editing={groups[0]} // Outdoor — has children Front Yard, East Lawn
        groups={groups}
        onClose={() => {}}
        onSubmit={() => {}}
      />,
    );
    const select = screen.getByLabelText(/parent/i) as HTMLSelectElement;
    const optionLabels = Array.from(select.options).map((o) => o.textContent ?? '');
    // The dropdown should never let us re-parent a group to itself or a descendant.
    expect(optionLabels.some((l) => /Outdoor/.test(l))).toBe(false);
    expect(optionLabels.some((l) => /Front Yard/.test(l))).toBe(false);
    expect(optionLabels.some((l) => /East Lawn/.test(l))).toBe(false);
    // The sibling root remains.
    expect(optionLabels.some((l) => /Indoor/.test(l))).toBe(true);
  });
});

describe('GroupEditDialog — submission', () => {
  it('calls onSubmit with the trimmed name + selected parent on save', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <GroupEditDialog
        open={true}
        editing={null}
        groups={groups}
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );

    await user.type(screen.getByLabelText(/name/i), '  New Group  ');
    await user.selectOptions(screen.getByLabelText(/parent/i), '2');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit).toHaveBeenCalledWith({ name: 'New Group', parentId: 2 });
  });

  it('disables Save while the name is empty', () => {
    render(
      <GroupEditDialog
        open={true}
        editing={null}
        groups={groups}
        onClose={() => {}}
        onSubmit={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled();
  });
});
