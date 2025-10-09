let chart;
export function renderTempChart(ctx, labels, temps, isC) {
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets:[{ label:'Temperature', data:temps, tension:0.3, fill:true }]},
    options: {
      scales: { y: { beginAtZero: false } },
      plugins: { legend: { display: false } }
    }
  });
}
