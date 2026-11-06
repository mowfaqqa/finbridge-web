const ngn = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 2 });
const dateLabel = new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const lagos = new Intl.DateTimeFormat('en-CA', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Africa/Lagos' });

export function formatMoney(kobo: string) {
  const amount = BigInt(kobo);
  const whole = amount / 100n;
  const fraction = ((amount < 0n ? -amount : amount) % 100n).toString().padStart(2, '0');
  return ngn.formatToParts(whole === 0n && amount < 0n ? -0 : whole)
    .map((part) => part.type === 'fraction' ? fraction : part.value)
    .join('');
}

export function decimalToKobo(input: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(input.trim())) return null;
  const [whole, fraction = ''] = input.trim().split('.');
  return BigInt(whole + fraction.padEnd(2, '0')).toString();
}

export function koboToDecimal(input: string) {
  const value = input.padStart(3, '0');
  return `${value.slice(0, -2)}.${value.slice(-2)}`;
}

export const formatDate = (value: string) => dateLabel.format(new Date(`${value}T00:00:00Z`));
export const todayInLagos = () => lagos.format(new Date());

const lagosTime = new Intl.DateTimeFormat('en-NG', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Lagos',
});
const monthLabel = new Intl.DateTimeFormat('en-NG', { month: 'short', year: 'numeric', timeZone: 'UTC' });
export const formatTime = (value: string) => lagosTime.format(new Date(value)) + ' WAT';
export const formatMonth = (value: string) => monthLabel.format(new Date(`${value}-01T00:00:00Z`));
