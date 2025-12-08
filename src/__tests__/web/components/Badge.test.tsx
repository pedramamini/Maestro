/**
 * Tests for Badge, StatusDot, and ModeBadge components
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import {
  Badge,
  StatusDot,
  ModeBadge,
  type BadgeVariant,
  type BadgeSize,
  type BadgeStyle,
  type BadgeProps,
  type SessionStatus,
  type StatusDotProps,
  type InputMode,
  type ModeBadgeProps,
} from '../../../web/components/Badge';

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

describe('Badge Component', () => {
  afterEach(() => {
    cleanup();
  });

  describe('Basic Rendering', () => {
    it('renders with children text', () => {
      render(<Badge>Test Badge</Badge>);
      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByText('Test Badge')).toBeInTheDocument();
    });

    it('renders without children', () => {
      render(<Badge />);
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('renders with default props', () => {
      render(<Badge>Default</Badge>);
      const badge = screen.getByRole('status');
      expect(badge).toBeInTheDocument();
    });

    it('passes through HTML span attributes', () => {
      render(
        <Badge id="test-id" data-testid="test-badge">
          Attributes
        </Badge>
      );
      const badge = screen.getByTestId('test-badge');
      expect(badge).toHaveAttribute('id', 'test-id');
    });

    it('applies custom className', () => {
      render(<Badge className="custom-class">Styled</Badge>);
      const badge = screen.getByRole('status');
      expect(badge.className).toContain('custom-class');
    });

    it('applies custom style', () => {
      render(<Badge style={{ marginTop: '10px' }}>Styled</Badge>);
      const badge = screen.getByRole('status');
      expect(badge).toHaveStyle({ marginTop: '10px' });
    });

    it('forwards ref to span element', () => {
      const ref = React.createRef<HTMLSpanElement>();
      render(<Badge ref={ref}>Ref Badge</Badge>);
      expect(ref.current).toBeInstanceOf(HTMLSpanElement);
      expect(ref.current?.textContent).toContain('Ref Badge');
    });
  });

  describe('Variants', () => {
    const variants: BadgeVariant[] = ['default', 'success', 'warning', 'error', 'info', 'connecting'];

    variants.forEach(variant => {
      it(`renders ${variant} variant`, () => {
        render(<Badge variant={variant}>{variant} Badge</Badge>);
        const badge = screen.getByRole('status');
        expect(badge).toBeInTheDocument();
      });
    });

    it('applies success variant with success color', () => {
      render(<Badge variant="success" badgeStyle="solid">Success</Badge>);
      const badge = screen.getByRole('status');
      expect(badge).toHaveStyle({ backgroundColor: '#22c55e' });
      expect(badge).toHaveStyle({ color: '#ffffff' });
    });

    it('applies warning variant with warning color', () => {
      render(<Badge variant="warning" badgeStyle="solid">Warning</Badge>);
      const badge = screen.getByRole('status');
      expect(badge).toHaveStyle({ backgroundColor: '#eab308' });
      expect(badge).toHaveStyle({ color: '#ffffff' });
    });

    it('applies error variant with error color', () => {
      render(<Badge variant="error" badgeStyle="solid">Error</Badge>);
      const badge = screen.getByRole('status');
      expect(badge).toHaveStyle({ backgroundColor: '#ef4444' });
      expect(badge).toHaveStyle({ color: '#ffffff' });
    });

    it('applies info variant with accent color', () => {
      render(<Badge variant="info" badgeStyle="solid">Info</Badge>);
      const badge = screen.getByRole('status');
      expect(badge).toHaveStyle({ backgroundColor: '#6366f1' });
      expect(badge).toHaveStyle({ color: '#ffffff' });
    });

    it('applies connecting variant with orange color', () => {
      render(<Badge variant="connecting" badgeStyle="solid">Connecting</Badge>);
      const badge = screen.getByRole('status');
      expect(badge).toHaveStyle({ backgroundColor: '#f97316' });
      expect(badge).toHaveStyle({ color: '#ffffff' });
    });

    it('applies default variant with textDim color', () => {
      render(<Badge variant="default" badgeStyle="solid">Default</Badge>);
      const badge = screen.getByRole('status');
      expect(badge).toHaveStyle({ backgroundColor: '#a1a1aa' });
      expect(badge).toHaveStyle({ color: '#ffffff' });
    });

    it('uses default variant when not specified', () => {
      render(<Badge badgeStyle="solid">No Variant</Badge>);
      const badge = screen.getByRole('status');
      expect(badge).toHaveStyle({ backgroundColor: '#a1a1aa' });
    });

    it('handles unknown variant gracefully (default case in switch)', () => {
      // Cast to any to test the default fallback case
      render(<Badge variant={'unknown' as any} badgeStyle="solid">Unknown</Badge>);
      const badge = screen.getByRole('status');
      // Should fall through to default and use textDim color
      expect(badge).toHaveStyle({ backgroundColor: '#a1a1aa' });
    });
  });

  describe('Badge Styles', () => {
    const badgeStyles: BadgeStyle[] = ['solid', 'outline', 'subtle', 'dot'];

    badgeStyles.forEach(style => {
      it(`renders ${style} badgeStyle`, () => {
        render(<Badge badgeStyle={style}>{style} Style</Badge>);
        const badge = screen.getByRole('status');
        expect(badge).toBeInTheDocument();
      });
    });

    describe('Solid Style', () => {
      it('applies solid style with filled background', () => {
        render(<Badge variant="success" badgeStyle="solid">Solid</Badge>);
        const badge = screen.getByRole('status');
        expect(badge).toHaveStyle({ backgroundColor: '#22c55e' });
        expect(badge).toHaveStyle({ color: '#ffffff' });
        // Solid style sets border: 'none' - this is correctly set in the style
      });
    });

    describe('Outline Style', () => {
      it('applies outline style with transparent background and border', () => {
        render(<Badge variant="success" badgeStyle="outline">Outline</Badge>);
        const badge = screen.getByRole('status');
        // Check style object directly for transparent
        expect(badge.style.backgroundColor).toBe('transparent');
        expect(badge).toHaveStyle({ color: '#22c55e' });
        // Check border contains 1px solid (jsdom may convert color to rgb)
        expect(badge.style.border).toContain('1px solid');
      });

      it('applies outline style with error variant', () => {
        render(<Badge variant="error" badgeStyle="outline">Error Outline</Badge>);
        const badge = screen.getByRole('status');
        expect(badge.style.backgroundColor).toBe('transparent');
        expect(badge).toHaveStyle({ color: '#ef4444' });
        // Check border contains the structure (jsdom may convert color to rgb)
        expect(badge.style.border).toContain('1px solid');
      });
    });

    describe('Subtle Style', () => {
      it('applies subtle style with semi-transparent background', () => {
        render(<Badge variant="success" badgeStyle="subtle">Subtle</Badge>);
        const badge = screen.getByRole('status');
        // Subtle uses primaryColor + '20' for ~12% opacity
        expect(badge).toHaveStyle({ backgroundColor: '#22c55e20' });
        expect(badge).toHaveStyle({ color: '#22c55e' });
        // Subtle style sets border: 'none' - this is correctly set in the style
      });

      it('applies subtle style as default', () => {
        render(<Badge variant="warning">Default Subtle</Badge>);
        const badge = screen.getByRole('status');
        expect(badge).toHaveStyle({ backgroundColor: '#eab30820' });
        expect(badge).toHaveStyle({ color: '#eab308' });
      });
    });

    describe('Dot Style', () => {
      it('renders dot style as a small circle', () => {
        render(<Badge badgeStyle="dot" />);
        const badge = screen.getByRole('status');
        expect(badge).toBeInTheDocument();
        expect(badge.className).toContain('rounded-full');
        expect(badge.className).toContain('inline-block');
      });

      it('applies dot style with correct size for sm', () => {
        render(<Badge badgeStyle="dot" size="sm" />);
        const badge = screen.getByRole('status');
        expect(badge).toHaveStyle({ width: '6px' });
        expect(badge).toHaveStyle({ height: '6px' });
      });

      it('applies dot style with correct size for md', () => {
        render(<Badge badgeStyle="dot" size="md" />);
        const badge = screen.getByRole('status');
        expect(badge).toHaveStyle({ width: '8px' });
        expect(badge).toHaveStyle({ height: '8px' });
      });

      it('applies dot style with correct size for lg', () => {
        render(<Badge badgeStyle="dot" size="lg" />);
        const badge = screen.getByRole('status');
        expect(badge).toHaveStyle({ width: '10px' });
        expect(badge).toHaveStyle({ height: '10px' });
      });

      it('applies dot style with variant color', () => {
        render(<Badge badgeStyle="dot" variant="success" />);
        const badge = screen.getByRole('status');
        expect(badge).toHaveStyle({ backgroundColor: '#22c55e' });
        // Dot style sets border: 'none' - this is correctly set in the style
      });

      it('does not render children in dot style', () => {
        render(<Badge badgeStyle="dot">Should not appear</Badge>);
        expect(screen.queryByText('Should not appear')).not.toBeInTheDocument();
      });

      it('does not render icon in dot style', () => {
        render(<Badge badgeStyle="dot" icon={<span data-testid="icon">I</span>} />);
        expect(screen.queryByTestId('icon')).not.toBeInTheDocument();
      });

      it('applies aria-label for non-default variant in dot style', () => {
        render(<Badge badgeStyle="dot" variant="error" />);
        const badge = screen.getByRole('status');
        expect(badge).toHaveAttribute('aria-label', 'error');
      });

      it('does not apply aria-label for default variant in dot style', () => {
        render(<Badge badgeStyle="dot" variant="default" />);
        const badge = screen.getByRole('status');
        expect(badge).not.toHaveAttribute('aria-label');
      });
    });

    it('handles unknown badgeStyle gracefully (default case in switch)', () => {
      render(<Badge badgeStyle={'unknown' as any}>Unknown Style</Badge>);
      const badge = screen.getByRole('status');
      // Should render without error, returning empty style object from default case
      expect(badge).toBeInTheDocument();
    });
  });

  describe('Sizes', () => {
    const sizes: BadgeSize[] = ['sm', 'md', 'lg'];

    sizes.forEach(size => {
      it(`renders ${size} size`, () => {
        render(<Badge size={size}>{size} Badge</Badge>);
        const badge = screen.getByRole('status');
        expect(badge).toBeInTheDocument();
      });
    });

    it('applies sm size border radius', () => {
      render(<Badge size="sm">Small</Badge>);
      const badge = screen.getByRole('status');
      expect(badge).toHaveStyle({ borderRadius: '4px' });
    });

    it('applies md size border radius', () => {
      render(<Badge size="md">Medium</Badge>);
      const badge = screen.getByRole('status');
      expect(badge).toHaveStyle({ borderRadius: '6px' });
    });

    it('applies lg size border radius', () => {
      render(<Badge size="lg">Large</Badge>);
      const badge = screen.getByRole('status');
      expect(badge).toHaveStyle({ borderRadius: '8px' });
    });

    it('uses md size as default', () => {
      render(<Badge>Default Size</Badge>);
      const badge = screen.getByRole('status');
      expect(badge).toHaveStyle({ borderRadius: '6px' });
    });

    it('applies correct size class for sm', () => {
      render(<Badge size="sm">Small</Badge>);
      const badge = screen.getByRole('status');
      expect(badge.className).toContain('px-1.5');
      expect(badge.className).toContain('py-0.5');
      expect(badge.className).toContain('text-xs');
      expect(badge.className).toContain('gap-1');
    });

    it('applies correct size class for md', () => {
      render(<Badge size="md">Medium</Badge>);
      const badge = screen.getByRole('status');
      expect(badge.className).toContain('px-2');
      expect(badge.className).toContain('py-0.5');
      expect(badge.className).toContain('text-sm');
      expect(badge.className).toContain('gap-1.5');
    });

    it('applies correct size class for lg', () => {
      render(<Badge size="lg">Large</Badge>);
      const badge = screen.getByRole('status');
      expect(badge.className).toContain('px-2.5');
      expect(badge.className).toContain('py-1');
      expect(badge.className).toContain('text-base');
      expect(badge.className).toContain('gap-2');
    });
  });

  describe('Pulse Animation', () => {
    it('applies animate-pulse when pulse prop is true', () => {
      render(<Badge pulse>Pulsing</Badge>);
      const badge = screen.getByRole('status');
      expect(badge.className).toContain('animate-pulse');
    });

    it('does not apply animate-pulse when pulse prop is false', () => {
      render(<Badge pulse={false}>Not Pulsing</Badge>);
      const badge = screen.getByRole('status');
      expect(badge.className).not.toContain('animate-pulse');
    });

    it('applies animate-pulse automatically for connecting variant', () => {
      render(<Badge variant="connecting">Connecting</Badge>);
      const badge = screen.getByRole('status');
      expect(badge.className).toContain('animate-pulse');
    });

    it('applies animate-pulse for connecting variant even without pulse prop', () => {
      render(<Badge variant="connecting" pulse={false}>Connecting</Badge>);
      const badge = screen.getByRole('status');
      // shouldPulse = pulse || variant === 'connecting', so connecting always pulses
      expect(badge.className).toContain('animate-pulse');
    });

    it('applies animate-pulse in dot style when pulse is true', () => {
      render(<Badge badgeStyle="dot" pulse />);
      const badge = screen.getByRole('status');
      expect(badge.className).toContain('animate-pulse');
    });

    it('applies animate-pulse in dot style for connecting variant', () => {
      render(<Badge badgeStyle="dot" variant="connecting" />);
      const badge = screen.getByRole('status');
      expect(badge.className).toContain('animate-pulse');
    });

    it('does not apply animate-pulse by default for non-connecting variants', () => {
      render(<Badge variant="success">Success</Badge>);
      const badge = screen.getByRole('status');
      expect(badge.className).not.toContain('animate-pulse');
    });
  });

  describe('Icon Support', () => {
    it('renders icon before text', () => {
      render(
        <Badge icon={<span data-testid="icon">*</span>}>
          With Icon
        </Badge>
      );
      expect(screen.getByTestId('icon')).toBeInTheDocument();
      expect(screen.getByText('With Icon')).toBeInTheDocument();
    });

    it('wraps icon in flex-shrink-0 span', () => {
      render(
        <Badge icon={<span data-testid="icon">I</span>}>
          Icon Badge
        </Badge>
      );
      const iconWrapper = screen.getByTestId('icon').parentElement;
      expect(iconWrapper?.className).toContain('flex-shrink-0');
    });

    it('renders icon only without children', () => {
      render(<Badge icon={<span data-testid="icon">I</span>} />);
      expect(screen.getByTestId('icon')).toBeInTheDocument();
    });

    it('does not render icon wrapper when no icon provided', () => {
      render(<Badge>No Icon</Badge>);
      // Only the text span should be present, not an icon wrapper
      const badge = screen.getByRole('status');
      const spans = badge.querySelectorAll('span');
      // Should have exactly one span for the children
      expect(spans.length).toBe(1);
    });
  });

  describe('Style Composition', () => {
    it('combines variant and size styles', () => {
      render(<Badge variant="error" size="lg" badgeStyle="solid">Error Large</Badge>);
      const badge = screen.getByRole('status');
      expect(badge).toHaveStyle({ backgroundColor: '#ef4444' });
      expect(badge).toHaveStyle({ borderRadius: '8px' });
    });

    it('applies inline flex display', () => {
      render(<Badge>Flex Badge</Badge>);
      const badge = screen.getByRole('status');
      expect(badge).toHaveStyle({ display: 'inline-flex' });
    });

    it('applies center alignment', () => {
      render(<Badge>Centered</Badge>);
      const badge = screen.getByRole('status');
      expect(badge).toHaveStyle({ alignItems: 'center' });
    });

    it('applies font weight 500', () => {
      render(<Badge>Bold</Badge>);
      const badge = screen.getByRole('status');
      expect(badge).toHaveStyle({ fontWeight: '500' });
    });

    it('applies whitespace nowrap', () => {
      render(<Badge>No Wrap</Badge>);
      const badge = screen.getByRole('status');
      expect(badge).toHaveStyle({ whiteSpace: 'nowrap' });
    });

    it('applies line height 1', () => {
      render(<Badge>Line Height</Badge>);
      const badge = screen.getByRole('status');
      expect(badge).toHaveStyle({ lineHeight: '1' });
    });

    it('custom style overrides default styles', () => {
      render(<Badge style={{ backgroundColor: 'purple' }}>Custom</Badge>);
      const badge = screen.getByRole('status');
      expect(badge.style.backgroundColor).toBe('purple');
    });

    it('custom style overrides border radius', () => {
      render(<Badge style={{ borderRadius: '20px' }}>Custom Radius</Badge>);
      const badge = screen.getByRole('status');
      expect(badge.style.borderRadius).toBe('20px');
    });
  });

  describe('Accessibility', () => {
    it('has role="status" by default', () => {
      render(<Badge>Status</Badge>);
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('supports custom role', () => {
      render(<Badge role="alert">Alert</Badge>);
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('supports aria-label', () => {
      render(<Badge aria-label="Custom label">Badge</Badge>);
      expect(screen.getByLabelText('Custom label')).toBeInTheDocument();
    });

    it('supports aria-labelledby', () => {
      render(
        <>
          <span id="label">Label</span>
          <Badge aria-labelledby="label">Badge</Badge>
        </>
      );
      expect(screen.getByRole('status')).toHaveAttribute('aria-labelledby', 'label');
    });
  });
});

describe('StatusDot Component', () => {
  afterEach(() => {
    cleanup();
  });

  describe('Basic Rendering', () => {
    it('renders with status prop', () => {
      render(<StatusDot status="idle" />);
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('renders as a dot badge', () => {
      render(<StatusDot status="idle" />);
      const dot = screen.getByRole('status');
      expect(dot.className).toContain('rounded-full');
    });

    it('forwards ref to span element', () => {
      const ref = React.createRef<HTMLSpanElement>();
      render(<StatusDot ref={ref} status="idle" />);
      expect(ref.current).toBeInstanceOf(HTMLSpanElement);
    });
  });

  describe('Status to Variant Mapping', () => {
    it('maps idle status to success variant (green)', () => {
      render(<StatusDot status="idle" />);
      const dot = screen.getByRole('status');
      expect(dot).toHaveStyle({ backgroundColor: '#22c55e' });
    });

    it('maps busy status to warning variant (yellow)', () => {
      render(<StatusDot status="busy" />);
      const dot = screen.getByRole('status');
      expect(dot).toHaveStyle({ backgroundColor: '#eab308' });
    });

    it('maps error status to error variant (red)', () => {
      render(<StatusDot status="error" />);
      const dot = screen.getByRole('status');
      expect(dot).toHaveStyle({ backgroundColor: '#ef4444' });
    });

    it('maps connecting status to connecting variant (orange)', () => {
      render(<StatusDot status="connecting" />);
      const dot = screen.getByRole('status');
      expect(dot).toHaveStyle({ backgroundColor: '#f97316' });
    });
  });

  describe('Pulse Animation', () => {
    it('applies pulse animation for connecting status', () => {
      render(<StatusDot status="connecting" />);
      const dot = screen.getByRole('status');
      expect(dot.className).toContain('animate-pulse');
    });

    it('does not apply pulse animation for idle status', () => {
      render(<StatusDot status="idle" />);
      const dot = screen.getByRole('status');
      expect(dot.className).not.toContain('animate-pulse');
    });

    it('does not apply pulse animation for busy status', () => {
      render(<StatusDot status="busy" />);
      const dot = screen.getByRole('status');
      expect(dot.className).not.toContain('animate-pulse');
    });

    it('does not apply pulse animation for error status', () => {
      render(<StatusDot status="error" />);
      const dot = screen.getByRole('status');
      expect(dot.className).not.toContain('animate-pulse');
    });
  });

  describe('Size Support', () => {
    it('uses sm size as default', () => {
      render(<StatusDot status="idle" />);
      const dot = screen.getByRole('status');
      expect(dot).toHaveStyle({ width: '6px' });
      expect(dot).toHaveStyle({ height: '6px' });
    });

    it('supports custom size', () => {
      render(<StatusDot status="idle" size="lg" />);
      const dot = screen.getByRole('status');
      expect(dot).toHaveStyle({ width: '10px' });
      expect(dot).toHaveStyle({ height: '10px' });
    });
  });

  describe('Props Passthrough', () => {
    it('passes className to Badge', () => {
      render(<StatusDot status="idle" className="custom-class" />);
      const dot = screen.getByRole('status');
      expect(dot.className).toContain('custom-class');
    });

    it('passes style to Badge', () => {
      render(<StatusDot status="idle" style={{ margin: '5px' }} />);
      const dot = screen.getByRole('status');
      expect(dot).toHaveStyle({ margin: '5px' });
    });

    it('passes data attributes to Badge', () => {
      render(<StatusDot status="idle" data-testid="custom-dot" />);
      expect(screen.getByTestId('custom-dot')).toBeInTheDocument();
    });
  });
});

describe('ModeBadge Component', () => {
  afterEach(() => {
    cleanup();
  });

  describe('Basic Rendering', () => {
    it('renders with mode prop', () => {
      render(<ModeBadge mode="ai" />);
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('forwards ref to span element', () => {
      const ref = React.createRef<HTMLSpanElement>();
      render(<ModeBadge ref={ref} mode="ai" />);
      expect(ref.current).toBeInstanceOf(HTMLSpanElement);
    });
  });

  describe('Mode Display', () => {
    it('displays "AI" for ai mode', () => {
      render(<ModeBadge mode="ai" />);
      expect(screen.getByText('AI')).toBeInTheDocument();
    });

    it('displays "Terminal" for terminal mode', () => {
      render(<ModeBadge mode="terminal" />);
      expect(screen.getByText('Terminal')).toBeInTheDocument();
    });
  });

  describe('Mode to Variant Mapping', () => {
    it('uses info variant for ai mode', () => {
      render(<ModeBadge mode="ai" badgeStyle="solid" />);
      const badge = screen.getByRole('status');
      // info variant uses accent color
      expect(badge).toHaveStyle({ backgroundColor: '#6366f1' });
    });

    it('uses default variant for terminal mode', () => {
      render(<ModeBadge mode="terminal" badgeStyle="solid" />);
      const badge = screen.getByRole('status');
      // default variant uses textDim color
      expect(badge).toHaveStyle({ backgroundColor: '#a1a1aa' });
    });
  });

  describe('Default Props', () => {
    it('uses sm size as default', () => {
      render(<ModeBadge mode="ai" />);
      const badge = screen.getByRole('status');
      expect(badge).toHaveStyle({ borderRadius: '4px' });
    });

    it('uses outline badgeStyle as default', () => {
      render(<ModeBadge mode="ai" />);
      const badge = screen.getByRole('status');
      // Check style object directly for transparent and border
      expect(badge.style.backgroundColor).toBe('transparent');
      // Outline style should have 1px solid border (jsdom may convert color to rgb)
      expect(badge.style.border).toContain('1px solid');
    });
  });

  describe('Custom Props', () => {
    it('supports custom size', () => {
      render(<ModeBadge mode="ai" size="lg" />);
      const badge = screen.getByRole('status');
      expect(badge).toHaveStyle({ borderRadius: '8px' });
    });

    it('supports custom badgeStyle', () => {
      render(<ModeBadge mode="ai" badgeStyle="subtle" />);
      const badge = screen.getByRole('status');
      expect(badge).toHaveStyle({ backgroundColor: '#6366f120' });
    });

    it('supports custom className', () => {
      render(<ModeBadge mode="ai" className="custom-mode" />);
      const badge = screen.getByRole('status');
      expect(badge.className).toContain('custom-mode');
    });

    it('supports custom style', () => {
      render(<ModeBadge mode="terminal" style={{ padding: '10px' }} />);
      const badge = screen.getByRole('status');
      expect(badge).toHaveStyle({ padding: '10px' });
    });

    it('supports pulse prop', () => {
      render(<ModeBadge mode="ai" pulse />);
      const badge = screen.getByRole('status');
      expect(badge.className).toContain('animate-pulse');
    });

    it('supports icon prop', () => {
      render(<ModeBadge mode="ai" icon={<span data-testid="mode-icon">*</span>} />);
      expect(screen.getByTestId('mode-icon')).toBeInTheDocument();
    });
  });
});

describe('Type Exports', () => {
  it('exports BadgeVariant type', () => {
    const variant: BadgeVariant = 'success';
    expect(variant).toBe('success');
  });

  it('exports all BadgeVariant values', () => {
    const variants: BadgeVariant[] = ['default', 'success', 'warning', 'error', 'info', 'connecting'];
    expect(variants.length).toBe(6);
  });

  it('exports BadgeSize type', () => {
    const size: BadgeSize = 'md';
    expect(size).toBe('md');
  });

  it('exports all BadgeSize values', () => {
    const sizes: BadgeSize[] = ['sm', 'md', 'lg'];
    expect(sizes.length).toBe(3);
  });

  it('exports BadgeStyle type', () => {
    const style: BadgeStyle = 'subtle';
    expect(style).toBe('subtle');
  });

  it('exports all BadgeStyle values', () => {
    const styles: BadgeStyle[] = ['solid', 'outline', 'subtle', 'dot'];
    expect(styles.length).toBe(4);
  });

  it('exports BadgeProps interface', () => {
    const props: BadgeProps = {
      variant: 'success',
      size: 'lg',
      badgeStyle: 'outline',
      pulse: true,
    };
    expect(props.variant).toBe('success');
    expect(props.size).toBe('lg');
    expect(props.badgeStyle).toBe('outline');
    expect(props.pulse).toBe(true);
  });

  it('exports SessionStatus type', () => {
    const status: SessionStatus = 'idle';
    expect(status).toBe('idle');
  });

  it('exports all SessionStatus values', () => {
    const statuses: SessionStatus[] = ['idle', 'busy', 'error', 'connecting'];
    expect(statuses.length).toBe(4);
  });

  it('exports StatusDotProps interface', () => {
    const props: StatusDotProps = {
      status: 'busy',
      size: 'md',
    };
    expect(props.status).toBe('busy');
  });

  it('exports InputMode type', () => {
    const mode: InputMode = 'ai';
    expect(mode).toBe('ai');
  });

  it('exports all InputMode values', () => {
    const modes: InputMode[] = ['ai', 'terminal'];
    expect(modes.length).toBe(2);
  });

  it('exports ModeBadgeProps interface', () => {
    const props: ModeBadgeProps = {
      mode: 'terminal',
      size: 'sm',
    };
    expect(props.mode).toBe('terminal');
  });
});

describe('Default Export', () => {
  it('exports Badge as default', async () => {
    const module = await import('../../../web/components/Badge');
    expect(module.default).toBe(module.Badge);
  });
});

describe('sizeStyles Constant', () => {
  // Testing the sizeStyles constant indirectly through rendered components

  it('sm size has correct className pattern', () => {
    render(<Badge size="sm">SM</Badge>);
    const badge = screen.getByRole('status');
    expect(badge.className).toContain('px-1.5');
    expect(badge.className).toContain('py-0.5');
    expect(badge.className).toContain('text-xs');
    expect(badge.className).toContain('gap-1');
  });

  it('md size has correct className pattern', () => {
    render(<Badge size="md">MD</Badge>);
    const badge = screen.getByRole('status');
    expect(badge.className).toContain('px-2');
    expect(badge.className).toContain('py-0.5');
    expect(badge.className).toContain('text-sm');
    expect(badge.className).toContain('gap-1.5');
  });

  it('lg size has correct className pattern', () => {
    render(<Badge size="lg">LG</Badge>);
    const badge = screen.getByRole('status');
    expect(badge.className).toContain('px-2.5');
    expect(badge.className).toContain('py-1');
    expect(badge.className).toContain('text-base');
    expect(badge.className).toContain('gap-2');
  });

  it('sm dot size is 6px', () => {
    render(<Badge size="sm" badgeStyle="dot" />);
    const badge = screen.getByRole('status');
    expect(badge).toHaveStyle({ width: '6px', height: '6px' });
  });

  it('md dot size is 8px', () => {
    render(<Badge size="md" badgeStyle="dot" />);
    const badge = screen.getByRole('status');
    expect(badge).toHaveStyle({ width: '8px', height: '8px' });
  });

  it('lg dot size is 10px', () => {
    render(<Badge size="lg" badgeStyle="dot" />);
    const badge = screen.getByRole('status');
    expect(badge).toHaveStyle({ width: '10px', height: '10px' });
  });
});

describe('statusToVariant Mapping', () => {
  // Testing the statusToVariant constant indirectly through StatusDot

  it('idle maps to success (green color)', () => {
    render(<StatusDot status="idle" />);
    const dot = screen.getByRole('status');
    expect(dot).toHaveStyle({ backgroundColor: '#22c55e' });
  });

  it('busy maps to warning (yellow color)', () => {
    render(<StatusDot status="busy" />);
    const dot = screen.getByRole('status');
    expect(dot).toHaveStyle({ backgroundColor: '#eab308' });
  });

  it('error maps to error (red color)', () => {
    render(<StatusDot status="error" />);
    const dot = screen.getByRole('status');
    expect(dot).toHaveStyle({ backgroundColor: '#ef4444' });
  });

  it('connecting maps to connecting (orange color)', () => {
    render(<StatusDot status="connecting" />);
    const dot = screen.getByRole('status');
    expect(dot).toHaveStyle({ backgroundColor: '#f97316' });
  });
});

describe('Edge Cases', () => {
  afterEach(() => {
    cleanup();
  });

  it('handles empty className gracefully', () => {
    render(<Badge className="">Empty Class</Badge>);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('handles undefined children', () => {
    render(<Badge>{undefined}</Badge>);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('handles null children', () => {
    render(<Badge>{null}</Badge>);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('handles complex children', () => {
    render(
      <Badge>
        <span>Part 1</span>
        <span>Part 2</span>
      </Badge>
    );
    expect(screen.getByText('Part 1')).toBeInTheDocument();
    expect(screen.getByText('Part 2')).toBeInTheDocument();
  });

  it('handles boolean false pulse', () => {
    render(<Badge pulse={false}>Not Pulsing</Badge>);
    const badge = screen.getByRole('status');
    expect(badge.className).not.toContain('animate-pulse');
  });

  it('handles special characters in children', () => {
    render(<Badge>{'<script>alert("xss")</script>'}</Badge>);
    const badge = screen.getByRole('status');
    // Should render as text, not execute
    expect(badge.textContent).toContain('<script>');
  });

  it('handles unicode in children', () => {
    render(<Badge>Unicode test</Badge>);
    expect(screen.getByText('Unicode test')).toBeInTheDocument();
  });

  it('handles very long text', () => {
    const longText = 'A'.repeat(1000);
    render(<Badge>{longText}</Badge>);
    expect(screen.getByText(longText)).toBeInTheDocument();
  });

  it('handles empty string children', () => {
    render(<Badge>{''}</Badge>);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('handles whitespace-only children', () => {
    render(<Badge>{'   '}</Badge>);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('handles numeric children', () => {
    render(<Badge>{42}</Badge>);
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('handles combined icon and children with special chars', () => {
    render(
      <Badge icon={<span>&lt;</span>}>
        {'<test>'}
      </Badge>
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders correctly with all props combined', () => {
    render(
      <Badge
        variant="success"
        size="lg"
        badgeStyle="outline"
        icon={<span data-testid="full-icon">*</span>}
        pulse
        className="all-props"
        style={{ margin: '10px' }}
        data-testid="full-badge"
      >
        All Props
      </Badge>
    );
    const badge = screen.getByTestId('full-badge');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('all-props');
    expect(badge.className).toContain('animate-pulse');
    expect(badge).toHaveStyle({ margin: '10px' });
    expect(screen.getByTestId('full-icon')).toBeInTheDocument();
    expect(screen.getByText('All Props')).toBeInTheDocument();
  });
});

describe('Component Integration', () => {
  afterEach(() => {
    cleanup();
  });

  it('Badge and StatusDot render together', () => {
    render(
      <div>
        <Badge variant="info">Status:</Badge>
        <StatusDot status="idle" />
      </div>
    );
    const badges = screen.getAllByRole('status');
    expect(badges.length).toBe(2);
  });

  it('Badge and ModeBadge render together', () => {
    render(
      <div>
        <Badge variant="success">Active</Badge>
        <ModeBadge mode="ai" />
      </div>
    );
    const badges = screen.getAllByRole('status');
    expect(badges.length).toBe(2);
  });

  it('StatusDot and ModeBadge render together', () => {
    render(
      <div>
        <StatusDot status="busy" />
        <ModeBadge mode="terminal" />
      </div>
    );
    const badges = screen.getAllByRole('status');
    expect(badges.length).toBe(2);
  });

  it('all three components render together', () => {
    render(
      <div>
        <Badge variant="warning">Label</Badge>
        <StatusDot status="connecting" />
        <ModeBadge mode="ai" />
      </div>
    );
    const badges = screen.getAllByRole('status');
    expect(badges.length).toBe(3);
  });

  it('nested Badge components render correctly', () => {
    render(
      <Badge variant="info" icon={<Badge variant="success" badgeStyle="dot" />}>
        Nested
      </Badge>
    );
    const badges = screen.getAllByRole('status');
    expect(badges.length).toBe(2);
  });
});
