import React from 'react';
import { FiCalendar } from 'react-icons/fi';
import { calculateAge, getDobError, maxDobForAdult, minDob } from '../../utils/age';

/**
 * Date-of-birth picker with live 18+ feedback. Value is 'YYYY-MM-DD'.
 * Uses the native date input so phones/webviews get their own picker.
 */
const DobInput = ({ value, onChange, required = true, label = 'Date of Birth', className = '', inputClassName = '' }) => {
  const error = value ? getDobError(value, { required }) : '';
  const age = calculateAge(value);

  return (
    <div className={className}>
      {label && <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}
      <div className="relative rounded-xl shadow-sm group">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <FiCalendar className="text-gray-400" />
        </div>
        <input
          type="date"
          required={required}
          value={value || ''}
          min={minDob()}
          max={maxDobForAdult()}
          onChange={(e) => onChange(e.target.value)}
          className={`block w-full pl-10 pr-4 py-3 border rounded-xl focus:ring-2 focus:ring-offset-2 outline-none transition-all duration-300 ${
            error ? 'border-red-400' : 'border-gray-300 hover:border-gray-400'
          } ${inputClassName}`}
        />
      </div>
      {error ? (
        <p className="mt-1 text-xs text-red-500 font-medium">{error}</p>
      ) : (
        age !== null && <p className="mt-1 text-xs text-gray-500 font-medium">Age: {age} years</p>
      )}
    </div>
  );
};

export default DobInput;
