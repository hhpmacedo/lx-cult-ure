const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const MESES_CURTOS = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];

export function formatDateRange(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const sDay = s.getDate();
  const eDay = e.getDate();
  const sMonth = MESES_CURTOS[s.getMonth()];
  const eMonth = MESES_CURTOS[e.getMonth()];

  if (sMonth === eMonth) {
    return `${sDay}–${eDay} ${sMonth} ${s.getFullYear()}`;
  }
  return `${sDay} ${sMonth} – ${eDay} ${eMonth} ${s.getFullYear()}`;
}

export function formatMonth(date: string): string {
  const d = new Date(date);
  return `${MESES[d.getMonth()]} ${d.getFullYear()}`;
}
