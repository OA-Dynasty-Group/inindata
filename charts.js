// charts.js - Visualization library for Line and Pie charts using Chart.js
// Supports both distribution (bar/pie) and trend (line) analysis

App.charts = {};

App.state.chartInstance = null;

/**
 * Generate trend data (aggregated by day/week based on date range)
 */
App.charts.generateTrendData = function(submissions, dateRange) {
  if (!submissions || !submissions.length) return { labels: [], datasets: [] };

  const days = parseInt(dateRange) || 30;
  const granularity = days <= 7 ? 'day' : days <= 90 ? 'week' : 'month';

  const grouped = {};
  submissions.forEach(submission => {
    const date = new Date(submission.submittedAt);
    let key;

    if (granularity === 'day') {
      key = date.toISOString().split('T')[0];
    } else if (granularity === 'week') {
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      key = weekStart.toISOString().split('T')[0];
    } else {
      key = date.toISOString().slice(0, 7);
    }

    grouped[key] = (grouped[key] || 0) + 1;
  });

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
};

/**
 * Render line chart (trends over time)
 */
App.charts.renderLineChart = function(canvas, trendData, title) {
  if (App.state.chartInstance) {
    App.state.chartInstance.destroy();
  }

  App.state.chartInstance = new Chart(canvas, {
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
};

/**
 * Render pie chart (distribution by category)
 */
App.charts.renderPieChart = function(canvas, aggregation) {
  if (App.state.chartInstance) {
    App.state.chartInstance.destroy();
  }

  const colors = [
    '#0c7458', '#4cb287', '#2d9a6b', '#1a5c3f', '#39b366',
    '#7dd4b0', '#1f7850', '#52c99e', '#0f4d38', '#2a8c5f'
  ];

  App.state.chartInstance = new Chart(canvas, {
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
};

/**
 * Clear chart and show bar chart instead
 */
App.charts.renderBarChartFromData = function(barElement, aggregation) {
  const maxValue = Math.max(...aggregation.groups.map(g => g.value), 1);
  barElement.innerHTML = aggregation.groups.map(group => {
    const percentage = (group.value / maxValue) * 100;
    return `<div class="bar" style="--value: ${percentage}">
      <span>${group.value}</span>
      <label>${group.label || '(empty)'}</label>
    </div>`;
  }).join('');
};

/**
 * Switch chart type and refresh
 */
App.charts.switchChartType = async function(chartType, aggregation, trendData) {
  const canvas = document.getElementById('chartCanvas');
  const barChart = document.getElementById('barChart');

  if (chartType === 'bar') {
    barChart.style.display = 'block';
    canvas.style.display = 'none';
    if (aggregation) {
      App.charts.renderBarChartFromData(barChart, aggregation);
    }
  } else if (chartType === 'pie') {
    barChart.style.display = 'none';
    canvas.style.display = 'block';
    if (aggregation) {
      App.charts.renderPieChart(canvas, aggregation);
    }
  } else if (chartType === 'line') {
    barChart.style.display = 'none';
    canvas.style.display = 'block';
    canvas.style.height = '350px';
    if (trendData) {
      App.charts.renderLineChart(canvas, trendData, 'Response Trends');
    }
  }
};
