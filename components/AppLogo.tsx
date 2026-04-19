import SuitcaseIcon from './SuitcaseIcon';

type Size = 'sm' | 'md' | 'lg';
type ColorScheme = 'brand' | 'dark' | 'white';

interface AppLogoProps {
  size?: Size;
  colorScheme?: ColorScheme;
}

const sizeConfig: Record<Size, { textClass: string; iconSize: number }> = {
  sm: { textClass: 'text-xl font-bold',  iconSize: 22 },
  md: { textClass: 'text-2xl font-bold', iconSize: 26 },
  lg: { textClass: 'text-3xl font-bold', iconSize: 32 },
};

const colorClass: Record<ColorScheme, string> = {
  brand: 'text-sky-500',
  dark: 'text-gray-900',
  white: 'text-white',
};

export default function AppLogo({ size = 'md', colorScheme = 'brand' }: AppLogoProps) {
  const { textClass, iconSize } = sizeConfig[size];
  const color = colorClass[colorScheme];
  return (
    <span className={`inline-flex items-center gap-2 ${textClass} ${color}`}>
      <span className="font-logo">ZipIt</span>
      <SuitcaseIcon size={iconSize} />
    </span>
  );
}
