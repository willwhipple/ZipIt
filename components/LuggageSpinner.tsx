import SuitcaseIcon from './SuitcaseIcon';

export default function LuggageSpinner() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="luggage-bob">
        <SuitcaseIcon size={44} className="luggage-spin-icon" />
      </div>
    </div>
  );
}
