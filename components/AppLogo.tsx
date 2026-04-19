import SuitcaseIcon from './SuitcaseIcon';

type Size = 'sm' | 'md' | 'lg';
type ColorScheme = 'brand' | 'dark' | 'white';

interface AppLogoProps {
  size?: Size;
  colorScheme?: ColorScheme;
}

const sizeConfig: Record<Size, { textClass: string }> = {
  sm: { textClass: 'text-xl font-bold' },
  md: { textClass: 'text-2xl font-bold' },
  lg: { textClass: 'text-3xl font-bold' },
};

const colorClass: Record<ColorScheme, string> = {
  brand: 'text-sky-500',
  dark: 'text-gray-900',
  white: 'text-white',
};

export default function AppLogo({ size = 'md', colorScheme = 'brand' }: AppLogoProps) {
  const { textClass } = sizeConfig[size];
  const color = colorClass[colorScheme];
  return (
    // items-stretch makes both children the same cross-axis height as the text
    <span className={`inline-flex items-stretch gap-2 ${textClass} ${color}`}>
      <span className="font-logo">ZipIt</span>
      {/* wrapper span stretches to text height; SVG fills it 100% */}
      <span className="flex items-center">
        <SuitcaseIcon className="h-full aspect-square" />
      </span>
    </span>
  );
}
