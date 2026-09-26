import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { CaseListView } from '../CaseListView';

describe('CaseListView', () => {
  it('renders the case list and handles search', () => {
    const handleSelect = vi.fn();
    render(<CaseListView onSelectCase={handleSelect} />);

    // Verify header exists
    expect(screen.getByText('LEA Case Dashboard')).toBeDefined();

    // Verify cases are rendered
    expect(screen.getByText('NCRP-2026-33291')).toBeDefined();
    expect(screen.getByText('NCRP-2026-33292')).toBeDefined();

    // Test search functionality
    const searchInput = screen.getByPlaceholderText('Search by wallet or case ref...');
    fireEvent.change(searchInput, { target: { value: '33291' } });
    
    // Only one should match now
    expect(screen.getByText('NCRP-2026-33291')).toBeDefined();
    expect(screen.queryByText('NCRP-2026-33292')).toBeNull();

    // Test selection
    const viewButtons = screen.getAllByText('View');
    fireEvent.click(viewButtons[0]!);
    expect(handleSelect).toHaveBeenCalled();
  });
});
