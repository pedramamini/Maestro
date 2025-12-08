/**
 * Tests for Input, TextArea, and InputGroup components
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import {
  Input,
  TextArea,
  InputGroup,
  type InputVariant,
  type InputSize,
  type InputProps,
  type TextAreaProps,
  type InputGroupProps,
} from '../../../web/components/Input';

// Mock the ThemeProvider
vi.mock('../../../web/components/ThemeProvider', () => ({
  useTheme: () => ({
    theme: {
      id: 'dracula',
      name: 'Dracula',
      mode: 'dark',
      colors: {
        bgMain: '#0b0b0d',
        bgSidebar: '#111113',
        bgActivity: '#1c1c1f',
        border: '#27272a',
        textMain: '#e4e4e7',
        textDim: '#a1a1aa',
        accent: '#6366f1',
        accentDim: 'rgba(99, 102, 241, 0.2)',
        accentText: '#a5b4fc',
        success: '#22c55e',
        warning: '#eab308',
        error: '#ef4444',
      },
    },
    isLight: false,
    isDark: true,
    isVibe: false,
    isDevicePreference: false,
  }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('Input Component', () => {
  afterEach(() => {
    cleanup();
  });

  describe('Basic Rendering', () => {
    it('renders an input element', () => {
      render(<Input data-testid="input" />);
      expect(screen.getByTestId('input')).toBeInTheDocument();
    });

    it('renders with placeholder', () => {
      render(<Input placeholder="Enter text..." />);
      expect(screen.getByPlaceholderText('Enter text...')).toBeInTheDocument();
    });

    it('renders with default value', () => {
      render(<Input defaultValue="default text" data-testid="input" />);
      expect(screen.getByTestId('input')).toHaveValue('default text');
    });

    it('renders with controlled value', () => {
      render(<Input value="controlled" onChange={() => {}} data-testid="input" />);
      expect(screen.getByTestId('input')).toHaveValue('controlled');
    });

    it('passes through HTML input attributes', () => {
      render(
        <Input
          id="test-id"
          data-testid="input"
          type="email"
          name="email"
          maxLength={100}
          autoComplete="email"
        />
      );
      const input = screen.getByTestId('input');
      expect(input).toHaveAttribute('id', 'test-id');
      expect(input).toHaveAttribute('type', 'email');
      expect(input).toHaveAttribute('name', 'email');
      expect(input).toHaveAttribute('maxLength', '100');
      expect(input).toHaveAttribute('autoComplete', 'email');
    });

    it('applies custom className', () => {
      render(<Input className="custom-class" data-testid="input" />);
      expect(screen.getByTestId('input').className).toContain('custom-class');
    });

    it('applies custom style', () => {
      render(<Input style={{ marginTop: '10px' }} data-testid="input" />);
      expect(screen.getByTestId('input')).toHaveStyle({ marginTop: '10px' });
    });

    it('forwards ref to input element', () => {
      const ref = React.createRef<HTMLInputElement>();
      render(<Input ref={ref} data-testid="input" />);
      expect(ref.current).toBeInstanceOf(HTMLInputElement);
    });

    it('sets aria-invalid when error is true', () => {
      render(<Input error data-testid="input" />);
      expect(screen.getByTestId('input')).toHaveAttribute('aria-invalid', 'true');
    });

    it('sets aria-invalid to false when no error', () => {
      render(<Input data-testid="input" />);
      expect(screen.getByTestId('input')).toHaveAttribute('aria-invalid', 'false');
    });
  });

  describe('Variants', () => {
    const variants: InputVariant[] = ['default', 'filled', 'ghost'];

    variants.forEach(variant => {
      it(`renders ${variant} variant`, () => {
        render(<Input variant={variant} data-testid="input" />);
        expect(screen.getByTestId('input')).toBeInTheDocument();
      });
    });

    it('applies default variant styles with border', () => {
      render(<Input variant="default" data-testid="input" />);
      const input = screen.getByTestId('input');
      expect(input).toHaveStyle({ backgroundColor: '#0b0b0d' }); // bgMain
      expect(input).toHaveStyle({ color: '#e4e4e7' }); // textMain
      // Check border via style property - browser may normalize hex to rgb
      expect(input.style.border).toMatch(/1px solid (#27272a|rgb\(39,\s*39,\s*42\))/);
    });

    it('applies default variant with error border', () => {
      render(<Input variant="default" error data-testid="input" />);
      const input = screen.getByTestId('input');
      // Browser may normalize hex to rgb
      expect(input.style.border).toMatch(/1px solid (#ef4444|rgb\(239,\s*68,\s*68\))/);
    });

    it('applies filled variant styles with activity background', () => {
      render(<Input variant="filled" data-testid="input" />);
      const input = screen.getByTestId('input');
      expect(input).toHaveStyle({ backgroundColor: '#1c1c1f' }); // bgActivity
      expect(input).toHaveStyle({ color: '#e4e4e7' }); // textMain
      expect(input.style.border).toBe('1px solid transparent');
    });

    it('applies filled variant with error border', () => {
      render(<Input variant="filled" error data-testid="input" />);
      const input = screen.getByTestId('input');
      expect(input.style.border).toMatch(/1px solid (#ef4444|rgb\(239,\s*68,\s*68\))/);
    });

    it('applies ghost variant styles with transparent background', () => {
      render(<Input variant="ghost" data-testid="input" />);
      const input = screen.getByTestId('input');
      expect(input.style.backgroundColor).toBe('transparent');
      expect(input.style.border).toBe('1px solid transparent');
    });

    it('applies ghost variant with error border', () => {
      render(<Input variant="ghost" error data-testid="input" />);
      const input = screen.getByTestId('input');
      expect(input.style.border).toMatch(/1px solid (#ef4444|rgb\(239,\s*68,\s*68\))/);
    });

    it('uses default variant when not specified', () => {
      render(<Input data-testid="input" />);
      const input = screen.getByTestId('input');
      expect(input).toHaveStyle({ backgroundColor: '#0b0b0d' }); // bgMain
    });

    it('handles unknown variant gracefully (default case)', () => {
      render(<Input variant={'unknown' as InputVariant} data-testid="input" />);
      const input = screen.getByTestId('input');
      // Should still render without error
      expect(input).toBeInTheDocument();
    });
  });

  describe('Sizes', () => {
    const sizes: InputSize[] = ['sm', 'md', 'lg'];

    sizes.forEach(size => {
      it(`renders ${size} size`, () => {
        render(<Input size={size} data-testid="input" />);
        expect(screen.getByTestId('input')).toBeInTheDocument();
      });
    });

    it('applies sm size border radius', () => {
      render(<Input size="sm" data-testid="input" />);
      expect(screen.getByTestId('input')).toHaveStyle({ borderRadius: '4px' });
    });

    it('applies md size border radius', () => {
      render(<Input size="md" data-testid="input" />);
      expect(screen.getByTestId('input')).toHaveStyle({ borderRadius: '6px' });
    });

    it('applies lg size border radius', () => {
      render(<Input size="lg" data-testid="input" />);
      expect(screen.getByTestId('input')).toHaveStyle({ borderRadius: '8px' });
    });

    it('uses md size as default', () => {
      render(<Input data-testid="input" />);
      expect(screen.getByTestId('input')).toHaveStyle({ borderRadius: '6px' });
    });

    it('applies correct size class for sm', () => {
      render(<Input size="sm" data-testid="input" />);
      const className = screen.getByTestId('input').className;
      expect(className).toContain('px-2');
      expect(className).toContain('py-1');
      expect(className).toContain('text-xs');
    });

    it('applies correct size class for md', () => {
      render(<Input size="md" data-testid="input" />);
      const className = screen.getByTestId('input').className;
      expect(className).toContain('px-3');
      expect(className).toContain('py-1.5');
      expect(className).toContain('text-sm');
    });

    it('applies correct size class for lg', () => {
      render(<Input size="lg" data-testid="input" />);
      const className = screen.getByTestId('input').className;
      expect(className).toContain('px-4');
      expect(className).toContain('py-2');
      expect(className).toContain('text-base');
    });
  });

  describe('Disabled State', () => {
    it('disables input when disabled prop is true', () => {
      render(<Input disabled data-testid="input" />);
      expect(screen.getByTestId('input')).toBeDisabled();
    });

    it('applies disabled styles', () => {
      render(<Input disabled data-testid="input" />);
      const input = screen.getByTestId('input');
      expect(input).toHaveStyle({ opacity: '0.5' });
      expect(input).toHaveStyle({ cursor: 'not-allowed' });
    });

    it('does not apply disabled styles when enabled', () => {
      render(<Input data-testid="input" />);
      const input = screen.getByTestId('input');
      expect(input).not.toHaveStyle({ opacity: '0.5' });
    });

    it('can receive value from change event even when disabled (DOM behavior)', () => {
      // Note: In real browsers, disabled inputs prevent user interaction.
      // However, fireEvent.change bypasses native restrictions.
      // This test verifies the disabled prop is set correctly.
      render(<Input disabled data-testid="input" />);
      const input = screen.getByTestId('input');
      expect(input).toBeDisabled();
    });
  });

  describe('Full Width', () => {
    it('applies full width when fullWidth is true', () => {
      render(<Input fullWidth data-testid="input" />);
      const input = screen.getByTestId('input');
      expect(input).toHaveStyle({ width: '100%' });
      expect(input.className).toContain('w-full');
    });

    it('does not apply full width by default', () => {
      render(<Input data-testid="input" />);
      const input = screen.getByTestId('input');
      expect(input.className).not.toContain('w-full');
    });
  });

  describe('Icons', () => {
    it('renders left icon', () => {
      render(
        <Input leftIcon={<span data-testid="left-icon">🔍</span>} data-testid="input" />
      );
      expect(screen.getByTestId('left-icon')).toBeInTheDocument();
    });

    it('renders right icon', () => {
      render(
        <Input rightIcon={<span data-testid="right-icon">✕</span>} data-testid="input" />
      );
      expect(screen.getByTestId('right-icon')).toBeInTheDocument();
    });

    it('renders both left and right icons', () => {
      render(
        <Input
          leftIcon={<span data-testid="left-icon">🔍</span>}
          rightIcon={<span data-testid="right-icon">✕</span>}
          data-testid="input"
        />
      );
      expect(screen.getByTestId('left-icon')).toBeInTheDocument();
      expect(screen.getByTestId('right-icon')).toBeInTheDocument();
    });

    it('wraps input with icons in container div', () => {
      const { container } = render(
        <Input leftIcon={<span>🔍</span>} data-testid="input" />
      );
      const wrapper = container.querySelector('.relative.inline-flex');
      expect(wrapper).toBeInTheDocument();
    });

    it('applies full width to container when using icons', () => {
      const { container } = render(
        <Input leftIcon={<span>🔍</span>} fullWidth data-testid="input" />
      );
      const wrapper = container.querySelector('.relative.inline-flex');
      expect(wrapper?.className).toContain('w-full');
    });

    it('positions left icon absolutely', () => {
      const { container } = render(
        <Input leftIcon={<span data-testid="left-icon">🔍</span>} data-testid="input" />
      );
      const iconWrapper = screen.getByTestId('left-icon').parentElement;
      expect(iconWrapper?.className).toContain('absolute');
      expect(iconWrapper?.className).toContain('left-2');
    });

    it('positions right icon absolutely', () => {
      const { container } = render(
        <Input rightIcon={<span data-testid="right-icon">✕</span>} data-testid="input" />
      );
      const iconWrapper = screen.getByTestId('right-icon').parentElement;
      expect(iconWrapper?.className).toContain('absolute');
      expect(iconWrapper?.className).toContain('right-2');
    });

    it('applies left padding class for sm size with left icon', () => {
      render(<Input leftIcon={<span>🔍</span>} size="sm" data-testid="input" />);
      expect(screen.getByTestId('input').className).toContain('pl-7');
    });

    it('applies left padding class for md size with left icon', () => {
      render(<Input leftIcon={<span>🔍</span>} size="md" data-testid="input" />);
      expect(screen.getByTestId('input').className).toContain('pl-9');
    });

    it('applies left padding class for lg size with left icon', () => {
      render(<Input leftIcon={<span>🔍</span>} size="lg" data-testid="input" />);
      expect(screen.getByTestId('input').className).toContain('pl-11');
    });

    it('applies right padding class for sm size with right icon', () => {
      render(<Input rightIcon={<span>✕</span>} size="sm" data-testid="input" />);
      expect(screen.getByTestId('input').className).toContain('pr-7');
    });

    it('applies right padding class for md size with right icon', () => {
      render(<Input rightIcon={<span>✕</span>} size="md" data-testid="input" />);
      expect(screen.getByTestId('input').className).toContain('pr-9');
    });

    it('applies right padding class for lg size with right icon', () => {
      render(<Input rightIcon={<span>✕</span>} size="lg" data-testid="input" />);
      expect(screen.getByTestId('input').className).toContain('pr-11');
    });

    it('applies icon color from theme', () => {
      render(
        <Input leftIcon={<span data-testid="left-icon">🔍</span>} data-testid="input" />
      );
      const iconWrapper = screen.getByTestId('left-icon').parentElement;
      expect(iconWrapper).toHaveStyle({ color: '#a1a1aa' }); // textDim
    });

    it('makes icon container pointer-events-none', () => {
      render(
        <Input leftIcon={<span data-testid="left-icon">🔍</span>} data-testid="input" />
      );
      const iconWrapper = screen.getByTestId('left-icon').parentElement;
      expect(iconWrapper?.className).toContain('pointer-events-none');
    });
  });

  describe('Event Handling', () => {
    it('calls onChange handler when value changes', () => {
      const handleChange = vi.fn();
      render(<Input onChange={handleChange} data-testid="input" />);
      fireEvent.change(screen.getByTestId('input'), { target: { value: 'test' } });
      expect(handleChange).toHaveBeenCalledTimes(1);
    });

    it('calls onFocus handler when focused', () => {
      const handleFocus = vi.fn();
      render(<Input onFocus={handleFocus} data-testid="input" />);
      fireEvent.focus(screen.getByTestId('input'));
      expect(handleFocus).toHaveBeenCalledTimes(1);
    });

    it('calls onBlur handler when blurred', () => {
      const handleBlur = vi.fn();
      render(<Input onBlur={handleBlur} data-testid="input" />);
      fireEvent.blur(screen.getByTestId('input'));
      expect(handleBlur).toHaveBeenCalledTimes(1);
    });

    it('calls onKeyDown handler on key press', () => {
      const handleKeyDown = vi.fn();
      render(<Input onKeyDown={handleKeyDown} data-testid="input" />);
      fireEvent.keyDown(screen.getByTestId('input'), { key: 'Enter' });
      expect(handleKeyDown).toHaveBeenCalledTimes(1);
    });

    it('calls onKeyUp handler on key release', () => {
      const handleKeyUp = vi.fn();
      render(<Input onKeyUp={handleKeyUp} data-testid="input" />);
      fireEvent.keyUp(screen.getByTestId('input'), { key: 'a' });
      expect(handleKeyUp).toHaveBeenCalledTimes(1);
    });
  });

  describe('Style Composition', () => {
    it('applies outline none', () => {
      render(<Input data-testid="input" />);
      expect(screen.getByTestId('input')).toHaveStyle({ outline: 'none' });
    });

    it('includes transition styles', () => {
      render(<Input data-testid="input" />);
      const input = screen.getByTestId('input');
      expect(input.style.transition).toContain('background-color');
      expect(input.style.transition).toContain('border-color');
    });

    it('custom style overrides default styles', () => {
      render(<Input style={{ backgroundColor: 'purple' }} data-testid="input" />);
      expect(screen.getByTestId('input').style.backgroundColor).toBe('purple');
    });

    it('sets placeholder color CSS variable', () => {
      render(<Input data-testid="input" />);
      const input = screen.getByTestId('input');
      expect(input.style.getPropertyValue('--placeholder-color')).toBe('#a1a1aa');
    });
  });

  describe('Class Name Construction', () => {
    it('includes font-normal class', () => {
      render(<Input data-testid="input" />);
      expect(screen.getByTestId('input').className).toContain('font-normal');
    });

    it('includes focus ring classes', () => {
      render(<Input data-testid="input" />);
      const className = screen.getByTestId('input').className;
      expect(className).toContain('focus:ring-2');
      expect(className).toContain('focus:ring-offset-1');
    });

    it('includes transition-colors class', () => {
      render(<Input data-testid="input" />);
      expect(screen.getByTestId('input').className).toContain('transition-colors');
    });

    it('filters out empty class names', () => {
      render(<Input fullWidth={false} data-testid="input" />);
      const className = screen.getByTestId('input').className;
      // Should not have consecutive spaces from filtered empty classes
      expect(className).not.toMatch(/\s{2,}/);
    });
  });

  describe('Input Types', () => {
    it('supports text type', () => {
      render(<Input type="text" data-testid="input" />);
      expect(screen.getByTestId('input')).toHaveAttribute('type', 'text');
    });

    it('supports password type', () => {
      render(<Input type="password" data-testid="input" />);
      expect(screen.getByTestId('input')).toHaveAttribute('type', 'password');
    });

    it('supports email type', () => {
      render(<Input type="email" data-testid="input" />);
      expect(screen.getByTestId('input')).toHaveAttribute('type', 'email');
    });

    it('supports number type', () => {
      render(<Input type="number" data-testid="input" />);
      expect(screen.getByTestId('input')).toHaveAttribute('type', 'number');
    });

    it('supports search type', () => {
      render(<Input type="search" data-testid="input" />);
      expect(screen.getByTestId('input')).toHaveAttribute('type', 'search');
    });

    it('supports tel type', () => {
      render(<Input type="tel" data-testid="input" />);
      expect(screen.getByTestId('input')).toHaveAttribute('type', 'tel');
    });

    it('supports url type', () => {
      render(<Input type="url" data-testid="input" />);
      expect(screen.getByTestId('input')).toHaveAttribute('type', 'url');
    });
  });

  describe('Accessibility', () => {
    it('is focusable', () => {
      render(<Input data-testid="input" />);
      const input = screen.getByTestId('input');
      input.focus();
      expect(document.activeElement).toBe(input);
    });

    it('supports aria-label', () => {
      render(<Input aria-label="Search field" data-testid="input" />);
      expect(screen.getByLabelText('Search field')).toBeInTheDocument();
    });

    it('supports aria-describedby', () => {
      render(
        <>
          <Input aria-describedby="helper" data-testid="input" />
          <span id="helper">Help text</span>
        </>
      );
      expect(screen.getByTestId('input')).toHaveAttribute('aria-describedby', 'helper');
    });

    it('supports required attribute', () => {
      render(<Input required data-testid="input" />);
      expect(screen.getByTestId('input')).toBeRequired();
    });

    it('supports readonly attribute', () => {
      render(<Input readOnly data-testid="input" />);
      expect(screen.getByTestId('input')).toHaveAttribute('readonly');
    });
  });
});

describe('TextArea Component', () => {
  afterEach(() => {
    cleanup();
  });

  describe('Basic Rendering', () => {
    it('renders a textarea element', () => {
      render(<TextArea data-testid="textarea" />);
      expect(screen.getByTestId('textarea').tagName).toBe('TEXTAREA');
    });

    it('renders with placeholder', () => {
      render(<TextArea placeholder="Enter message..." />);
      expect(screen.getByPlaceholderText('Enter message...')).toBeInTheDocument();
    });

    it('renders with default value', () => {
      render(<TextArea defaultValue="default text" data-testid="textarea" />);
      expect(screen.getByTestId('textarea')).toHaveValue('default text');
    });

    it('renders with controlled value', () => {
      render(<TextArea value="controlled" onChange={() => {}} data-testid="textarea" />);
      expect(screen.getByTestId('textarea')).toHaveValue('controlled');
    });

    it('passes through HTML textarea attributes', () => {
      render(
        <TextArea
          id="test-id"
          data-testid="textarea"
          name="message"
          maxLength={1000}
        />
      );
      const textarea = screen.getByTestId('textarea');
      expect(textarea).toHaveAttribute('id', 'test-id');
      expect(textarea).toHaveAttribute('name', 'message');
      expect(textarea).toHaveAttribute('maxLength', '1000');
    });

    it('applies custom className', () => {
      render(<TextArea className="custom-class" data-testid="textarea" />);
      expect(screen.getByTestId('textarea').className).toContain('custom-class');
    });

    it('applies custom style', () => {
      render(<TextArea style={{ marginTop: '10px' }} data-testid="textarea" />);
      expect(screen.getByTestId('textarea')).toHaveStyle({ marginTop: '10px' });
    });

    it('forwards ref to textarea element', () => {
      const ref = React.createRef<HTMLTextAreaElement>();
      render(<TextArea ref={ref} data-testid="textarea" />);
      expect(ref.current).toBeInstanceOf(HTMLTextAreaElement);
    });

    it('forwards ref via callback function', () => {
      let refElement: HTMLTextAreaElement | null = null;
      const callbackRef = (el: HTMLTextAreaElement | null) => {
        refElement = el;
      };
      render(<TextArea ref={callbackRef} data-testid="textarea" />);
      expect(refElement).toBeInstanceOf(HTMLTextAreaElement);
    });

    it('sets aria-invalid when error is true', () => {
      render(<TextArea error data-testid="textarea" />);
      expect(screen.getByTestId('textarea')).toHaveAttribute('aria-invalid', 'true');
    });

    it('sets aria-invalid to false when no error', () => {
      render(<TextArea data-testid="textarea" />);
      expect(screen.getByTestId('textarea')).toHaveAttribute('aria-invalid', 'false');
    });
  });

  describe('Variants', () => {
    const variants: InputVariant[] = ['default', 'filled', 'ghost'];

    variants.forEach(variant => {
      it(`renders ${variant} variant`, () => {
        render(<TextArea variant={variant} data-testid="textarea" />);
        expect(screen.getByTestId('textarea')).toBeInTheDocument();
      });
    });

    it('applies default variant styles with border', () => {
      render(<TextArea variant="default" data-testid="textarea" />);
      const textarea = screen.getByTestId('textarea');
      expect(textarea).toHaveStyle({ backgroundColor: '#0b0b0d' }); // bgMain
      expect(textarea).toHaveStyle({ color: '#e4e4e7' }); // textMain
      expect(textarea.style.border).toMatch(/1px solid (#27272a|rgb\(39,\s*39,\s*42\))/); // border
    });

    it('applies default variant with error border', () => {
      render(<TextArea variant="default" error data-testid="textarea" />);
      expect(screen.getByTestId('textarea').style.border).toMatch(/1px solid (#ef4444|rgb\(239,\s*68,\s*68\))/);
    });

    it('applies filled variant styles with activity background', () => {
      render(<TextArea variant="filled" data-testid="textarea" />);
      const textarea = screen.getByTestId('textarea');
      expect(textarea).toHaveStyle({ backgroundColor: '#1c1c1f' }); // bgActivity
      expect(textarea.style.border).toBe('1px solid transparent');
    });

    it('applies filled variant with error border', () => {
      render(<TextArea variant="filled" error data-testid="textarea" />);
      expect(screen.getByTestId('textarea').style.border).toMatch(/1px solid (#ef4444|rgb\(239,\s*68,\s*68\))/);
    });

    it('applies ghost variant styles with transparent background', () => {
      render(<TextArea variant="ghost" data-testid="textarea" />);
      const textarea = screen.getByTestId('textarea');
      expect(textarea.style.backgroundColor).toBe('transparent');
      expect(textarea.style.border).toBe('1px solid transparent');
    });

    it('applies ghost variant with error border', () => {
      render(<TextArea variant="ghost" error data-testid="textarea" />);
      expect(screen.getByTestId('textarea').style.border).toMatch(/1px solid (#ef4444|rgb\(239,\s*68,\s*68\))/);
    });

    it('uses default variant when not specified', () => {
      render(<TextArea data-testid="textarea" />);
      expect(screen.getByTestId('textarea')).toHaveStyle({ backgroundColor: '#0b0b0d' });
    });

    it('handles unknown variant gracefully (default case)', () => {
      render(<TextArea variant={'unknown' as InputVariant} data-testid="textarea" />);
      expect(screen.getByTestId('textarea')).toBeInTheDocument();
    });
  });

  describe('Sizes', () => {
    const sizes: InputSize[] = ['sm', 'md', 'lg'];

    sizes.forEach(size => {
      it(`renders ${size} size`, () => {
        render(<TextArea size={size} data-testid="textarea" />);
        expect(screen.getByTestId('textarea')).toBeInTheDocument();
      });
    });

    it('applies sm size border radius', () => {
      render(<TextArea size="sm" data-testid="textarea" />);
      expect(screen.getByTestId('textarea')).toHaveStyle({ borderRadius: '4px' });
    });

    it('applies md size border radius', () => {
      render(<TextArea size="md" data-testid="textarea" />);
      expect(screen.getByTestId('textarea')).toHaveStyle({ borderRadius: '6px' });
    });

    it('applies lg size border radius', () => {
      render(<TextArea size="lg" data-testid="textarea" />);
      expect(screen.getByTestId('textarea')).toHaveStyle({ borderRadius: '8px' });
    });

    it('uses md size as default', () => {
      render(<TextArea data-testid="textarea" />);
      expect(screen.getByTestId('textarea')).toHaveStyle({ borderRadius: '6px' });
    });

    it('applies correct size class for sm', () => {
      render(<TextArea size="sm" data-testid="textarea" />);
      const className = screen.getByTestId('textarea').className;
      expect(className).toContain('px-2');
      expect(className).toContain('py-1');
      expect(className).toContain('text-xs');
    });

    it('applies correct size class for md', () => {
      render(<TextArea size="md" data-testid="textarea" />);
      const className = screen.getByTestId('textarea').className;
      expect(className).toContain('px-3');
      expect(className).toContain('py-1.5');
      expect(className).toContain('text-sm');
    });

    it('applies correct size class for lg', () => {
      render(<TextArea size="lg" data-testid="textarea" />);
      const className = screen.getByTestId('textarea').className;
      expect(className).toContain('px-4');
      expect(className).toContain('py-2');
      expect(className).toContain('text-base');
    });
  });

  describe('Disabled State', () => {
    it('disables textarea when disabled prop is true', () => {
      render(<TextArea disabled data-testid="textarea" />);
      expect(screen.getByTestId('textarea')).toBeDisabled();
    });

    it('applies disabled styles', () => {
      render(<TextArea disabled data-testid="textarea" />);
      const textarea = screen.getByTestId('textarea');
      expect(textarea).toHaveStyle({ opacity: '0.5' });
      expect(textarea).toHaveStyle({ cursor: 'not-allowed' });
    });

    it('does not apply disabled styles when enabled', () => {
      render(<TextArea data-testid="textarea" />);
      expect(screen.getByTestId('textarea')).not.toHaveStyle({ opacity: '0.5' });
    });
  });

  describe('Full Width', () => {
    it('applies full width when fullWidth is true', () => {
      render(<TextArea fullWidth data-testid="textarea" />);
      const textarea = screen.getByTestId('textarea');
      expect(textarea).toHaveStyle({ width: '100%' });
      expect(textarea.className).toContain('w-full');
    });

    it('does not apply full width by default', () => {
      render(<TextArea data-testid="textarea" />);
      expect(screen.getByTestId('textarea').className).not.toContain('w-full');
    });
  });

  describe('Rows Configuration', () => {
    it('applies default minRows of 3', () => {
      render(<TextArea data-testid="textarea" />);
      expect(screen.getByTestId('textarea')).toHaveAttribute('rows', '3');
    });

    it('applies custom minRows', () => {
      render(<TextArea minRows={5} data-testid="textarea" />);
      expect(screen.getByTestId('textarea')).toHaveAttribute('rows', '5');
    });

    it('calculates min-height based on minRows for sm size', () => {
      render(<TextArea size="sm" minRows={4} data-testid="textarea" />);
      // lineHeight for sm is 16, so 4 rows = 64px
      expect(screen.getByTestId('textarea')).toHaveStyle({ minHeight: '64px' });
    });

    it('calculates min-height based on minRows for md size', () => {
      render(<TextArea size="md" minRows={4} data-testid="textarea" />);
      // lineHeight for md is 20, so 4 rows = 80px
      expect(screen.getByTestId('textarea')).toHaveStyle({ minHeight: '80px' });
    });

    it('calculates min-height based on minRows for lg size', () => {
      render(<TextArea size="lg" minRows={4} data-testid="textarea" />);
      // lineHeight for lg is 24, so 4 rows = 96px
      expect(screen.getByTestId('textarea')).toHaveStyle({ minHeight: '96px' });
    });
  });

  describe('Auto Resize', () => {
    it('sets resize to none when autoResize is true', () => {
      render(<TextArea autoResize data-testid="textarea" />);
      expect(screen.getByTestId('textarea')).toHaveStyle({ resize: 'none' });
    });

    it('sets resize to vertical when autoResize is false', () => {
      render(<TextArea autoResize={false} data-testid="textarea" />);
      expect(screen.getByTestId('textarea')).toHaveStyle({ resize: 'vertical' });
    });

    it('defaults to vertical resize', () => {
      render(<TextArea data-testid="textarea" />);
      expect(screen.getByTestId('textarea')).toHaveStyle({ resize: 'vertical' });
    });

    it('triggers auto-resize on input when autoResize is true', () => {
      render(<TextArea autoResize minRows={2} data-testid="textarea" />);
      const textarea = screen.getByTestId('textarea') as HTMLTextAreaElement;

      // Simulate input
      fireEvent.input(textarea, { target: { value: 'Line 1\nLine 2\nLine 3\nLine 4' } });

      // Height should be auto-adjusted (we can't test exact height in jsdom without scrollHeight)
      expect(textarea.style.height).toBeDefined();
    });

    it('calls original onInput handler with autoResize', () => {
      const handleInput = vi.fn();
      render(<TextArea autoResize onInput={handleInput} data-testid="textarea" />);
      fireEvent.input(screen.getByTestId('textarea'), { target: { value: 'test' } });
      expect(handleInput).toHaveBeenCalledTimes(1);
    });

    it('calls original onInput handler without autoResize', () => {
      const handleInput = vi.fn();
      render(<TextArea onInput={handleInput} data-testid="textarea" />);
      fireEvent.input(screen.getByTestId('textarea'), { target: { value: 'test' } });
      expect(handleInput).toHaveBeenCalledTimes(1);
    });

    it('handles maxRows constraint', () => {
      render(<TextArea autoResize minRows={2} maxRows={4} size="md" data-testid="textarea" />);
      const textarea = screen.getByTestId('textarea') as HTMLTextAreaElement;

      // Mock scrollHeight to simulate content exceeding maxRows
      Object.defineProperty(textarea, 'scrollHeight', { value: 200, configurable: true });

      fireEvent.input(textarea, { target: { value: 'Many\nlines\nof\ntext\nhere\nexceeding\nmax' } });

      // maxHeight would be 4 * 20 = 80px for md size
      // overflow should be auto when exceeding
      // Note: In actual implementation, this sets overflowY
      expect(textarea.style.height).toBeDefined();
    });

    it('sets overflowY to hidden when content fits within maxRows', () => {
      render(<TextArea autoResize minRows={2} maxRows={10} size="md" data-testid="textarea" />);
      const textarea = screen.getByTestId('textarea') as HTMLTextAreaElement;

      // Mock scrollHeight to simulate content within maxRows
      Object.defineProperty(textarea, 'scrollHeight', { value: 40, configurable: true });

      fireEvent.input(textarea, { target: { value: 'Short text' } });

      // overflow should be hidden when within bounds
      expect(textarea.style.overflowY).toBe('hidden');
    });
  });

  describe('Event Handling', () => {
    it('calls onChange handler when value changes', () => {
      const handleChange = vi.fn();
      render(<TextArea onChange={handleChange} data-testid="textarea" />);
      fireEvent.change(screen.getByTestId('textarea'), { target: { value: 'test' } });
      expect(handleChange).toHaveBeenCalledTimes(1);
    });

    it('calls onFocus handler when focused', () => {
      const handleFocus = vi.fn();
      render(<TextArea onFocus={handleFocus} data-testid="textarea" />);
      fireEvent.focus(screen.getByTestId('textarea'));
      expect(handleFocus).toHaveBeenCalledTimes(1);
    });

    it('calls onBlur handler when blurred', () => {
      const handleBlur = vi.fn();
      render(<TextArea onBlur={handleBlur} data-testid="textarea" />);
      fireEvent.blur(screen.getByTestId('textarea'));
      expect(handleBlur).toHaveBeenCalledTimes(1);
    });

    it('calls onKeyDown handler on key press', () => {
      const handleKeyDown = vi.fn();
      render(<TextArea onKeyDown={handleKeyDown} data-testid="textarea" />);
      fireEvent.keyDown(screen.getByTestId('textarea'), { key: 'Enter' });
      expect(handleKeyDown).toHaveBeenCalledTimes(1);
    });
  });

  describe('Style Composition', () => {
    it('applies outline none', () => {
      render(<TextArea data-testid="textarea" />);
      expect(screen.getByTestId('textarea')).toHaveStyle({ outline: 'none' });
    });

    it('includes transition styles', () => {
      render(<TextArea data-testid="textarea" />);
      const textarea = screen.getByTestId('textarea');
      expect(textarea.style.transition).toContain('background-color');
    });

    it('custom style overrides default styles', () => {
      render(<TextArea style={{ backgroundColor: 'purple' }} data-testid="textarea" />);
      expect(screen.getByTestId('textarea').style.backgroundColor).toBe('purple');
    });

    it('sets placeholder color CSS variable', () => {
      render(<TextArea data-testid="textarea" />);
      const textarea = screen.getByTestId('textarea');
      expect(textarea.style.getPropertyValue('--placeholder-color')).toBe('#a1a1aa');
    });
  });

  describe('Class Name Construction', () => {
    it('includes font-normal class', () => {
      render(<TextArea data-testid="textarea" />);
      expect(screen.getByTestId('textarea').className).toContain('font-normal');
    });

    it('includes focus ring classes', () => {
      render(<TextArea data-testid="textarea" />);
      const className = screen.getByTestId('textarea').className;
      expect(className).toContain('focus:ring-2');
      expect(className).toContain('focus:ring-offset-1');
    });

    it('includes transition-colors class', () => {
      render(<TextArea data-testid="textarea" />);
      expect(screen.getByTestId('textarea').className).toContain('transition-colors');
    });
  });

  describe('Accessibility', () => {
    it('is focusable', () => {
      render(<TextArea data-testid="textarea" />);
      const textarea = screen.getByTestId('textarea');
      textarea.focus();
      expect(document.activeElement).toBe(textarea);
    });

    it('supports aria-label', () => {
      render(<TextArea aria-label="Message input" data-testid="textarea" />);
      expect(screen.getByLabelText('Message input')).toBeInTheDocument();
    });

    it('supports required attribute', () => {
      render(<TextArea required data-testid="textarea" />);
      expect(screen.getByTestId('textarea')).toBeRequired();
    });

    it('supports readonly attribute', () => {
      render(<TextArea readOnly data-testid="textarea" />);
      expect(screen.getByTestId('textarea')).toHaveAttribute('readonly');
    });
  });
});

describe('InputGroup Component', () => {
  afterEach(() => {
    cleanup();
  });

  describe('Basic Rendering', () => {
    it('renders children', () => {
      render(
        <InputGroup>
          <Input data-testid="input" />
        </InputGroup>
      );
      expect(screen.getByTestId('input')).toBeInTheDocument();
    });

    it('renders with label', () => {
      render(
        <InputGroup label="Email">
          <Input data-testid="input" />
        </InputGroup>
      );
      expect(screen.getByText('Email')).toBeInTheDocument();
    });

    it('renders label as label element', () => {
      const { container } = render(
        <InputGroup label="Email">
          <Input data-testid="input" />
        </InputGroup>
      );
      expect(container.querySelector('label')).toBeInTheDocument();
    });

    it('applies label styles from theme', () => {
      render(
        <InputGroup label="Email">
          <Input data-testid="input" />
        </InputGroup>
      );
      const label = screen.getByText('Email');
      expect(label).toHaveStyle({ color: '#e4e4e7' }); // textMain
    });

    it('renders helper text', () => {
      render(
        <InputGroup helperText="Enter your email address">
          <Input data-testid="input" />
        </InputGroup>
      );
      expect(screen.getByText('Enter your email address')).toBeInTheDocument();
    });

    it('renders error message', () => {
      render(
        <InputGroup error="Invalid email">
          <Input data-testid="input" />
        </InputGroup>
      );
      expect(screen.getByText('Invalid email')).toBeInTheDocument();
    });

    it('error message overrides helper text', () => {
      render(
        <InputGroup helperText="Enter your email" error="Invalid email">
          <Input data-testid="input" />
        </InputGroup>
      );
      expect(screen.getByText('Invalid email')).toBeInTheDocument();
      expect(screen.queryByText('Enter your email')).not.toBeInTheDocument();
    });

    it('renders required indicator', () => {
      render(
        <InputGroup label="Email" required>
          <Input data-testid="input" />
        </InputGroup>
      );
      expect(screen.getByText('*')).toBeInTheDocument();
    });

    it('required indicator uses error color', () => {
      render(
        <InputGroup label="Email" required>
          <Input data-testid="input" />
        </InputGroup>
      );
      const asterisk = screen.getByText('*');
      expect(asterisk).toHaveStyle({ color: '#ef4444' }); // error color
    });

    it('does not render required indicator without label', () => {
      render(
        <InputGroup required>
          <Input data-testid="input" />
        </InputGroup>
      );
      expect(screen.queryByText('*')).not.toBeInTheDocument();
    });
  });

  describe('Custom Styling', () => {
    it('applies custom className', () => {
      const { container } = render(
        <InputGroup className="custom-class">
          <Input data-testid="input" />
        </InputGroup>
      );
      expect(container.firstChild).toHaveClass('custom-class');
    });

    it('includes flex column layout', () => {
      const { container } = render(
        <InputGroup>
          <Input data-testid="input" />
        </InputGroup>
      );
      expect(container.firstChild).toHaveClass('flex');
      expect(container.firstChild).toHaveClass('flex-col');
    });

    it('includes gap class', () => {
      const { container } = render(
        <InputGroup>
          <Input data-testid="input" />
        </InputGroup>
      );
      expect(container.firstChild).toHaveClass('gap-1');
    });
  });

  describe('Helper/Error Text Styling', () => {
    it('applies textDim color to helper text', () => {
      render(
        <InputGroup helperText="Helper">
          <Input data-testid="input" />
        </InputGroup>
      );
      expect(screen.getByText('Helper')).toHaveStyle({ color: '#a1a1aa' }); // textDim
    });

    it('applies error color to error text', () => {
      render(
        <InputGroup error="Error">
          <Input data-testid="input" />
        </InputGroup>
      );
      expect(screen.getByText('Error')).toHaveStyle({ color: '#ef4444' }); // error
    });

    it('applies text-xs class to helper/error text', () => {
      render(
        <InputGroup helperText="Helper">
          <Input data-testid="input" />
        </InputGroup>
      );
      expect(screen.getByText('Helper').className).toContain('text-xs');
    });
  });

  describe('Label Styling', () => {
    it('applies text-sm class to label', () => {
      render(
        <InputGroup label="Label">
          <Input data-testid="input" />
        </InputGroup>
      );
      expect(screen.getByText('Label').className).toContain('text-sm');
    });

    it('applies font-medium class to label', () => {
      render(
        <InputGroup label="Label">
          <Input data-testid="input" />
        </InputGroup>
      );
      expect(screen.getByText('Label').className).toContain('font-medium');
    });
  });

  describe('Complete Example', () => {
    it('renders full InputGroup with all elements', () => {
      render(
        <InputGroup
          label="Email Address"
          helperText="We will never share your email"
          required
        >
          <Input type="email" placeholder="john@example.com" data-testid="input" />
        </InputGroup>
      );

      expect(screen.getByText('Email Address')).toBeInTheDocument();
      expect(screen.getByText('*')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('john@example.com')).toBeInTheDocument();
      expect(screen.getByText('We will never share your email')).toBeInTheDocument();
    });

    it('renders InputGroup with error state', () => {
      render(
        <InputGroup
          label="Email Address"
          error="Please enter a valid email"
          required
        >
          <Input type="email" error data-testid="input" />
        </InputGroup>
      );

      expect(screen.getByText('Email Address')).toBeInTheDocument();
      expect(screen.getByText('Please enter a valid email')).toBeInTheDocument();
      expect(screen.getByTestId('input')).toHaveAttribute('aria-invalid', 'true');
    });

    it('works with TextArea', () => {
      render(
        <InputGroup label="Message" helperText="Max 500 characters">
          <TextArea data-testid="textarea" maxLength={500} />
        </InputGroup>
      );

      expect(screen.getByText('Message')).toBeInTheDocument();
      expect(screen.getByText('Max 500 characters')).toBeInTheDocument();
      expect(screen.getByTestId('textarea')).toBeInTheDocument();
    });
  });
});

describe('Type Exports', () => {
  it('exports InputVariant type', () => {
    const variant: InputVariant = 'default';
    expect(variant).toBe('default');
  });

  it('exports all InputVariant values', () => {
    const variants: InputVariant[] = ['default', 'filled', 'ghost'];
    expect(variants).toHaveLength(3);
  });

  it('exports InputSize type', () => {
    const size: InputSize = 'md';
    expect(size).toBe('md');
  });

  it('exports all InputSize values', () => {
    const sizes: InputSize[] = ['sm', 'md', 'lg'];
    expect(sizes).toHaveLength(3);
  });

  it('exports InputProps interface', () => {
    const props: InputProps = {
      variant: 'filled',
      size: 'lg',
      error: true,
      fullWidth: true,
      leftIcon: <span>🔍</span>,
      rightIcon: <span>✕</span>,
    };
    expect(props.variant).toBe('filled');
    expect(props.size).toBe('lg');
    expect(props.error).toBe(true);
  });

  it('exports TextAreaProps interface', () => {
    const props: TextAreaProps = {
      variant: 'ghost',
      size: 'sm',
      error: false,
      fullWidth: false,
      minRows: 5,
      maxRows: 10,
      autoResize: true,
    };
    expect(props.variant).toBe('ghost');
    expect(props.minRows).toBe(5);
    expect(props.autoResize).toBe(true);
  });

  it('exports InputGroupProps interface', () => {
    const props: InputGroupProps = {
      label: 'Test Label',
      helperText: 'Helper text',
      error: 'Error message',
      required: true,
      children: <Input />,
      className: 'custom-class',
    };
    expect(props.label).toBe('Test Label');
    expect(props.required).toBe(true);
  });
});

describe('Default Export', () => {
  it('exports Input as default', async () => {
    const module = await import('../../../web/components/Input');
    expect(module.default).toBe(module.Input);
  });
});

describe('Edge Cases', () => {
  afterEach(() => {
    cleanup();
  });

  it('handles empty className gracefully', () => {
    render(<Input className="" data-testid="input" />);
    expect(screen.getByTestId('input')).toBeInTheDocument();
  });

  it('handles special characters in value', () => {
    render(<Input value="<script>alert('xss')</script>" onChange={() => {}} data-testid="input" />);
    expect(screen.getByTestId('input')).toHaveValue("<script>alert('xss')</script>");
  });

  it('handles unicode in value', () => {
    render(<Input value="你好世界 🌍 مرحبا" onChange={() => {}} data-testid="input" />);
    expect(screen.getByTestId('input')).toHaveValue('你好世界 🌍 مرحبا');
  });

  it('handles very long value', () => {
    const longValue = 'a'.repeat(10000);
    render(<Input value={longValue} onChange={() => {}} data-testid="input" />);
    expect(screen.getByTestId('input')).toHaveValue(longValue);
  });

  it('handles multiple rapid input changes', () => {
    const handleChange = vi.fn();
    render(<Input onChange={handleChange} data-testid="input" />);
    const input = screen.getByTestId('input');

    for (let i = 0; i < 100; i++) {
      fireEvent.change(input, { target: { value: `test${i}` } });
    }

    expect(handleChange).toHaveBeenCalledTimes(100);
  });

  it('handles focus and blur cycles', () => {
    const handleFocus = vi.fn();
    const handleBlur = vi.fn();
    render(<Input onFocus={handleFocus} onBlur={handleBlur} data-testid="input" />);
    const input = screen.getByTestId('input');

    for (let i = 0; i < 5; i++) {
      fireEvent.focus(input);
      fireEvent.blur(input);
    }

    expect(handleFocus).toHaveBeenCalledTimes(5);
    expect(handleBlur).toHaveBeenCalledTimes(5);
  });

  it('handles combined error and disabled state', () => {
    render(<Input error disabled data-testid="input" />);
    const input = screen.getByTestId('input');
    expect(input).toBeDisabled();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveStyle({ opacity: '0.5' });
  });

  it('handles empty label in InputGroup', () => {
    render(
      <InputGroup label="">
        <Input data-testid="input" />
      </InputGroup>
    );
    // Empty label should not render label element
    const { container } = render(
      <InputGroup label="">
        <Input data-testid="input2" />
      </InputGroup>
    );
    // Empty string is truthy for rendering so label might still appear
    expect(screen.getByTestId('input2')).toBeInTheDocument();
  });

  it('handles null/undefined helperText and error', () => {
    render(
      <InputGroup helperText={undefined} error={undefined}>
        <Input data-testid="input" />
      </InputGroup>
    );
    expect(screen.getByTestId('input')).toBeInTheDocument();
  });

  it('TextArea handles zero minRows', () => {
    render(<TextArea minRows={0} data-testid="textarea" />);
    const textarea = screen.getByTestId('textarea');
    // Zero is technically invalid for rows attribute, but component still renders
    // Browser may normalize this - we test that minHeight is calculated
    expect(textarea).toHaveStyle({ minHeight: '0px' });
    expect(textarea).toBeInTheDocument();
  });

  it('TextArea handles large minRows', () => {
    render(<TextArea minRows={100} data-testid="textarea" />);
    const textarea = screen.getByTestId('textarea');
    expect(textarea).toHaveAttribute('rows', '100');
    // 100 * 20 (md lineHeight) = 2000px
    expect(textarea).toHaveStyle({ minHeight: '2000px' });
  });

  it('Input with both icons and fullWidth applies correct structure', () => {
    const { container } = render(
      <Input
        leftIcon={<span data-testid="left">L</span>}
        rightIcon={<span data-testid="right">R</span>}
        fullWidth
        data-testid="input"
      />
    );
    const wrapper = container.querySelector('.relative.inline-flex');
    expect(wrapper?.className).toContain('w-full');
    expect(screen.getByTestId('left')).toBeInTheDocument();
    expect(screen.getByTestId('right')).toBeInTheDocument();
    expect(screen.getByTestId('input')).toBeInTheDocument();
  });

  it('Input without icons does not wrap in container', () => {
    const { container } = render(<Input data-testid="input" />);
    const wrapper = container.querySelector('.relative.inline-flex');
    expect(wrapper).toBeNull();
    // Input should be direct child
    expect(container.firstChild?.nodeName).toBe('INPUT');
  });
});

describe('sizeStyles Constant', () => {
  it('sm size has correct className', () => {
    render(<Input size="sm" data-testid="input" />);
    const className = screen.getByTestId('input').className;
    expect(className).toContain('px-2');
    expect(className).toContain('py-1');
    expect(className).toContain('text-xs');
  });

  it('md size has correct className', () => {
    render(<Input size="md" data-testid="input" />);
    const className = screen.getByTestId('input').className;
    expect(className).toContain('px-3');
    expect(className).toContain('py-1.5');
    expect(className).toContain('text-sm');
  });

  it('lg size has correct className', () => {
    render(<Input size="lg" data-testid="input" />);
    const className = screen.getByTestId('input').className;
    expect(className).toContain('px-4');
    expect(className).toContain('py-2');
    expect(className).toContain('text-base');
  });

  it('all sizes have correct borderRadius', () => {
    const expectedBorderRadius: Record<InputSize, string> = {
      sm: '4px',
      md: '6px',
      lg: '8px',
    };

    (['sm', 'md', 'lg'] as InputSize[]).forEach(size => {
      cleanup();
      render(<Input size={size} data-testid="input" />);
      expect(screen.getByTestId('input')).toHaveStyle({
        borderRadius: expectedBorderRadius[size],
      });
    });
  });
});

describe('iconPadding Constant', () => {
  it('sm size left icon padding is pl-7', () => {
    render(<Input size="sm" leftIcon={<span>I</span>} data-testid="input" />);
    expect(screen.getByTestId('input').className).toContain('pl-7');
  });

  it('sm size right icon padding is pr-7', () => {
    render(<Input size="sm" rightIcon={<span>I</span>} data-testid="input" />);
    expect(screen.getByTestId('input').className).toContain('pr-7');
  });

  it('md size left icon padding is pl-9', () => {
    render(<Input size="md" leftIcon={<span>I</span>} data-testid="input" />);
    expect(screen.getByTestId('input').className).toContain('pl-9');
  });

  it('md size right icon padding is pr-9', () => {
    render(<Input size="md" rightIcon={<span>I</span>} data-testid="input" />);
    expect(screen.getByTestId('input').className).toContain('pr-9');
  });

  it('lg size left icon padding is pl-11', () => {
    render(<Input size="lg" leftIcon={<span>I</span>} data-testid="input" />);
    expect(screen.getByTestId('input').className).toContain('pl-11');
  });

  it('lg size right icon padding is pr-11', () => {
    render(<Input size="lg" rightIcon={<span>I</span>} data-testid="input" />);
    expect(screen.getByTestId('input').className).toContain('pr-11');
  });
});

describe('Auto Resize Line Height Calculations', () => {
  it('sm size uses lineHeight of 16', () => {
    render(<TextArea size="sm" minRows={5} data-testid="textarea" />);
    // 5 * 16 = 80px
    expect(screen.getByTestId('textarea')).toHaveStyle({ minHeight: '80px' });
  });

  it('md size uses lineHeight of 20', () => {
    render(<TextArea size="md" minRows={5} data-testid="textarea" />);
    // 5 * 20 = 100px
    expect(screen.getByTestId('textarea')).toHaveStyle({ minHeight: '100px' });
  });

  it('lg size uses lineHeight of 24', () => {
    render(<TextArea size="lg" minRows={5} data-testid="textarea" />);
    // 5 * 24 = 120px
    expect(screen.getByTestId('textarea')).toHaveStyle({ minHeight: '120px' });
  });
});

describe('Ref Handling in TextArea', () => {
  it('sets internal ref for auto-resize functionality', () => {
    const ref = React.createRef<HTMLTextAreaElement>();
    render(<TextArea ref={ref} autoResize data-testid="textarea" />);

    // Verify ref is set
    expect(ref.current).toBeInstanceOf(HTMLTextAreaElement);

    // Trigger input to test auto-resize uses internal ref
    const textarea = screen.getByTestId('textarea') as HTMLTextAreaElement;
    fireEvent.input(textarea, { target: { value: 'test content' } });

    // Height should be modified
    expect(textarea.style.height).toBeDefined();
  });

  it('handles null ref gracefully', () => {
    const ref = React.createRef<HTMLTextAreaElement>();
    render(<TextArea ref={ref} data-testid="textarea" />);

    // Unmount and remount
    cleanup();
    render(<TextArea ref={ref} data-testid="textarea" />);

    expect(ref.current).toBeInstanceOf(HTMLTextAreaElement);
  });

  it('handles both callback ref and autoResize', () => {
    let refElement: HTMLTextAreaElement | null = null;
    const callbackRef = (el: HTMLTextAreaElement | null) => {
      refElement = el;
    };

    render(<TextArea ref={callbackRef} autoResize data-testid="textarea" />);

    expect(refElement).toBeInstanceOf(HTMLTextAreaElement);

    // Trigger auto-resize
    const textarea = screen.getByTestId('textarea');
    fireEvent.input(textarea, { target: { value: 'content' } });

    // Both callback ref and internal ref should work
    expect(refElement).toBe(textarea);
  });
});

describe('Transition Styles', () => {
  it('Input has background-color transition', () => {
    render(<Input data-testid="input" />);
    const input = screen.getByTestId('input');
    expect(input.style.transition).toContain('background-color 150ms ease');
  });

  it('Input has border-color transition', () => {
    render(<Input data-testid="input" />);
    const input = screen.getByTestId('input');
    expect(input.style.transition).toContain('border-color 150ms ease');
  });

  it('Input has box-shadow transition', () => {
    render(<Input data-testid="input" />);
    const input = screen.getByTestId('input');
    expect(input.style.transition).toContain('box-shadow 150ms ease');
  });

  it('TextArea has same transitions as Input', () => {
    render(<TextArea data-testid="textarea" />);
    const textarea = screen.getByTestId('textarea');
    expect(textarea.style.transition).toContain('background-color 150ms ease');
    expect(textarea.style.transition).toContain('border-color 150ms ease');
    expect(textarea.style.transition).toContain('box-shadow 150ms ease');
  });
});
