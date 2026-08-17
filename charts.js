// charts.js - Visualization library for Line and Pie charts using Chart.js
// Supports both distribution (bar/pie) and trend (line) analysis

let chartInstance = null;

/**
 * Generate trend data (aggregated by day/week based on date range)
 */
function generateTrendData(submissions, dateRange) {
  if (!submissions || !submissions.length) return { labels: [], datasets: [] };

  // Determine aggregation granularity based on date range
  const days = parseInt(dateRange) || 30;
  const granularity = days <= 7 ? 'day' : days <= 90 ? 'week' : 'month';

  // Group submissions by time period
  const grouped = {};
  submissions.forEach(submission => {
    const date = new Date(submission.submittedAt);
    let key;

    if (granularity === 'day') {
      key = date.toISOString().split('T')[0]; // YYYY-MM-DD
    } else if (granularity === 'week') {
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      key = weekStart.toISOString().split('T')[0];
    } else {
      key = date.toISOString().slice(0, 7); // YYYY-MM
    }

    grouped[key] = (grouped[key] || 0) + 1;
  });

  // Convert to sorted arrays
  const labels = Object.keys(grouped).sort();
  const data = labels.map(label => grouped[label]);

  return {
    labels,
    datasets: [{
      label: 'Responses',
      data,
      borderColor: '#0c7458',
      backgroundColor: 'rgba(76, 178, 135, 0.1)',
      borderWidth: 2,
      fill: true,
      tension: 0.4
    }]
  };
}

/**
 * Render line chart (trends over time)
 */
function renderLineChart(canvas, trendData, title) {
  // Destroy previous chart if exists
  if (chartInstance) {
    chartInstance.destroy();
  }

  chartInstance = new Chart(canvas, {
    type: 'line',
    data: trendData,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top'
        },
        title: {
          display: false
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Number of responses'
          }
        },
        x: {
          title: {
            display: true,
            text: 'Date'
          }
        }
      }
    }
  });
}

/**
 * Render pie chart (distribution by category)
 */
function renderPieChart(canvas, aggregation) {
  // Destroy previous chart if exists
  if (chartInstance) {
    chartInstance.destroy();
  }

  const colors = [
    '#0c7458', '#4cb287', '#2d9a6b', '#1a5c3f', '#39b366',
    '#7dd4b0', '#1f7850', '#52c99e', '#0f4d38', '#2a8c5f'
  ];

  chartInstance = new Chart(canvas, {
    type: 'pie',
    data: {
      labels: aggregation.groups.map(g => g.label || '(empty)'),
      datasets: [{
        label: aggregation.dimension.label,
        data: aggregation.groups.map(g => g.value),
        backgroundColor: colors.slice(0, aggregation.groups.length),
        borderColor: '#fff',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            font: {
              size: 12
            },
            padding: 15
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = ((context.parsed / total) * 100).toFixed(1);
              return `${context.label}: ${context.parsed} (${percentage}%)`;
            }
          }
        }
      }
    }
  });
}

/**
 * Clear chart and show bar chart instead
 */
function renderBarChartFromData(barElement, aggregation) {
  const maxValue = Math.max(...aggregation.groups.map(g => g.value), 1);
  barElement.innerHTML = aggregation.groups.map(group => {
    const percentage = (group.value / maxValue) * 100;
    return `<div class="bar" style="--value: ${percentage}">
      <span>${group.value}</span>
      <label>${group.label || '(empty)'}</label>
    </div>`;
  }).join('');
}

/**
 * Switch chart type and refresh
 */
async function switchChartType(chartType, aggregation, trendData) {
  const canvas = document.getElementById('chartCanvas');
  const barChart = document.getElementById('barChart');

  if (chartType === 'bar') {
    barChart.style.display = 'block';
    canvas.style.display = 'none';
    if (aggregation) {
      renderBarChartFromData(barChart, aggregation);
    }
  } else if (chartType === 'pie') {
    barChart.style.display = 'none';
    canvas.style.display = 'block';
    if (aggregation) {
      renderPieChart(canvas, aggregation);
    }
  } else if (chartType === 'line') {
    barChart.style.display = 'none';
    canvas.style.display = 'block';
    canvas.style.height = '350px';
    if (trendData) {
      renderLineChart(canvas, trendData, 'Response Trends');
    }
  }
}

/**
 * Handle chart type changes
 */
document.addEventListener('DOMContentLoaded', () => {
  const chartTypeSelect = document.getElementById('chartTypeSelect');
  if (chartTypeSelect) {
    chartTypeSelect.addEventListener('change', (e) => {
      // Trigger analytics reload with new chart type
      const event = new CustomEvent('chartTypeChanged', { detail: { chartType: e.target.value } });
      window.dispatchEvent(event);
    });
  }
});
