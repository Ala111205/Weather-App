export function el(id) { return document.getElementById(id); }
export function showToast(msg, timeout=3000){
  const t=el('toast'); t.textContent=msg; t.classList.remove('hidden');
  setTimeout(()=>t.classList.add('hidden'), timeout);
}
export function formatTemp(val, isCelsius){ return `${val.toFixed(1)}° ${isCelsius?'C':'F'}`; }
export function parseLatLonInput(input){
  const parts = input.split(',').map(p=>p.trim());
  if (parts.length===2 && !isNaN(parseFloat(parts[0])) && !isNaN(parseFloat(parts[1]))) {
    return { lat: parseFloat(parts[0]), lon: parseFloat(parts[1]) };
  }
  return null;
}
