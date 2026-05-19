import { useEffect, useState } from 'react';
import { fmtNum, parseNum, getLocaleSettings } from '../api';

/**
 * CurrencyInput — text input that shows numbers in the user's chosen locale
 * (e.g. "1.234,56 €" for de-DE), parses input flexibly, and emits a real
 * number to `onChange`. No browser spinner controls — pure text input that
 * displays the formatted value on blur and the raw editable value on focus.
 *
 * Usage:
 *   <CurrencyInput value={revenue} onChange={(n) => setRevenue(n)} />
 */
export function CurrencyInput({
  value, onChange, disabled, placeholder, suffix, decimals = 2, style, className,
}: {
  value: number | null | undefined;
  onChange: (n: number) => void;
  disabled?: boolean;
  placeholder?: string;
  suffix?: string;
  decimals?: number;
  style?: React.CSSProperties;
  className?: string;
}) {
  const settings = getLocaleSettings();
  const currencySuffix = suffix === undefined
    ? (settings.currency === 'EUR' ? '€'
       : settings.currency === 'USD' ? '$'
       : settings.currency === 'GBP' ? '£'
       : settings.currency === 'CHF' ? 'CHF'
       : settings.currency)
    : suffix;

  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState('');

  // When not focused: show formatted; when focused: show editable raw.
  useEffect(() => {
    if (!focused) {
      setRaw(value == null || value === 0 ? '' : fmtNum(value, decimals));
    }
  }, [value, focused, decimals]);

  return (
    <div style={{ position: 'relative', display: 'inline-block', width: style?.width ?? '100%' }}>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className={className || 'form-input'}
        disabled={disabled}
        placeholder={placeholder || '0,00'}
        value={raw}
        onFocus={(e) => {
          setFocused(true);
          // Switch to raw editable: strip thousands separators for easier typing
          if (value != null && value !== 0) {
            setRaw(String(value).replace('.', settings.locale.startsWith('de') ? ',' : '.'));
          } else {
            setRaw('');
          }
          // Select all so the user can just start typing
          requestAnimationFrame(() => e.target.select());
        }}
        onBlur={() => {
          setFocused(false);
          const n = parseNum(raw);
          onChange(n);
          setRaw(n === 0 ? '' : fmtNum(n, decimals));
        }}
        onChange={(e) => setRaw(e.target.value)}
        style={{ textAlign: 'right', paddingRight: currencySuffix ? 28 : undefined, ...style }}
      />
      {currencySuffix && (
        <span
          aria-hidden
          style={{
            position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--ink3)', fontSize: 13, pointerEvents: 'none',
          }}
        >
          {currencySuffix}
        </span>
      )}
    </div>
  );
}
